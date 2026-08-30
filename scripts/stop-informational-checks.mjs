import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Runs on the Stop hook (end of turn), alongside stop-format-changed-files.mjs. Two independent,
// purely informational checks - NEVER blocks Stop (always exit 0, no `permissionDecision`), same
// reasoning as stop-format-changed-files.mjs: Stop fires on every turn including pure Q&A ones,
// and a blocking check here risks a stuck "can't stop" loop if either check is ever flaky.
//
// 1. Agent/skill mirror parity: wraps the existing scripts/check-mirror-parity.mjs, which exits 1
//    on drift - that exit code is swallowed here and turned into a systemMessage instead, since a
//    real drift finding should surface, not silently fail the hook. Scope note (verified
//    empirically, not assumed from the script's name): this diffs the 23 `.claude/agents|skills`
//    <-> `.agents/agents|skills` file pairs only - it does NOT compare root `CLAUDE.md` against
//    `AGENTS.md` (confirmed by deliberately adding a line to CLAUDE.md alone and observing it
//    went unreported). Keeping the two root files in sync when one is edited remains a written,
//    judgment-based rule (Section 15) - the two files are allowed to differ in specific,
//    documented ways (Section 15's "Deliberate Process-Weight Divergence"), so a naive line-diff
//    of them would be noisy with expected differences, not a 100%-safe deterministic check.
// 2. Emoji scan: greps changed files (from `git status --porcelain -z`, same approach as
//    stop-format-changed-files.mjs) for the unambiguous emoji Unicode ranges (main emoji blocks
//    + regional-indicator flag pairs). Deliberately narrow ranges only - broader ranges like Misc
//    Symbols/Dingbats (U+2600-27BF) overlap with legitimate technical-writing characters
//    (checkmarks, arrows) that would produce false positives on content nobody intended as an
//    emoji; under-matching with a note beats a wrong auto-flag, per this project's own
//    Deterministic-Over-AI Preference rule (CLAUDE.md/AGENTS.md Section 5).

let cwd = process.cwd();
try {
  const raw = readFileSync(0, 'utf8');
  const payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  if (payload?.cwd) cwd = payload.cwd;
} catch {
  // No/invalid stdin - fall back to process.cwd(). Not fatal, keep going.
}

const messages = [];

// --- 1. Mirror parity ---
try {
  execFileSync(process.execPath, [join(cwd, 'scripts', 'check-mirror-parity.mjs')], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
} catch (err) {
  const out = ((err.stdout ?? '') + (err.stderr ?? '')).trim();
  if (out) messages.push(`[mirror-parity] ${out.split(/\r?\n/)[0]}`);
}

// --- 2. Emoji scan on changed files ---
const FORMATTABLE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml)$/i;
const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/u;

function getChangedFiles() {
  let porcelain;
  try {
    porcelain = execFileSync('git', ['status', '--porcelain', '-z'], { cwd, encoding: 'utf8' });
  } catch {
    return [];
  }
  if (!porcelain) return [];
  const entries = porcelain.split('\0').filter(Boolean);
  const files = new Set();
  for (const entry of entries) {
    const path = entry.slice(3);
    if (FORMATTABLE_EXT.test(path) && existsSync(join(cwd, path))) {
      files.add(path);
    }
  }
  return [...files];
}

const flaggedFiles = [];
for (const file of getChangedFiles()) {
  try {
    const content = readFileSync(join(cwd, file), 'utf8');
    if (EMOJI_RE.test(content)) flaggedFiles.push(file);
  } catch {
    // Unreadable/binary - skip.
  }
}
if (flaggedFiles.length > 0) {
  messages.push(`[emoji-scan] Possible emoji found in: ${flaggedFiles.join(', ')}`);
}

if (messages.length > 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        systemMessage: messages.join(' | '),
      },
    }),
  );
}
process.exit(0);
