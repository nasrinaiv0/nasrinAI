// Pull request chips for the coding chat: one short line per pull request,
// made by the server from GitHub's own answer (github_pr_status), never from
// the model. The page shows it as "Diff +A −D" and "#N · Merged".
//
//   [pr:owner/name#12 merged +2555 -40]
//   [prs:owner/name 9]          (github_list_pull_requests: how many listed)

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const STATES = new Set(['open', 'closed', 'merged', 'draft']);
const count = (n) => Number.isInteger(n) && n >= 0 && n < 1e9;

// Any line shaped like a chip; the model's own are removed from its reply.
export const PR_CHIP_LINES = /^[ \t]*\[prs?:[^\]\n]*\][ \t]*(\r?\n|$)/gm;

export function prChipOf(name, out) {
  if (!out || typeof out !== 'object' || out.error || !REPO.test(String(out.repo || ''))) return null;
  if (name === 'github_pr_status') {
    if (!Number.isInteger(out.number) || out.number < 1 || !count(out.additions) || !count(out.deletions)) return null;
    const state = out.merged ? 'merged' : out.state === 'open' && out.draft ? 'draft' : out.state;
    if (!STATES.has(state)) return null;
    return { key: out.repo + '#' + out.number, line: `[pr:${out.repo}#${out.number} ${state} +${out.additions} -${out.deletions}]` };
  }
  if (name === 'github_list_pull_requests' && Array.isArray(out.pull_requests)) {
    return { key: out.repo + ' list', line: `[prs:${out.repo} ${out.pull_requests.length}]` };
  }
  return null;
}
