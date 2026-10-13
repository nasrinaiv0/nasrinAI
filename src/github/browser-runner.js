import { inspectCodingArchive, parseCodingCommand } from './runner.js';

// Render, test and show (docs/github.md, "Browser render, test, and
// screenshot"). For a signed-in person's own connected repository:
//
// 1. App sandbox (Vercel Sandbox, disposable): the archive is checked, then
//    extracted; dependencies install from the npm registry only, with
//    lifecycle scripts off; then the network is closed; the person's test
//    command runs; the preview server starts on a temporary sandbox address.
// 2. Browser sandbox (agent-browser, booted from a prepared snapshot so it
//    starts in seconds): opens only that preview address, reads the title and
//    accessibility snapshot, records a short scroll-through video, and takes
//    a screenshot.
// 3. The screenshot is saved as a picture and the recording as a video, both
//    owned by the person and tied to this chat; the chat shows them under the
//    reply. Only small text (exit code, trimmed output, ids) goes back to the
//    model.
//
// Nothing is deployed, pushed or merged. Both sandboxes are stopped at the end.

const ROOT = '/vercel/sandbox';
const WORKSPACE = `${ROOT}/repo`;
const ARCHIVE_PATH = `${ROOT}/source.tar.gz`;
const SHOT_PATH = '/tmp/nasrin-shot.jpg';
const VIDEO_PATH = '/tmp/nasrin-take.webm';
const MAX_SCREENSHOT_BYTES = 1_500_000;
const MAX_VIDEO_BYTES = 6_000_000;
const MAX_TEXT = 1500;
const VIEWPORTS = { desktop: ['1280', '800'], phone: ['390', '844'] };

const trim = (value, max = MAX_TEXT) => {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max) + '\n[output truncated]' : text;
};

function safeError(stage, error) {
  const name = String(error?.name || 'Error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'Error';
  const message = String(error?.message || 'Unknown failure')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REMOVED]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,})\b/g, '[redacted]')
    .replace(/https?:\/\/\S+/gi, '[url redacted]')
    .replace(/[\r\n\t]+/g, ' ').slice(0, 160);
  return { stage, name, message };
}

async function appCommand(sandbox, cmd, args = [], cwd = WORKSPACE) {
  const result = await sandbox.runCommand({ cmd, args, cwd });
  return { exitCode: result.exitCode, stdout: trim(await result.stdout()), stderr: trim(await result.stderr()) };
}

