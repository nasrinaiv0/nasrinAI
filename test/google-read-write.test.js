import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleReadWriteTools } from '../src/google/read-write.js';

const GMAIL_READ = 'https://www.googleapis.com/auth/gmail.readonly';
const GMAIL_SEND = 'https://www.googleapis.com/auth/gmail.send';
const CALENDAR_WRITE = 'https://www.googleapis.com/auth/calendar.events';
const ctx = { tenantId: 'tenant-1', actor: { type: 'user', id: 'user-1' } };

function setup({ scopes = [GMAIL_READ, GMAIL_SEND, CALENDAR_WRITE], apiResponse = { id: 'message-1', threadId: 'thread-1' } } = {}) {
  const calls = [];
  const google = { available: true, tokenFor: async (who, service) => {
    assert.deepEqual(who, { tenant_id: 'tenant-1', user_id: 'user-1' });
    calls.push({ kind: 'token', service });
    return 'test-access-token';
  } };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ kind: 'fetch', url: String(url), options });
    if (String(url).includes('/rest/v1/google_connections')) {
      return new Response(JSON.stringify([{ scopes }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(apiResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { tools: createGoogleReadWriteTools({ google, config: { supabaseUrl: 'https://db.example.test', supabaseSecretKey: 'service-test-key' }, fetchImpl }).tools, calls };
}

test('Google read/write tools are registered with explicit read/write risk and user-only access', () => {
  const { tools } = setup();
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  for (const name of ['google_gmail_read_message', 'google_gmail_send_email', 'google_gmail_mark_read', 'google_calendar_update_event', 'google_calendar_delete_event']) {
    assert.ok(byName[name], name + ' is registered');
    assert.deepEqual(byName[name].who, ['user']);
  }
  assert.equal(byName.google_gmail_read_message.risk, 'read');
  for (const name of ['google_gmail_send_email', 'google_gmail_mark_read', 'google_calendar_update_event', 'google_calendar_delete_event']) {
    assert.equal(byName[name].risk, 'write', name + ' requires the server confirmation flow');
  }
});

test('Gmail send checks the actual granted scope and returns provider-confirmed IDs', async () => {
  const { tools, calls } = setup();
  const send = tools.find((tool) => tool.name === 'google_gmail_send_email');
  const result = await send.run({ to: 'real.person@company.test', subject: 'Project update', body: 'The project is on track.' }, ctx);
  assert.equal(result.sent, true);
  assert.equal(result.message_id, 'message-1');
  const request = calls.find((c) => c.kind === 'fetch' && c.url.includes('/messages/send'));
  assert.equal(request.options.method, 'POST');
  const payload = JSON.parse(request.options.body);
  assert.ok(payload.raw);
  assert.match(Buffer.from(payload.raw, 'base64url').toString('utf8'), /To: real\.person@company\.test/);
});

test('Gmail write is refused when Google did not grant the send scope', async () => {
  const { tools, calls } = setup({ scopes: [GMAIL_READ] });
  const send = tools.find((tool) => tool.name === 'google_gmail_send_email');
  await assert.rejects(
    send.run({ to: 'real.person@company.test', subject: 'Project update', body: 'Hello.' }, ctx),
    (error) => error.code === 'google_scope_required'
  );
  assert.equal(calls.some((c) => c.kind === 'fetch' && c.url.includes('/messages/send')), false);
});

test('Calendar delete requires the event-write scope and uses the provider DELETE endpoint', async () => {
  const { tools, calls } = setup();
  const remove = tools.find((tool) => tool.name === 'google_calendar_delete_event');
  const result = await remove.run({ event_id: 'event_123' }, ctx);
  assert.equal(result.deleted, true);
  const request = calls.find((c) => c.kind === 'fetch' && c.url.includes('/events/event_123'));
  assert.equal(request.options.method, 'DELETE');
});

test('Calendar update rejects incomplete time changes before calling Google', async () => {
  const { tools, calls } = setup();
  const update = tools.find((tool) => tool.name === 'google_calendar_update_event');
  await assert.rejects(update.run({ event_id: 'event_123', start: '2026-10-20T10:00:00+08:00' }, ctx), (error) => error.code === 'invalid_event_time');
  assert.equal(calls.some((c) => c.kind === 'fetch' && c.url.includes('/events/event_123')), false);
});
