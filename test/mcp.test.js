import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcp, createMcpClient, parseRpcResponse } from '../src/mcp/index.js';
import { createToolRegistry, ToolError } from '../src/tools/registry.js';
import { testConfig } from './helpers.js';

const OWNER = { tenantId: 't', actor: { type: 'user', id: 'u-owner', email: 'owner@example.com' } };
const PERSON = { tenantId: 't', actor: { type: 'user', id: 'u-2', email: 'someone@example.com' } };
const GUEST = { tenantId: 't', actor: { type: 'guest', id: 'g' } };

// A fake MCP server over the connector transport shape: { status, type, text, headers }.
function fakeServer({ sse = false, expireOnce = false } = {}) {
  const seen = [];
  let expired = !expireOnce;
  const reply = (id, result) => sse
    ? { status: 200, type: 'text/event-stream', text: 'event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n\n', headers: {} }
    : { status: 200, type: 'application/json', text: JSON.stringify({ jsonrpc: '2.0', id, result }), headers: {} };
  const call = async ({ url, headers, body }) => {
    seen.push({ url, headers, body });
    if (body.method === 'initialize') return { ...reply(body.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake' } }), headers: { 'mcp-session-id': 'sess-' + seen.length } };
    if (body.method === 'notifications/initialized') return { status: 202, type: '', text: '', headers: {} };
    if (!expired && body.method === 'tools/list') { expired = true; return { status: 404, type: 'application/json', text: '{}', headers: {} }; }
    if (body.method === 'tools/list') return reply(body.id, { tools: [
      { name: 'search_docs', description: 'Search docs', inputSchema: { properties: { query: { type: 'string' } }, required: ['query'] }, annotations: { readOnlyHint: true } },
      { name: 'create_ticket', description: 'Create a ticket', inputSchema: { properties: { title: { type: 'string' } }, required: ['title'] } },
      { name: 'bad name!', description: 'ignored' }
    ] });
    if (body.method === 'tools/call') return reply(body.id, { content: [{ type: 'text', text: 'result for ' + body.params.name + ' ' + JSON.stringify(body.params.arguments) }, { type: 'image', data: 'xx' }] });
    return { status: 400, type: 'application/json', text: '{}', headers: {} };
  };
  return { call, seen };
}

const configWith = (servers, ownerEmails = ['owner@example.com']) => ({ mcp: { servers }, ownerConsole: { enabled: true, emails: ownerEmails } });
const SERVER = { name: 'docs', url: 'https://mcp.example.com/mcp', token: 'server-token-123456', access: 'owner', readOnly: [] };

test('parses JSON and SSE JSON-RPC responses and surfaces server errors', () => {
  assert.deepEqual(parseRpcResponse({ type: 'application/json', text: '{"jsonrpc":"2.0","id":3,"result":{"ok":true}}' }, 3), { ok: true });
  assert.deepEqual(parseRpcResponse({ type: 'text/event-stream', text: 'data: {"jsonrpc":"2.0","method":"note"}\n\ndata: {"jsonrpc":"2.0","id":4,"result":{"x":1}}\n\n' }, 4), { x: 1 });
  assert.throws(() => parseRpcResponse({ type: 'application/json', text: '{"jsonrpc":"2.0","id":5,"error":{"message":"nope"}}' }, 5), /refused: nope/);
  assert.throws(() => parseRpcResponse({ type: 'application/json', text: 'not json' }, 1), /did not answer with JSON/);
});

test('client handshakes once, sends the session and token, lists tools and recovers an expired session', async () => {
  for (const sse of [false, true]) {
    const fake = fakeServer({ sse, expireOnce: true });
    const client = createMcpClient({ server: SERVER, call: fake.call });
    const tools = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name), ['search_docs', 'create_ticket']);
    assert.equal(tools[0].readOnly, true);
    assert.equal(tools[1].readOnly, false);
    assert.equal(fake.seen.filter((r) => r.body.method === 'initialize').length, 2, 're-initialized after the session expired');
    const listCall = fake.seen.filter((r) => r.body.method === 'tools/list').at(-1);
    assert.equal(listCall.headers.Authorization, 'Bearer server-token-123456');
    assert.match(listCall.headers['Mcp-Session-Id'], /^sess-/);
    assert.equal(listCall.headers['MCP-Protocol-Version'], '2025-06-18');
    const out = await client.callTool('search_docs', { query: 'x' });
    assert.match(out.text, /result for search_docs/);
    assert.match(out.text, /\[image content not shown\]/);
  }
});

