import { inspectCodingArchive, parseCodingCommand } from './runner.js';

const ROOT = '/vercel/sandbox';
const WORKSPACE = `${ROOT}/repo`;
const ARCHIVE_PATH = `${ROOT}/source.tar.gz`;
const MAX_SCREENSHOT_BYTES = 120 * 1024;
const MAX_TEXT = 2400;
const trim = (value) => {
  const text = String(value || '');
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + '\n[output truncated]' : text;
};

function safeError(stage, error) {
  const name = String(error?.name || 'Error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'Error';
  const message = String(error?.message || 'Unknown failure')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,})\b/g, '[redacted]')
    .replace(/https?:\/\/\S+/gi, '[url redacted]')
    .replace(/[\r\n\t]+/g, ' ').slice(0, 160);
  return { stage, name, message };
}

async function appCommand(sandbox, cmd, args = [], cwd = WORKSPACE) {
  const result = await sandbox.runCommand({ cmd, args, cwd });
  return { exitCode: result.exitCode, stdout: trim(await result.stdout()), stderr: trim(await result.stderr()) };
}

export function createBrowserTestRunner({
  downloadArchive, defaultBranch, tokenFor, store, logger = null,
  createAppSandbox = null, withBrowserSandbox = null, browserCommand = null
}) {
  async function defaults() {
    const [{ Sandbox }, browser] = await Promise.all([
      import('@vercel/sandbox'),
      import('@agent-browser/sandbox/vercel')
    ]);
    return {
      createAppSandbox: options => Sandbox.create(options),
      withBrowserSandbox: browser.withAgentBrowserSandbox,
      browserCommand: browser.runAgentBrowserCommand
    };
  }

  return {
    async run(input, ctx) {
      if (ctx?.actor?.type !== 'user' || !ctx.actor.id || !ctx.tenantId) {
        return { error: 'sign_in_required', message: 'Sign in and connect GitHub to render and test repository code.' };
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

      let deps;
      try { deps = createAppSandbox && withBrowserSandbox && browserCommand ? { createAppSandbox, withBrowserSandbox, browserCommand } : await defaults(); }
      catch { return { error: 'browser_runtime_unavailable', message: 'Browser automation is not installed in this deployment. No repository code was executed.' }; }

      const started = Date.now();
      let appSandbox;
      let stage = 'sandbox_create';
      try {
        appSandbox = await deps.createAppSandbox({
          runtime: 'node22', timeout: 150_000, persistent: false, ports: [port],
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
        const browser = await deps.withBrowserSandbox(async browserSandbox => {
          await deps.browserCommand(browserSandbox, ['open', previewUrl], { json: false });
          stage = 'browser_inspect';
          const titleResult = await deps.browserCommand(browserSandbox, ['get', 'title']);
          const snapshotResult = await deps.browserCommand(browserSandbox, ['snapshot', '-i', '-c'], { json: false });
          stage = 'screenshot';
          const screenshotResult = await deps.browserCommand(browserSandbox, ['screenshot', '--json']);
          const screenshotPath = screenshotResult?.json?.data?.path;
          if (!screenshotPath) throw Error('The browser did not return a screenshot path.');
          const imageResult = await browserSandbox.runCommand('base64', ['-w', '0', screenshotPath]);
          const screenshot = String(await imageResult.stdout()).replace(/\s/g, '');
          const size = Math.floor(screenshot.length * 3 / 4);
          if (!screenshot || size > MAX_SCREENSHOT_BYTES) throw Error('The screenshot exceeds the 120 KB artifact limit.');
          try { await deps.browserCommand(browserSandbox, ['close'], { json: false }); } catch {}
          return {
            title: titleResult?.json?.data?.title || '',
            snapshot: trim(snapshotResult?.stdout || snapshotResult?.text || ''),
            screenshot: { mime_type: 'image/png', encoding: 'base64', data: screenshot, bytes: size }
          };
        });
        logger?.info('github browser render/test completed', {
          durationMs: Date.now() - started, repo, testExitCode: test.exitCode,
          screenshotBytes: browser.screenshot.bytes, tenantId: ctx.tenantId
        });
        return {
          ok: test.exitCode === 0, repo, ref, preview_url: previewUrl,
          test: { exit_code: test.exitCode, stdout: test.stdout, stderr: test.stderr },
          browser, duration_ms: Date.now() - started,
          message: test.exitCode === 0
            ? 'Browser render and test completed. Inspect the screenshot and accessibility snapshot; a green test command alone does not prove the UI is correct.'
            : 'The browser rendered the page, but the test command failed. Inspect the real test output and screenshot.'
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
