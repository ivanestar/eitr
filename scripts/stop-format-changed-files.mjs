import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Runs on the Stop hook (end of turn), NOT PostToolUse (after each edit). This is deliberate:
// reformatting a file between two Edit calls in the same turn would shift its exact text, and
// Edit matches old_string literally (whitespace-sensitive) - a mid-turn reformat could break a
// subsequent Edit in the same chain. Stop only reformats once the turn is already finished, and
// this project's own Context Freshness rule (CLAUDE.md/AGENTS.md) already mandates re-reading a
// file before editing it again in a later turn, so a reformat between turns is safe.
//
// Non-goal: this only fixes formatting via `prettier --write` (always safe/idempotent to apply
// automatically). It deliberately never runs typecheck/lint or blocks Stop (exit 2) - Stop fires
// on every single turn including pure Q&A ones with no code changes, so anything slower than a
// git-status check plus a targeted prettier run would add cost to turns that touched no code at
// all, and a blocking check on this event risks a stuck "can't stop" loop if the underlying
// command is ever flaky. Use `npm run typecheck` / `npm run build` manually before committing,
// same as always - this hook only closes the specific, repeatedly-observed gap of "forgot to
// format, git-safe-commit.mjs's format:check gate catches it after the fact, requiring a retry".

let cwd = process.cwd();
try {
  const raw = readFileSync(0, 'utf8');
  const payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  if (payload?.cwd) cwd = payload.cwd;
} catch {
  // No/invalid stdin - fall back to process.cwd(). Not fatal, keep going.
}

// Extensions Prettier actually formats in this repo (a TS/JS monorepo - no Python/C#/Java here).
const FORMATTABLE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml)$/i;

function getChangedFiles() {
  let porcelain;
  try {
    porcelain = execFileSync('git', ['status', '--porcelain', '-z'], { cwd, encoding: 'utf8' });
  } catch {
    return []; // Not a git repo, or git unavailable - nothing to do.
  }
  if (!porcelain) return [];

  // `-z` NUL-terminates entries and never quotes paths, sidestepping the C-style quoting
  // `git status --porcelain` (no -z) applies to paths with spaces/non-ASCII characters. Every
  // entry here is assumed to carry the "XY " status-code prefix (true for a normal add/modify/
  // delete entry) and sliced accordingly. KNOWN LIMITATION, not fixed: a rename/copy entry is
  // actually a NUL-separated PAIR ("XY newpath\0origpath\0"), so the second half of that pair
  // (origpath, no "XY " prefix) gets its first 3 real characters incorrectly stripped by the same
  // slice(3) below - the resulting bogus path then simply fails existsSync and is dropped. Net
  // effect: a freshly renamed file is silently skipped by this hook rather than reformatted. This
  // is accepted rather than fixed with pair-aware parsing because renames are not how this hook's
  // actual inputs (Edit/Write of already-tracked or newly-created files) normally arise, and the
  // failure mode is "misses one file", not a crash or a false format of the wrong file.
  const entries = porcelain.split('\0').filter(Boolean);
  const files = new Set();
  for (const entry of entries) {
    // First 2 chars are the status code, then a space, then the path.
    const path = entry.slice(3);
    if (FORMATTABLE_EXT.test(path) && existsSync(join(cwd, path))) {
      files.add(path);
    }
  }
  return [...files];
}

const files = getChangedFiles();
if (files.length === 0) {
  process.exit(0);
}

// Invoke prettier's own JS CLI entrypoint directly via `node`, rather than the npm-installed
// `.bin/prettier(.cmd)` shim: on Windows, execFileSync on a `.cmd` file fails with EINVAL unless
// `shell: true` is passed, and `shell: true` re-introduces shell-metacharacter injection risk
// from filenames (git status output, not attacker input here, but no reason to accept the risk
// when running the actual JS entrypoint through `node` sidesteps it entirely on every platform).
const prettierJs = resolve(cwd, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
if (!existsSync(prettierJs)) {
  // Prettier isn't installed locally (shouldn't happen inside this repo - it's a devDependency).
  // Fail open: skip formatting rather than guess at a fallback invocation with the same
  // shell-injection trade-off this was written to avoid.
  process.exit(0);
}

let output = '';
try {
  output = execFileSync(process.execPath, [prettierJs, '--write', ...files], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
} catch (err) {
  // Prettier exits non-zero if any file fails to parse - still report what it printed rather
  // than treating this as a hook failure. Stop is never blocked either way (see NON-GOAL above).
  output = (err.stdout ?? '') + (err.stderr ?? '');
}

// Prettier prints one line per file, e.g. "path/to/file.ts 12ms" (changed) or
// "path/to/file.ts 12ms (unchanged)" - only surface the ones it actually rewrote.
const changed = output
  .split(/\r?\n/)
  .filter((line) => line.trim() && !line.includes('(unchanged)') && !line.trim().startsWith('['))
  .map((line) => line.trim().split(/\s+/)[0])
  .filter(Boolean);

if (changed.length > 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        systemMessage: `[stop-format] Prettier auto-formatted: ${changed.join(', ')}`,
      },
    }),
  );
}
process.exit(0);
