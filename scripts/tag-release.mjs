import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/**
 * Computes ISO 8601 string for local 23:00:00 OpSec timestamp.
 *
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function computeEveningTimestamp(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());

  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMins = pad(absOffset % 60);
  const tzString = `${sign}${offsetHours}:${offsetMins}`;

  return `${year}-${month}-${day}T23:00:00${tzString}`;
}

/**
 * Normalizes a version or tag into a canonical git tag name (e.g. "0.33.0" -> "v0.33.0").
 *
 * @param {string} tagOrVersion
 * @returns {string}
 */
export function normalizeTag(tagOrVersion) {
  if (typeof tagOrVersion !== 'string') {
    throw new Error('Tag or version string is required');
  }
  const clean = tagOrVersion.trim();
  if (!clean) {
    throw new Error('Tag or version cannot be empty');
  }
  return clean.startsWith('v') ? clean : `v${clean}`;
}

/**
 * Validates pre-conditions for safe release tagging.
 *
 * @param {object} options
 * @param {string} options.targetTag
 * @param {string} [options.cwd=repoRoot]
 * @param {boolean} [options.allowDirty=false]
 * @param {boolean} [options.allowBranch=false]
 */
export function validatePreconditions({
  targetTag,
  cwd = repoRoot,
  allowDirty = false,
  allowBranch = false,
}) {
  // 1. Check clean working directory
  if (!allowDirty) {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim();
    if (status) {
      throw new Error(
        `Working directory has uncommitted changes:\n${status}\nCommit or stash changes before creating release tag.`,
      );
    }
  }

  // 2. Check current branch is main
  if (!allowBranch) {
    const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    if (currentBranch !== 'main') {
      throw new Error(
        `Release tags must be created on 'main' branch (found: '${currentBranch}').\n` +
          `Squash-merge the release PR into 'main' first, checkout 'main', pull origin, then tag.`,
      );
    }
  }

  // 3. Check tag does not exist locally
  const localTag = execFileSync('git', ['tag', '-l', targetTag], { cwd, encoding: 'utf8' }).trim();
  if (localTag === targetTag) {
    throw new Error(`Tag '${targetTag}' already exists locally.`);
  }

  // 4. Check tag does not exist on remote
  try {
    const remoteTag = execFileSync(
      'git',
      ['ls-remote', '--tags', 'origin', `refs/tags/${targetTag}`],
      {
        cwd,
        encoding: 'utf8',
      },
    ).trim();
    if (remoteTag) {
      throw new Error(`Tag '${targetTag}' already exists on remote 'origin'.`);
    }
  } catch (err) {
    // If offline or remote check fails with our own error, propagate; otherwise proceed
    if (err.message && err.message.includes('already exists on remote')) {
      throw err;
    }
  }
}

/**
 * Creates annotated git release tag with 23:00 OpSec timestamp and optionally pushes.
 *
 * @param {object} options
 * @param {string} options.targetTag
 * @param {boolean} [options.push=false]
 * @param {boolean} [options.dryRun=false]
 * @param {string} [options.cwd=repoRoot]
 */
export function executeTagRelease({ targetTag, push = false, dryRun = false, cwd = repoRoot }) {
  const eveningDate = computeEveningTimestamp();
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: eveningDate,
    GIT_COMMITTER_DATE: eveningDate,
  };

  console.log(`[tag-release] Target tag: ${targetTag}`);
  console.log(`[tag-release] OpSec 23:00 timestamp: ${eveningDate}`);

  if (dryRun) {
    console.log(
      `[tag-release] [DRY RUN] Would execute: git tag -a ${targetTag} -m "Release ${targetTag}"`,
    );
    if (push) {
      console.log(`[tag-release] [DRY RUN] Would execute: git push origin ${targetTag}`);
    }
    return { targetTag, eveningDate, pushed: push, dryRun: true };
  }

  // Create annotated tag
  execFileSync('git', ['tag', '-a', targetTag, '-m', `Release ${targetTag}`], {
    cwd,
    stdio: 'inherit',
    env,
  });
  console.log(`[tag-release] Successfully created tag '${targetTag}'.`);

  if (push) {
    console.log(`[tag-release] Pushing tag '${targetTag}' to origin...`);
    execFileSync('git', ['push', 'origin', targetTag], {
      cwd,
      stdio: 'inherit',
    });
    console.log(
      `[tag-release] Tag '${targetTag}' pushed to origin! (release.yml workflow triggered)`,
    );
  } else {
    console.log(
      `[tag-release] Tag created locally. To publish GitHub release, push via: git push origin ${targetTag}`,
    );
  }

  return { targetTag, eveningDate, pushed: push, dryRun: false };
}

function main() {
  const args = process.argv.slice(2);
  let targetTag = null;
  let push = false;
  let dryRun = false;
  let allowDirty = false;
  let allowBranch = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--push' || arg === '-p') {
      push = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--allow-dirty') {
      allowDirty = true;
    } else if (arg === '--allow-branch') {
      allowBranch = true;
    } else if (!arg.startsWith('-') && !targetTag) {
      targetTag = arg;
    }
  }

  if (!targetTag) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
      targetTag = `v${pkg.version}`;
    } catch {
      console.error('Error: Failed to read package.json version for default tag.');
      process.exit(1);
    }
  }

  const normalized = normalizeTag(targetTag);

  try {
    validatePreconditions({ targetTag: normalized, allowDirty, allowBranch });
    executeTagRelease({ targetTag: normalized, push, dryRun });
  } catch (err) {
    console.error(`[tag-release] Error: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
