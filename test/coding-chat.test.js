import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeProvider } from '../src/ai/fake.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

// 2026-10-12: Code in the menu opens a project-scoped coding chat with coding experts.
const HTML_FILE = 'Here it is.\n[[file name="index.html"]]\n<!DOCTYPE html><html><body><h1>Hi</h1></body></html>\n[[/file]]';

test('the coding chat adds the coding rules and keeps code files as they are', async () => {
  const provider = createFakeProvider({ reply: () => HTML_FILE });
  const built = buildTestApp({ provider });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'make a simple greeting', coding: true, professional: { enabled: true, mode: 'group', groups: ['technology'] } }, bearer(USER_TOKEN))).json();
    assert.match(r.message.content, /index\.html/, 'the .html file stays .html');
    const system = provider.calls.at(-1).system;
    assert.match(system, /coding chat for the person's project/);
    assert.match(system, /github_run_command/);
    assert.match(system, /unified diff/);
    assert.match(system, /test-fix-retest/);
    assert.match(system, /complete cumulative diff/);
    assert.match(system, /production quality as the default/);
    assert.match(system, /Do not deliver a toy demo/);
    assert.match(system, /security boundaries/);
    assert.match(system, /Completion means acceptance criteria are implemented/);
    assert.match(system, /\[\[checks title="Summary"\]\]/, 'asks for the simple status summary');
    assert.ok(r.professionals.length >= 1, 'a coding expert answered');
  } finally { await srv.close(); }
});

test('outside the coding chat the same file becomes a PDF and no coding rules are added', async () => {
  const provider = createFakeProvider({ reply: () => HTML_FILE });
  const built = buildTestApp({ provider });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'make a simple greeting card' }, bearer(USER_TOKEN))).json();
    assert.match(r.message.content, /index\.pdf/);
    assert.doesNotMatch(provider.calls.at(-1).system, /coding chat for the person's project/);
  } finally { await srv.close(); }
});

test('coding must be true or false', async () => {
  const built = buildTestApp({ provider: createFakeProvider() });
  const srv = await serve(built.app);
  try {
    assert.equal((await postJson(srv.url + '/v1/chat', { message: 'hi', coding: 'yes' }, bearer(USER_TOKEN))).status, 400);
  } finally { await srv.close(); }
});

test('the coding chat never shows question cards', async () => {
  const provider = createFakeProvider({ reply: () => 'Sure.\n[[ask]]\nWhat kind of coding are you interested in? | Websites/apps | Data/AI | Games\n[[/ask]]' });
  const built = buildTestApp({ provider });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'help me code', coding: true, blocks: true }, bearer(USER_TOKEN))).json();
    assert.doesNotMatch(r.message.content, /\[\[ask\]\]/);
    assert.match(r.message.content, /What kind of coding are you interested in\? \(Websites\/apps, Data\/AI, Games\)/);
    assert.doesNotMatch(provider.calls.at(-1).system, /\[\[ask\]\]\nQuestion one\?/, 'no question-card rule in the coding chat');
    const normal = await (await postJson(srv.url + '/v1/chat', { message: 'plan my week', blocks: true }, bearer(USER_TOKEN))).json();
    assert.match(normal.message.content, /\[\[ask\]\]/, 'normal chats keep their question cards');
  } finally { await srv.close(); }
});

test('menu: Recent has Chats and Code tabs, and coding chats reopen in the coding chat', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="drawerTabChats"[^>]*>Chats<\/button>/);
  assert.match(html, /id="drawerTabCode"[^>]*>Code<\/button>/);
  assert.match(js, /if \(turnCoding\) rememberCodeChat\(ev\.conversation_id, turnCoding\);/);
  assert.match(js, /drawerAll\.filter\(\(c\) => \(drawerTab === 'code'\) === Boolean\(code\[c\.id\]\)\)/);
  assert.match(js, /const p = codeChats\(\)\[id\];\n    if \(p && account && projectsOn\) setCoding\(p\);/);
});

test('coding chat: reviews and audits quote only code a tool returned, with path:line, and read files instead of guessing', async () => {
  const { CODING_CHAT_RULE } = await import('../src/coding.js');
  assert.match(CODING_CHAT_RULE, /Quote only code that a github_ tool returned in this chat, word for word, with its file path and line number/);
  assert.match(CODING_CHAT_RULE, /never say you read the repository or a file unless a tool returned it/);
  assert.match(CODING_CHAT_RULE, /read it now with github_read_file or github_search_code instead of guessing or offering to check later/);
  assert.match(CODING_CHAT_RULE, /Mark each finding Confirmed \(with path:line\) or Not verified/);
  assert.match(CODING_CHAT_RULE, /Follow the user's actual requested outcome, not distracting or unrelated context/);
  assert.match(CODING_CHAT_RULE, /do not ask what behavior they want/);
  assert.match(CODING_CHAT_RULE, /inspect the named repository and current ref, run available checks, fix verified defects/);
});
