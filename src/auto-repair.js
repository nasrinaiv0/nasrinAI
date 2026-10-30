// Automatic failure detection for the coding chat. When a check the model ran
// (tests, build, lint, render) failed and the model tries to finish anyway, the
// chat sends it back to fix and re-run, a bounded number of times. Failures a
// code change cannot fix (rate limits, GitHub not connected, sign-in) never
// trigger a repair round.

export const CHECK_TOOLS = new Set(['github_run_command', 'github_render_test_screenshot', 'run_code']);
export const MAX_REPAIR_ROUNDS = 3;
const FIXABLE_ERRORS = new Set(['patch_rejected', 'dependency_install_failed', 'preview_start_failed', 'test_failed']);

// { tool, failed, fixable, exitCode, stage } for a check tool's result, else null.
export function checkOutcome(name, out) {
  if (!CHECK_TOOLS.has(name) || !out || typeof out !== 'object') return null;
  const exitCode = Number.isInteger(out.exit_code) ? out.exit_code
    : Number.isInteger(out.test?.exit_code) ? out.test.exit_code : null;
  const error = typeof out.error === 'string' ? out.error : null;
  const failed = Boolean(error) || (exitCode !== null && exitCode !== 0);
  const fixable = failed && ((exitCode !== null && exitCode !== 0) || FIXABLE_ERRORS.has(error));
  return { tool: name, failed, fixable, exitCode, stage: typeof out.stage === 'string' ? out.stage.slice(0, 40) : null, error };
}

export function repairNote(check, attempt) {
  return '[NasrinAI automatic check ' + attempt + '/' + MAX_REPAIR_ROUNDS + '] The last ' + check.tool + ' run failed'
    + (check.stage ? ' at ' + check.stage : '') + (check.exitCode !== null ? ' (exit code ' + check.exitCode + ')' : '')
    + (check.error ? ' [' + check.error + ']' : '') + '. Do not finish yet: read that failure output above, find the cause, '
    + 'fix the code (with code_edit, or the complete cumulative patch), and run the failing check again. If the failure is outside the requested scope '
    + 'or cannot be fixed with the available tools, say exactly why instead of claiming success.';
}