test('MCP tools are owner-only by default, read tools refuse write tools, and writes need Confirm', async () => {
  const fake = fakeServer();
  const mcp = createMcp({ config: configWith([SERVER]), call: fake.call });
  const registry = createToolRegistry({ tools: mcp.tools });
  assert.deepEqual(registry.specsFor(OWNER).map((s) => s.function.name), ['mcp_list_tools', 'mcp_read_tool', 'mcp_run_tool']);
  assert.deepEqual(registry.specsFor(PERSON), [], 'other signed-in people do not get owner servers');
  assert.deepEqual(registry.specsFor(GUEST), []);

  const listed = await registry.run(OWNER, 'mcp_list_tools', {});
  assert.equal(listed.servers[0].tools.length, 2);
  const read = await registry.run(OWNER, 'mcp_read_tool', { server: 'docs', tool: 'search_docs', arguments_json: '{"query":"refunds"}' });
  assert.equal(read.untrusted, true);
  assert.match(read.text, /refunds/);
  assert.equal(JSON.stringify(read).includes('server-token'), false, 'the server token never reaches the model');

  await assert.rejects(registry.run(OWNER, 'mcp_read_tool', { server: 'docs', tool: 'create_ticket', arguments_json: '{"title":"x"}' }), (e) => e instanceof ToolError && e.code === 'failed');
  await assert.rejects(registry.run(OWNER, 'mcp_run_tool', { server: 'docs', tool: 'create_ticket', arguments_json: '{"title":"x"}' }), (e) => e.code === 'needs_confirmation');
  const done = await registry.run(OWNER, 'mcp_run_tool', { server: 'docs', tool: 'create_ticket', arguments_json: '{"title":"Printer broken"}' }, { confirmed: true });
  assert.match(done.text, /create_ticket/);
  await assert.rejects(registry.run(OWNER, 'mcp_run_tool', { server: 'docs', tool: 'create_ticket', arguments_json: '{}' }, { confirmed: true }), (e) => e.code === 'failed', 'required inputs are checked');
  await assert.rejects(registry.run(OWNER, 'mcp_read_tool', { server: 'docs', tool: 'search_docs', arguments_json: '[1]' }), (e) => e.code === 'failed');
  await assert.rejects(registry.run(PERSON, 'mcp_read_tool', { server: 'docs', tool: 'search_docs', arguments_json: '{"query":"x"}' }), (e) => e.code === 'not_allowed');
  await assert.rejects(registry.run(OWNER, 'mcp_read_tool', { server: 'other', tool: 'search_docs' }), (e) => e.code === 'invalid_arguments');
});

test('a server opened to users is available to every signed-in person but never to guests', () => {
  const mcp = createMcp({ config: configWith([{ ...SERVER, access: 'users' }], []), call: fakeServer().call });
  const registry = createToolRegistry({ tools: mcp.tools });
  assert.equal(registry.specsFor(PERSON).length, 3);
  assert.equal(registry.specsFor(GUEST).length, 0);
  assert.equal(mcp.mentions('Search our docs server via MCP'), true);
  assert.equal(mcp.mentions('Use the docs tool'), true);
  assert.equal(mcp.mentions('What is the weather?'), false);
});

test('no MCP servers configured: no tools and no mentions', () => {
  const mcp = createMcp({ config: configWith([]) });
  assert.equal(mcp.available, false);
  assert.deepEqual(mcp.tools, []);
  assert.equal(mcp.mentions('mcp'), false);
});

test('MCP_SERVERS config: valid entries load, bad ones are skipped with a warning, tokens come from their own env var', () => {
  const cfg = testConfig({
    MCP_SERVERS: JSON.stringify([
      { name: 'docs', url: 'https://mcp.example.com/mcp', token_env: 'MCP_DOCS_TOKEN', read_only: ['search_docs'] },
      { name: 'open', url: 'https://open.example.com/mcp', access: 'users' },
      { name: 'Bad Name', url: 'https://x.example.com' },
      { name: 'plain', url: 'http://insecure.example.com/mcp' },
      { name: 'notoken', url: 'https://y.example.com/mcp', token_env: 'MCP_MISSING' }
    ]),
    MCP_DOCS_TOKEN: 'secret-token-abcdef'
  });
  assert.deepEqual(cfg.mcp.servers.map((s) => [s.name, s.access, s.readOnly.length]), [['docs', 'owner', 1], ['open', 'users', 0]]);
  assert.equal(cfg.mcp.servers[0].token, 'secret-token-abcdef');
  assert.ok(cfg.warnings.some((w) => /MCP_SERVERS \(Bad Name\)/.test(w)));
  assert.ok(cfg.warnings.some((w) => /MCP_SERVERS \(plain\): url/.test(w)));
  assert.ok(cfg.warnings.some((w) => /MCP_MISSING is not set/.test(w)));
  assert.ok(testConfig({ MCP_SERVERS: 'not json' }).warnings.some((w) => /MCP_SERVERS: a JSON array/.test(w)));
  assert.deepEqual(testConfig({}).mcp.servers, []);
});
