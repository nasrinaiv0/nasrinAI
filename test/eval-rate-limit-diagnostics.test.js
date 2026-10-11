import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSuite } from '../scripts/eval/run.js';

test('live eval reports safe 429 diagnostics and stops sending requests', async () => {
  let calls = 0;
  const logs = [];
  const fetchImpl = async (_url, init = {}) => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify({ token: 'nsg_test-token' }), { status: 200 });
    if (calls === 2) return new Response(JSON.stringify({ actor: { type: 'guest' } }), { status: 200 });
    if (calls === 3) return new Response(JSON.stringify({ error: { code: 'rate_limited' }, request_id: 'req-test' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '3600' }
    });
    throw new Error('runner should stop after the first 429');
  };
  const suite = { name: 'quality', cases: [
    { id: 'first', message: 'one' },
    { id: 'second', message: 'two' },
    { id: 'third', message: 'three' }
  ] };

  const report = await runSuite({ suite, url: 'https://www.nasrinai.com', fetchImpl, log: (line) => logs.push(line) });

  assert.equal(calls, 3, 'no more chat requests after rate limiting');
  assert.equal(report.total, 3);
  assert.equal(report.passed, 0);
  assert.deepEqual(report.results[0], {
    id: 'first', ok: false, status: 429, code: 'rate_limited',
    request_id: 'req-test', retry_after: '3600',
    fails: ['HTTP 429 rate_limited']
  });
  assert.equal(report.results[1].skipped, true);
  assert.equal(report.results[2].skipped, true);
  assert.ok(logs.some((line) => line.includes('Retry-After: 3600')));
  assert.ok(!logs.some((line) => line.includes('nsg_test-token')), 'never log guest token');
});
