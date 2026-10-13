import { inspectCodingArchive, parseCodingCommand } from './runner.js';

const ROOT = '/vercel/sandbox';
const WORKSPACE = `${ROOT}/repo`;
const ARCHIVE_PATH = `${ROOT}/source.tar.gz`;
const MAX_SCREENSHOT_BYTES = 180 * 1024;
const MAX_TEXT = 2400;
const trim = (value) => {
  const text = String(value || '');
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + '\n[output truncated]' : text;
};

function localPreviewUrl(raw) {
  let url;
  try { url = new URL(raw || 'http://127.0.0.1:3000'); } catch { throw Error('Provide a valid local preview URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.port && (!/^\d{1,5}$/.test(url.port) || Number(url.port) > 65535)) {
    throw Error('The preview URL must point to localhost; public and private-network targets are not allowed.');
  }
  return url;
}

async function command(sandbox, cmd, args = [], cwd = WORKSPACE) {
  const result = await sandbox.runCommand({ cmd, args, cwd });
  return {
    exitCode: result.exitCode,
    stdout: trim(await result.stdout()),
    stderr: trim(await result.stderr())
  };
}

function safeError(stage, error) {
  const name = String(error?.name || 'Error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'Error';
  const message = String(error?.message || 'Unknown failure')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,})\b/g, '[redacted]')
    .replace(/https?:\/\/\S+/gi, '[url redacted]')
    .replace(/[\r\n\t]+/g, ' ').slice(0, 160);
  return { stage, name, message };
}

