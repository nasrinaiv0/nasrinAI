import { test } from 'node:test';
import assert from 'node:assert/strict';

const enabled = process.env.RUN_SANDBOX_INTEGRATION === '1';
const hasOidc = Boolean(process.env.VERCEL_OIDC_TOKEN);
const hasAccessTokenConfig = Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID);
const skipReason = !enabled
  ? 'SKIP: set RUN_SANDBOX_INTEGRATION=1 to run the real Vercel Sandbox integration test'
  : !hasOidc && !hasAccessTokenConfig
    ? 'SKIP: integration enabled but neither VERCEL_OIDC_TOKEN nor the complete VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID configuration is present'
    : false;

test('real Vercel Sandbox starts and executes node --version', { skip: skipReason }, async () => {
  const { Sandbox } = await import('@vercel/sandbox');
  let sandbox;
  try {
    sandbox = await Sandbox.create({
      ...(!hasOidc ? {
        token: process.env.VERCEL_TOKEN,
        teamId: process.env.VERCEL_TEAM_ID,
        projectId: process.env.VERCEL_PROJECT_ID
      } : {}),
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
