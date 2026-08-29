import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// PreToolUse hook (PowerShell tool). Detects a git branch-CREATION command (`git checkout -b`,
// `git switch -c`, `git branch <name>` without a delete/rename/list flag) and runs a short,
// best-effort `git fetch origin main` first, so a subsequent `git pull`/branch-from-main starts
// from fresher remote-tracking data.
//
// Deliberately bounded (8s) and fail-open on ANY error (network down, interactive auth prompt,
// git missing, timeout) - this is an assist, never a gate. It must never block or meaningfully
// delay the branch-creation command it's attached to; a SessionStart-level always-fetch design
// was considered and rejected earlier for the same class of risk (an expired credential can turn
// a git network call into an indefinite interactive hang) without this command's natural bound.
//
// NON-GOAL: this does NOT switch branches, fast-forward local `main`, or verify the new branch's
// actual base commit - only `git fetch` (updates remote-tracking refs, touches nothing local).
// The written "Fetch Before Branching" rule in CLAUDE.md/AGENTS.md (git checkout main; git pull
// before branching) is still what actually guarantees a fresh base; this hook only removes the
// network-latency/staleness cost of that manual step when it happens right after.

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const cmd = payload?.tool_input?.command ?? '';
const cwd = payload?.cwd ?? process.cwd();

// Same segment/tokenize approach as block-raw-git-commit.mjs (no quote-special-casing, scan
// every shell-separated clause on its own).
function isBranchCreateSegment(segment) {
  const tokens = segment.replace(/["']/g, ' ').trim().split(/\s+/).filter(Boolean);
  let sawGit = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^git(\.exe)?$/i.test(t)) {
      sawGit = true;
      continue;
    }
    if (!sawGit) continue;
    if (/^checkout$/i.test(t) && tokens.slice(i + 1).includes('-b')) return true;
    if (/^switch$/i.test(t) && tokens.slice(i + 1).some((x) => x === '-c' || x === '-C')) {
      return true;
    }
    if (/^branch$/i.test(t)) {
      const rest = tokens.slice(i + 1);
      // A real create needs a name arg and no delete/move/list flag.
      if (rest.length > 0 && !rest.some((x) => /^-{1,2}[dDmM]/.test(x) || x === '--list')) {
        return true;
      }
    }
  }
  return false;
}

const segments = cmd.split(/\r\n|\n|&&|\|\||[;&|]/);
if (!segments.some(isBranchCreateSegment)) {
  process.exit(0);
}

try {
  execFileSync('git', ['fetch', 'origin', 'main'], { cwd, timeout: 8000, stdio: 'pipe' });
} catch {
  // Best-effort only - network/auth/timeout failures never block the actual command.
}
process.exit(0);
