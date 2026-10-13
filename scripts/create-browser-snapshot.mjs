// One-time setup for "render and test" (docs/github.md): prepares a Vercel
// Sandbox snapshot with agent-browser, Chrome and ffmpeg (for recordings), so
// each run boots a ready browser in seconds instead of installing it.
//
// Run once (and again after upgrading @agent-browser/sandbox):
//   VERCEL_TOKEN=... VERCEL_TEAM_ID=... VERCEL_PROJECT_ID=... node scripts/create-browser-snapshot.mjs
// Then set the printed id as AGENT_BROWSER_SNAPSHOT_ID in Vercel.
// The token is read from the environment only; it is never printed.
import { Sandbox } from '@vercel/sandbox';
import { getSandboxCredentials, installAgentBrowserInVercelSandbox } from '@agent-browser/sandbox/vercel';

const creds = getSandboxCredentials();
if (!creds.token) {
  console.error('Set VERCEL_TOKEN, VERCEL_TEAM_ID and VERCEL_PROJECT_ID first.');
  process.exit(1);
}
const step = ({ status, step: name }) => { if (status !== 'running') console.log(`${status === 'done' ? 'done ' : 'FAILED'}  ${name}`); };
const sandbox = await Sandbox.create({ ...creds, runtime: 'node24', timeout: 900_000 });
try {
  await installAgentBrowserInVercelSandbox(sandbox, { onStep: step });
  // Recordings need ffmpeg on PATH: a static build from npm.
  for (const [cmd, args] of [
    ['npm', ['install', '-g', 'ffmpeg-static@5']],
    ['sh', ['-c', 'sudo ln -sf "$(npm root -g)/ffmpeg-static/ffmpeg" /usr/local/bin/ffmpeg && ffmpeg -version | head -1']]
  ]) {
    const r = await sandbox.runCommand(cmd, args);
    if (r.exitCode !== 0) throw new Error(`${cmd} failed: ${(await r.stderr()).slice(0, 300)}`);
    console.log('done  ', cmd, args[0]);
  }
  const { snapshotId } = await sandbox.snapshot();
  console.log('\nAGENT_BROWSER_SNAPSHOT_ID=' + snapshotId);
} catch (err) {
  console.error('Setup failed:', err.message);
  try { await sandbox.stop(); } catch { /* already stopped */ }
  process.exit(1);
}