// A file inside the browser sandbox, as bytes (read through base64).
async function readSandboxFile(sandbox, path, max) {
  const result = await sandbox.runCommand('base64', ['-w', '0', path]);
  if (result.exitCode !== undefined && result.exitCode !== 0) return null;
  const text = String(await result.stdout()).replace(/\s/g, '');
  if (!text || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  const bytes = Buffer.from(text, 'base64');
  return bytes.length > 0 && bytes.length <= max ? bytes : null;
}

const isJpeg = (b) => b && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPng = (b) => b && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isWebm = (b) => b && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;

export function createBrowserTestRunner({
  downloadArchive, defaultBranch, tokenFor, store, logger = null, snapshotId = null,
  createAppSandbox = null, createBrowserSandbox = null, browserCommand = null
}) {
  async function defaults() {
    const [{ Sandbox }, browser] = await Promise.all([
      import('@vercel/sandbox'),
      import('@agent-browser/sandbox/vercel')
    ]);
    return {
      createAppSandbox: (options) => Sandbox.create(options),
      createBrowserSandbox: (options) => browser.createAgentBrowserSandbox(options),
      browserCommand: browser.runAgentBrowserCommand
    };
  }
  const injected = Boolean(createAppSandbox && createBrowserSandbox && browserCommand);

  return {
    async run(input, ctx) {
      if (ctx?.actor?.type !== 'user' || !ctx.actor.id || !ctx.tenantId) {
        return { error: 'sign_in_required', message: 'Sign in and connect GitHub to render and test repository code.' };
      }
      // Without a prepared browser snapshot the browser would install Chrome on
      // every run (minutes): refuse at once instead of timing out.
      if (!injected && !snapshotId) {
        return { error: 'browser_not_set_up', message: 'The browser for render and test is not set up yet (AGENT_BROWSER_SNAPSHOT_ID). No repository code was executed.' };
      }
      let testCommand, startCommand, port;
      try {
        testCommand = parseCodingCommand(input?.test_command || 'npm test');
        startCommand = parseCodingCommand(input?.start_command || 'npm run dev -- --host 0.0.0.0 --port 3000');
        port = Number(input?.port || 3000);
        if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Choose a preview port between 1024 and 65535.');
      } catch (error) {
        return { error: 'invalid_arguments', message: error.message };
      }
      const viewport = input?.viewport === 'phone' ? 'phone' : 'desktop';
      const wantVideo = input?.record_video !== false;
      const repo = String(input?.repo || '').trim();
      const refInput = String(input?.ref || '').trim();
      if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) ||
          refInput.length > 200 || (refInput && !/^(?!.*\.\.)(?!\/)[A-Za-z0-9._/-]{1,200}$/.test(refInput))) {
        return { error: 'invalid_arguments', message: 'Choose a valid repository and branch or commit.' };
      }
      try {
        const limit = await store.rateHit(`ghbrowser:${ctx.tenantId}:${ctx.actor.id}`, 3600, 3);
        if (!limit?.allowed) return { error: 'rate_limited', message: 'Render and test is limited to 3 runs per hour. Try again later.' };
      } catch {
        return { error: 'rate_limit_unavailable', message: 'The browser runner is temporarily unavailable.' };
      }
      const token = await tokenFor(ctx).catch(() => null);
      if (!token) return { error: 'github_not_connected', message: 'Connect GitHub first in Plugins → GitHub.' };
      let ref = refInput;
      try { if (!ref) ref = await defaultBranch(token, repo); }
      catch { return { error: 'default_branch_unavailable', message: 'Nasrin could not determine the default branch. Specify a branch or commit.' }; }
      let archive;
      try { archive = await downloadArchive(token, repo, ref); }
      catch { return { error: 'source_unavailable', message: 'Could not fetch this repository snapshot with the connected GitHub account.' }; }
      try { inspectCodingArchive(archive); }
      catch (error) { return { error: 'repository_too_large', message: trim(error.message) }; }

      let deps;
      try { deps = injected ? { createAppSandbox, createBrowserSandbox, browserCommand } : await defaults(); }
      catch { return { error: 'browser_runtime_unavailable', message: 'Browser automation is not installed in this deployment. No repository code was executed.' }; }

      const started = Date.now();
      let appSandbox;
      let stage = 'sandbox_create';
      try {
        appSandbox = await deps.createAppSandbox({
          runtime: 'node22', timeout: 150_000, ports: [port],
          networkPolicy: { allow: ['registry.npmjs.org'] }
        });
        stage = 'workspace_write';
        await appSandbox.writeFiles([{ path: ARCHIVE_PATH, content: archive }]);
        let result = await appCommand(appSandbox, 'mkdir', ['-p', WORKSPACE], ROOT);
        if (result.exitCode !== 0) throw Error('Could not create the isolated workspace.');
        stage = 'snapshot_extract';
        result = await appCommand(appSandbox, 'tar', ['--no-same-owner', '--no-same-permissions', '-xzf', ARCHIVE_PATH, '--strip-components=1', '-C', WORKSPACE], ROOT);
        if (result.exitCode !== 0) throw Error('The repository snapshot could not be extracted.');

        stage = 'dependency_detect';
        const pkg = await appCommand(appSandbox, 'test', ['-f', 'package.json'], WORKSPACE);
        if (pkg.exitCode === 0) {
          const lock = await appCommand(appSandbox, 'test', ['-f', 'package-lock.json'], WORKSPACE);
          stage = 'dependency_install';
          result = await appCommand(appSandbox, 'npm', lock.exitCode === 0
            ? ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
            : ['install', '--ignore-scripts', '--no-audit', '--no-fund'], WORKSPACE);
          if (result.exitCode !== 0) return {
            error: 'dependency_install_failed', stage, exit_code: result.exitCode,
            stdout: result.stdout, stderr: result.stderr,
            message: 'Dependencies could not be installed with lifecycle scripts disabled.'
          };
        }

        stage = 'network_restrict';
        if (typeof appSandbox.updateNetworkPolicy !== 'function') throw Error('App sandbox cannot enforce the required network restriction.');
        await appSandbox.updateNetworkPolicy({ allow: [] });

        stage = 'test_execute';
        const test = await appCommand(appSandbox, testCommand.executable, testCommand.args, WORKSPACE);

        stage = 'server_start';
        const launcher = `import { spawn } from 'node:child_process';
const child = spawn(${JSON.stringify(startCommand.executable)}, ${JSON.stringify(startCommand.args)}, {
  cwd: ${JSON.stringify(WORKSPACE)}, detached: true, stdio: 'ignore',
  env: { ...process.env, PORT: ${JSON.stringify(String(port))}, HOST: '0.0.0.0', HOSTNAME: '0.0.0.0' }
});
child.unref();
const deadline = Date.now() + 25000;
let ready = false;
while (Date.now() < deadline) {
  try { const r = await fetch('http://127.0.0.1:' + ${JSON.stringify(String(port))} + '/'); if (r.status < 500) { ready = true; break; } } catch {}
  await new Promise(resolve => setTimeout(resolve, 300));
}
if (!ready) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} process.exit(2); }
`;
        await appSandbox.writeFiles([{ path: `${WORKSPACE}/.nasrin-browser-launcher.mjs`, content: Buffer.from(launcher) }]);
        const launch = await appCommand(appSandbox, 'node', ['.nasrin-browser-launcher.mjs'], WORKSPACE);
        if (launch.exitCode !== 0) return {
          error: 'preview_start_failed', stage, exit_code: launch.exitCode,
          test: { exit_code: test.exitCode, stdout: test.stdout, stderr: test.stderr },
          message: 'The local preview server did not become ready. Check the start command and port.'
        };
        const previewUrl = appSandbox.domain(port);
        if (typeof previewUrl !== 'string' || !/^https:\/\//.test(previewUrl)) throw Error('The sandbox did not provide a secure temporary preview URL.');

        stage = 'browser_open';
        const previewHost = new URL(previewUrl).hostname;
        // Booted from the prepared snapshot (agent-browser and Chrome already
        // installed): it may reach only the preview address.
        const browserSandbox = await deps.createBrowserSandbox({
          timeout: 120_000,
          ...(snapshotId ? { snapshotId } : {}),
          createOptions: { networkPolicy: { allow: [previewHost] } }
        });
        let browser;
        let shot = null;
        let video = null;
        try {
          const cmd = (args, opts) => deps.browserCommand(browserSandbox, args, opts);
          await cmd(['set', 'viewport', ...VIEWPORTS[viewport]], { json: false }).catch(() => {});
          await cmd(['open', previewUrl], { json: false });
          await cmd(['wait', '1500'], { json: false }).catch(() => {});
          stage = 'browser_inspect';
          const titleResult = await cmd(['get', 'title']).catch(() => null);
          const snapshotResult = await cmd(['snapshot', '-i', '-c'], { json: false }).catch(() => null);
          if (wantVideo) {
            // A short scroll-through recording; skipped quietly if the browser
            // cannot record (for example no ffmpeg in the snapshot).
            stage = 'recording';
            try {
              await cmd(['record', 'start', VIDEO_PATH], { json: false });
              for (const step of [['scroll', 'down', '600'], ['wait', '900'], ['scroll', 'down', '600'], ['wait', '900'], ['scroll', 'up', '1200'], ['wait', '700']]) await cmd(step, { json: false });
              await cmd(['record', 'stop'], { json: false });
              video = await readSandboxFile(browserSandbox, VIDEO_PATH, MAX_VIDEO_BYTES);
              if (video && !isWebm(video)) video = null;
            } catch (error) {
              logger?.warn('github browser recording skipped', safeError('recording', error));
              video = null;
            }
          }
          stage = 'screenshot';
          await cmd(['screenshot', SHOT_PATH, '--screenshot-format', 'jpeg', '--screenshot-quality', '78'], { json: false });
          shot = await readSandboxFile(browserSandbox, SHOT_PATH, MAX_SCREENSHOT_BYTES);
          if (!shot || !(isJpeg(shot) || isPng(shot))) throw Error('The browser did not produce a screenshot.');
          try { await cmd(['close'], { json: false }); } catch {}
          browser = {
            title: trim(titleResult?.json?.data?.title || '', 200),
            snapshot: trim(snapshotResult?.stdout || '', 2000)
          };
        } finally {
          try { await browserSandbox.stop(); }
          catch (error) { logger?.warn('github browser sandbox cleanup failed', safeError('browser_cleanup', error)); }
        }

        // Saved for this person and this chat; the chat shows them under the reply.
        stage = 'save_media';
        const media = [];
        if (ctx.conversationId && store.addImage) {
          const imageId = await store.addImage({
            tenantId: ctx.tenantId, conversationId: ctx.conversationId, ownerType: 'user', ownerId: ctx.actor.id,
            mime: isPng(shot) ? 'image/png' : 'image/jpeg', bytes: shot, provider: 'browser', model: 'agent-browser'
          });
          media.push({ type: 'image', id: imageId });
          if (video && store.addVideo) {
            const videoId = await store.addVideo({
              tenantId: ctx.tenantId, conversationId: ctx.conversationId, ownerType: 'user', ownerId: ctx.actor.id,
              prompt: `Screen recording of ${repo}@${ref}`.slice(0, 300), targetSeconds: 5, producedSeconds: 5,
              status: 'completed', provider: 'browser', mime: 'video/webm', bytes: video
            });
            media.push({ type: 'video', id: videoId });
          }
        }
        logger?.info('github browser render/test completed', {
          durationMs: Date.now() - started, testExitCode: test.exitCode,
          screenshotBytes: shot.length, videoBytes: video ? video.length : 0, tenantId: ctx.tenantId
        });
        return {
          ok: test.exitCode === 0, repo, ref, viewport,
          test: { exit_code: test.exitCode, stdout: test.stdout, stderr: test.stderr },
          browser,
          screenshot: media.some((m) => m.type === 'image') ? 'shown to the person under your reply' : 'not saved (no chat)',
          recording: media.some((m) => m.type === 'video') ? 'shown to the person under your reply' : (wantVideo ? 'not available this time' : 'not requested'),
          media,
          duration_ms: Date.now() - started,
          message: test.exitCode === 0
            ? 'Rendered and tested. The screenshot (and recording, when there is one) are shown to the person; describe what the page shows from the accessibility snapshot. A green test alone does not prove the UI is correct.'
            : 'The page rendered, but the test command failed. Show the real test output; the screenshot is shown to the person.'
        };
      } catch (error) {
        const detail = safeError(stage, error);
        logger?.warn('github browser render/test failed', { ...detail, durationMs: Date.now() - started });
        return {
          error: stage === 'sandbox_create' ? 'browser_sandbox_failed' : 'browser_test_failed',
          stage_detail: detail,
          message: 'The isolated browser workflow did not complete. No repository branch was changed.'
        };
      } finally {
        if (appSandbox) {
          try { await appSandbox.stop(); }
          catch (error) { logger?.warn('github app sandbox cleanup failed', safeError('sandbox_cleanup', error)); }
        }
      }
    }
  };
}
