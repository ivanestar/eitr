import { execFileSync } from 'node:child_process';

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
