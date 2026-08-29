import { execFileSync } from 'node:child_process';

// Guards the exact failure class that broke CI runs #14/#15 (2026-08-29): two new markdown files
// were committed without ever being run through Prettier, so `npm run format:check` failed as the
// very first gate in CI, before build/test even started. This repo has no pre-commit git hook of
// its own (only .githooks/pre-commit templates for *generated* projects), and every AI-assistant
// commit is required to go through this script — so this is the one place a check is guaranteed to
// run before every commit, regardless of which files were touched or remembered to be formatted.
function runFormatCheck() {
  try {
    execFileSync('npm', ['run', '--silent', 'format:check'], { stdio: 'inherit', shell: true });
    return true;
  } catch {
    return false;
  }
}

const rawArgs = process.argv.slice(2);
let tag = null;
const msgArgs = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--tag' && rawArgs[i + 1]) {
    tag = rawArgs[++i];
  } else {
    msgArgs.push(rawArgs[i]);
  }
}

const msg = msgArgs.join(' ');

if (!msg) {
  console.error(
    'Error: Commit message required. Usage: node scripts/git-safe-commit.mjs "<commit-message>" [--tag <tag-name>]',
  );
  process.exit(1);
}

console.log('[Safe Commit] Running format:check (the same gate CI runs first)...');
if (!runFormatCheck()) {
  console.error(
    '[Safe Commit] format:check failed — commit aborted. Run `npm run format` to fix, then retry.',
  );
  process.exit(1);
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const year = now.getFullYear();
const month = pad(now.getMonth() + 1);
const day = pad(now.getDate());

// Compute local timezone offset (+HH:MM or -HH:MM)
const offsetMinutes = -now.getTimezoneOffset();
const sign = offsetMinutes >= 0 ? '+' : '-';
const absOffset = Math.abs(offsetMinutes);
const offsetHours = pad(Math.floor(absOffset / 60));
const offsetMins = pad(absOffset % 60);
const tzString = `${sign}${offsetHours}:${offsetMins}`;

const eveningDate = `${year}-${month}-${day}T23:00:00${tzString}`;

console.log(`[Safe Commit] Enforcing Author & Committer Date: ${eveningDate}`);

const env = {
  ...process.env,
  GIT_AUTHOR_DATE: eveningDate,
  GIT_COMMITTER_DATE: eveningDate,
};

try {
  execFileSync('git', ['commit', '-m', msg], {
    stdio: 'inherit',
    env,
  });
  console.log('[Safe Commit] Commit successfully recorded with evening timestamp (23:00).');

  if (tag) {
    console.log(`[Safe Commit] Creating annotated tag ${tag} with evening timestamp...`);
    execFileSync('git', ['tag', '-a', tag, '-m', `Release ${tag}`], {
      stdio: 'inherit',
      env,
    });
    console.log(`[Safe Commit] Tag ${tag} created with evening timestamp.`);
  }
} catch (err) {
  console.error('[Safe Commit] git operation failed.');
  process.exit(1);
}
