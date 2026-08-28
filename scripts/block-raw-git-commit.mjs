import { readFileSync } from 'node:fs';

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  // No stdin available - nothing to inspect, allow silently.
  process.exit(0);
}

// Strip a leading UTF-8 BOM: PowerShell's pipe (`|`) prepends one to piped
// strings, and a BOM-prefixed string is not valid JSON.
if (raw.charCodeAt(0) === 0xfeff) {
  raw = raw.slice(1);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  // Malformed payload - fail open (allow) rather than block an unrelated command.
  process.exit(0);
}

const cmd = payload?.tool_input?.command ?? '';

// No quote-stripping. Three rounds of independent review each found a real
// bypass through a quote-handling special case this script tried to carve
// out (a flag-shape whitelist, then a hand-listed "trusted wrapper" list for
// `iex`/`Invoke-Expression`/`&`, then a third wrapper — `powershell -Command
// "..."` / `cmd /c "..."` — that wasn't on that list either). The
// architectural problem was the list itself: any finite list of "wrappers
// whose quoted argument must be un-blanked" is incomplete by construction
// (wsl, ssh <host>, bash -c, ... are the same shape and there is no bounded
// enumeration of them). So this script no longer special-cases quotes at
// all — it scans the RAW, unmodified command text for a `git`(`.exe`)? token
// followed later by a bare `commit` token, in every case, including inside
// quoted strings. See the NON-GOAL note at the end of this file for the
// explicit, deliberate trade-off this produces.

// Split the command into chain/pipeline segments on shell separators
// (;, &&, ||, |, &) AND on line breaks (\r\n, \n), tokenize each segment on
// whitespace, and flag a segment where a `git`/`git.exe` token is followed
// *anywhere* later in that same segment by a bare `commit` token. Line
// breaks are included so a multi-line script (a here-string, a multi-line
// PowerShell block) doesn't collapse into one token stream where an
// unrelated `git` on line 2 and an unrelated `commit` on line 9 falsely
// pair up — the blast radius of one segment is "the same physical line (or
// shell-separated clause)", not "the whole script". A real multi-line git
// commit invocation still denies correctly because `git` and `commit` are
// on the SAME line in that case. This still allows "git log --grep=commit"
// (the token is "--grep=commit", not "commit") and
// "node scripts/git-safe-commit.mjs ..." (no token equals "git"/"git.exe").
// A flag-shape whitelist was deliberately rejected here too: it breaks the
// moment a real git invocation includes a flag with a separate value token
// (`-C <dir>`, the only valid syntax for -C — `-C=<dir>` is not accepted by
// git) or a `git.exe` invocation, since neither "dir" nor ".exe" match a
// `-flag` shape or an immediate-whitespace "git ".
//
// Note: quote CHARACTERS (`"`/`'`) are turned into whitespace before
// tokenizing (below, where segments are built), uniformly and
// unconditionally — never selectively, never based on what command
// preceded them. This is not the rejected "wrapper whitelist" mechanism;
// it exists purely so a token glued to a quote delimiter (e.g. `"git` at
// the start of a quoted argument to `iex "git commit ..."`) still reads as
// the bare word `git` instead of failing the exact-match regex below.
function isRawGitCommitSegment(segment) {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  let sawGit = false;
  for (const token of tokens) {
    if (/^git(\.exe)?$/i.test(token)) {
      sawGit = true;
      continue;
    }
    if (sawGit && /^commit$/i.test(token)) {
      return true;
    }
  }
  return false;
}

const normalizedForTokenizing = cmd.replace(/["']/g, ' ');
const segments = normalizedForTokenizing.split(/\r\n|\n|&&|\|\||[;&|]/);
const isRawCommit = segments.some(isRawGitCommitSegment);

if (isRawCommit) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          '[block-raw-git-commit] Raw "git commit" is banned. ' +
          'Use: node scripts/git-safe-commit.mjs "<message>" [--tag <tag>]',
      },
    }),
  );
  process.exit(0);
}

// Allow: emit nothing and exit 0.
process.exit(0);

// NON-GOAL / DELIBERATE TRADE-OFF (reviewed 3 rounds, not a bug to fix
// further): this is static string/token matching over the literal command
// text, with NO quote-awareness at all. Two consequences, both accepted on
// purpose:
//
// 1. FAIL-CLOSED ON MERE MENTIONS: a command that only prints or mentions
//    the words "git commit" inside an unrelated quoted string — e.g.
//    `Write-Host "don't use git commit"` — is now also denied, even though
//    it does not actually invoke git. For a security hook, over-blocking a
//    harmless string is strictly safer than under-blocking a real commit
//    wrapped in a form this script didn't anticipate (which is exactly what
//    happened 3 times running with quote-aware special-casing:
//    `git -C dir commit`/`git.exe commit`, then
//    `iex "git commit -am x"`/`Invoke-Expression "..."`, then
//    `powershell -Command "..."`/`cmd /c "..."`). If this ever produces a
//    real false-positive block on legitimate work, the fix is to rephrase
//    the offending string in the caller's command, not to reintroduce
//    quote-stripping.
//
// 2. STILL NOT A PARSER: this remains static token matching, not a
//    PowerShell AST parse or a sandboxed execution trace. It does not and
//    cannot catch variable indirection (`$c = "commit"; git $c -am x`),
//    command substitution (`git $(echo commit) -am x`), a `commit` token
//    assembled from split/concatenated pieces, or git/PowerShell aliases
//    (`gc -am x`, a user-defined `Set-Alias gcm "git commit"`, etc.).
//    Closing those would require an actual PowerShell parser or a monitored
//    sandbox, neither of which this hook implements. This is
//    defense-in-depth against the literal invocation shapes an agent or a
//    user is actually likely to type or paste — including through any
//    subshell/wrapper command, now that quotes are no longer treated
//    specially — not a complete guarantee against a deliberately obfuscated
//    bypass.
//
// Reviewed and confirmed non-exploitable, deliberately not patched:
// `git ; commit -am test` (real git has no bare `commit` command without a
// preceding `git` in the same invocation) and a Cyrillic-homoglyph `git
// сommit` (not a subcommand git itself recognizes) — both fail to reach a
// real commit even when they slip past this token scan, so there is nothing
// to actually block.
