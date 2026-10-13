import { test } from 'node:test';
import assert from 'node:assert/strict';

const enabled = process.env.RUN_SANDBOX_INTEGRATION === '1';
const skipReason = !enabled
  ? 'SKIP: set RUN_SANDBOX_INTEGRATION=1 to run the real Vercel Sandbox integration test'
  : !process.env.VERCEL_OIDC_TOKEN
    ? 'SKIP: RUN_SANDBOX_INTEGRATION=1 but VERCEL_OIDC_TOKEN is missing'
    : false;

test('real Vercel Sandbox starts and executes node --version', { skip: skipReason }, async () => {
  const { Sandbox } = await import('@vercel/sandbox');
  let sandbox;
  try {
    sandbox = await Sandbox.create({
      runtime: 'node22',
      timeout: 70_000,
      persistent: false,
      networkPolicy: { allow: [] }
    });
    const result = await sandbox.runCommand({ cmd: 'node', args: ['--version'] });
    const stdout = await result.stdout();
    assert.equal(result.exitCode, 0, 'node --version failed: ' + stdout);
    assert.match(stdout, /v\d+\.\d+\.\d+/);
  } finally {
    if (sandbox) await sandbox.stop();
  }
});