export function createBrowserTestRunner({
  downloadArchive, defaultBranch, tokenFor, store, logger = null,
  withBrowserSandbox = null, browserCommand = null
}) {
  async function defaults() {
    const browser = await import('@agent-browser/sandbox/vercel');
    return {
      withBrowserSandbox: browser.withAgentBrowserSandbox,
      browserCommand: browser.runAgentBrowserCommand
    };
  }

  return {
    async run(input, ctx) {
      if (ctx?.actor?.type !== 'user' || !ctx.actor.id || !ctx.tenantId) {
        return { error: 'sign_in_required', message: 'Sign in and connect GitHub to render and test repository code.' };
      }
      let testCommand, startCommand, previewUrl;
      try {
        testCommand = parseCodingCommand(input?.test_command || 'npm test');
        startCommand = parseCodingCommand(input?.start_command || 'npm run dev -- --host 127.0.0.1 --port 3000');
        previewUrl = localPreviewUrl(input?.preview_url);
      } catch (error) {
        return { error: 'invalid_arguments', message: error.message };
      }
      const repo = String(input?.repo || '').trim();
      const refInput = String(input?.ref || '').trim();
      if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) ||
          refInput.length > 200 || (refInput && !/^(?!.*\.\.)(?!\/)[A-Za-z0-9._/-]{1,200}$/.test(refInput))) {
        return { error: 'invalid_arguments', message: 'Choose a valid repository and branch or commit.' };
      }
      try {
        const limit = await store.rateHit(`ghbrowser:${ctx.tenantId}:${ctx.actor.id}`, 3600, 3);
        if (!limit?.allowed) return { error: 'rate_limited', message: 'Browser render/test is limited to 3 runs per hour. Try again later.' };
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

      let browserDeps;
      try { browserDeps = withBrowserSandbox && browserCommand ? { withBrowserSandbox, browserCommand } : await defaults(); }
      catch { return { error: 'browser_runtime_unavailable', message: 'Browser automation is not installed in this deployment. No code was executed.' }; }

      const started = Date.now();
      let stage = 'sandbox_create';
      try {
        return await browserDeps.withBrowserSandbox(async (sandbox) => {
          let stopped = false;
          try {
            stage = 'workspace_write';
            if (!sandbox.writeFiles) throw Error('Browser sandbox does not support safe file writes.');
            await sandbox.writeFiles([{ path: ARCHIVE_PATH, content: archive }]);
            stage = 'workspace_create';
            let result = await command(sandbox, 'mkdir', ['-p', WORKSPACE], ROOT);
            if (result.exitCode !== 0) throw Error('Could not create the isolated workspace.');
            stage = 'snapshot_extract';
            result = await command(sandbox, 'tar', ['--no-same-owner', '--no-same-permissions', '-xzf', ARCHIVE_PATH, '--strip-components=1', '-C', WORKSPACE], ROOT);
            if (result.exitCode !== 0) throw Error('The repository snapshot could not be extracted.');

            stage = 'dependency_detect';
            const pkg = await command(sandbox, 'test', ['-f', 'package.json'], WORKSPACE);
            if (pkg.exitCode === 0) {
              const lock = await command(sandbox, 'test', ['-f', 'package-lock.json'], WORKSPACE);
              stage = 'dependency_install';
              result = await command(sandbox, 'npm', lock.exitCode === 0
                ? ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
                : ['install', '--ignore-scripts', '--no-audit', '--no-fund'], WORKSPACE);
              if (result.exitCode !== 0) return {
                error: 'dependency_install_failed', stage, exit_code: result.exitCode,
                stdout: result.stdout, stderr: result.stderr,
                message: 'Dependencies could not be installed with lifecycle scripts disabled.'
              };
            }

            // No external access is needed for the test, local server, or browser.
            stage = 'network_restrict';
            if (typeof sandbox.updateNetworkPolicy !== 'function') throw Error('Browser sandbox cannot enforce the required network restriction.');
            await sandbox.updateNetworkPolicy({ allow: [] });

            stage = 'test_execute';
            const test = await command(sandbox, testCommand.executable, testCommand.args, WORKSPACE);

            // Start the local server using spawn, not a shell string. This launcher
            // is written by NasrinAI and the repository code remains inside the VM.
            stage = 'server_start';
            const port = Number(previewUrl.port || (previewUrl.protocol === 'https:' ? 443 : 80));
            const launcher = `import { spawn } from 'node:child_process';
const child = spawn(${JSON.stringify(startCommand.executable)}, ${JSON.stringify(startCommand.args)}, {
  cwd: ${JSON.stringify(WORKSPACE)}, detached: true, stdio: 'ignore',
  env: { ...process.env, PORT: ${JSON.stringify(String(port))}, HOST: '127.0.0.1', HOSTNAME: '127.0.0.1' }
});
child.unref();
const deadline = Date.now() + 25000;
let ready = false;
while (Date.now() < deadline) {
  try { const r = await fetch(${JSON.stringify(previewUrl.origin)}); if (r.status < 500) { ready = true; break; } } catch {}
  await new Promise(resolve => setTimeout(resolve, 300));
}
if (!ready) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} process.exit(2); }
`;
            await sandbox.writeFiles([{ path: `${WORKSPACE}/.nasrin-browser-launcher.mjs`, content: Buffer.from(launcher) }]);
            const launch = await command(sandbox, 'node', ['.nasrin-browser-launcher.mjs'], WORKSPACE);
            if (launch.exitCode !== 0) return {
              error: 'preview_start_failed', stage, exit_code: launch.exitCode,
              test: { exit_code: test.exitCode, stdout: test.stdout, stderr: test.stderr },
              message: 'The local preview server did not become ready. Check the start command and port.'
            };

            stage = 'browser_open';
            const opened = await browserDeps.browserCommand(sandbox, ['open', previewUrl.toString()], { json: false });
            stage = 'browser_inspect';
            const titleResult = await browserDeps.browserCommand(sandbox, ['get', 'title']);
            const snapshotResult = await browserDeps.browserCommand(sandbox, ['snapshot', '-i', '-c'], { json: false });
            stage = 'screenshot';
            const screenshotResult = await browserDeps.browserCommand(sandbox, ['screenshot', '--json']);
            const screenshotPath = screenshotResult?.json?.data?.path;
            if (!screenshotPath) throw Error('The browser did not return a screenshot path.');
            const imageResult = await command(sandbox, 'base64', ['-w', '0', screenshotPath], ROOT);
            if (imageResult.exitCode !== 0) throw Error('Could not read the captured screenshot.');
            const screenshot = imageResult.stdout.replace(/\s/g, '');
            const size = Math.floor(screenshot.length * 3 / 4);
            if (!screenshot || size > MAX_SCREENSHOT_BYTES) throw Error('The screenshot exceeds the 180 KB artifact limit.');
            stage = 'browser_close';
            try { await browserDeps.browserCommand(sandbox, ['close'], { json: false }); } catch {}
            stopped = true;
            logger?.info('github browser render/test completed', {
              durationMs: Date.now() - started, repo, testExitCode: test.exitCode,
              screenshotBytes: size, tenantId: ctx.tenantId
            });
            return {
              ok: test.exitCode === 0,
              repo, ref, preview_url: previewUrl.toString(),
              test: { exit_code: test.exitCode, stdout: test.stdout, stderr: test.stderr },
              browser: { title: titleResult?.json?.data?.title || '', snapshot: trim(snapshotResult?.stdout || snapshotResult?.text || '') },
              screenshot: { mime_type: 'image/png', encoding: 'base64', data: screenshot, bytes: size },
              duration_ms: Date.now() - started,
              message: test.exitCode === 0
                ? 'Browser render and test completed. Inspect the screenshot and accessibility snapshot; a green test command alone does not prove the UI is correct.'
                : 'The browser rendered the page, but the test command failed. Inspect the real test output and screenshot.'
            };
          } finally {
            if (!stopped) {
              try { await browserDeps.browserCommand(sandbox, ['close'], { json: false }); } catch {}
            }
          }
        });
      } catch (error) {
        const detail = safeError(stage, error);
        logger?.warn('github browser render/test failed', { ...detail, durationMs: Date.now() - started });
        return {
          error: stage === 'sandbox_create' ? 'browser_sandbox_failed' : 'browser_test_failed',
          stage_detail: detail,
          message: 'The isolated browser workflow did not complete. No repository branch was changed.'
        };
      }
    }
  };
}
