import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/**
 * Deterministically extracts release notes for a specific version from CHANGELOG content.
 *
 * @param {string} changelogContent - Full text of CHANGELOG.md
 * @param {string} version - Target version (e.g. "0.33.0" or "v0.33.0")
 * @returns {string} Cleaned markdown release notes for the target version
 */
export function extractReleaseNotes(changelogContent, version) {
  if (!version || typeof version !== 'string') {
    throw new Error('Target version string is required');
  }

  const cleanVersion = version.replace(/^v/, '').trim();
  if (!cleanVersion) {
    throw new Error(`Invalid version supplied: "${version}"`);
  }

  const escapedVersion = cleanVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Matches "## [X.Y.Z] - YYYY-MM-DD" and captures until the next "## [" or EOF
  const regex = new RegExp(
    `##\\s*\\[\\s*${escapedVersion}\\s*\\](?:\\s*-[^\\n]*)?\\n([\\s\\S]*?)(?=\\n##\\s*\\[|$)`,
  );

  const match = changelogContent.match(regex);
  if (!match || !match[1]) {
    throw new Error(`Release notes for version ${cleanVersion} not found in CHANGELOG.md`);
  }

  return match[1].trim();
}

/**
 * CLI execution handler
 */
function main() {
  const args = process.argv.slice(2);
  let targetVersion = null;
  let outputFile = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f' || arg === '-o') {
      outputFile = args[++i];
    } else if (!arg.startsWith('-') && !targetVersion) {
      targetVersion = arg;
    }
  }

  const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
  let changelogContent;
  try {
    changelogContent = readFileSync(changelogPath, 'utf8');
  } catch (err) {
    console.error(`Error: Unable to read CHANGELOG.md at ${changelogPath}: ${err.message}`);
    process.exit(1);
  }

  if (!targetVersion) {
    // Default to version in package.json
    try {
      const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
      targetVersion = pkg.version;
    } catch {
      console.error(
        'Error: No target version specified and failed to read version from package.json',
      );
      process.exit(1);
    }
  }

  try {
    const notes = extractReleaseNotes(changelogContent, targetVersion);
    if (outputFile) {
      const resolvedOut = path.resolve(process.cwd(), outputFile);
      writeFileSync(resolvedOut, notes + '\n', 'utf8');
      console.log(
        `[extract-release-notes] Extracted v${targetVersion.replace(/^v/, '')} notes to ${outputFile}`,
      );
    } else {
      process.stdout.write(notes + '\n');
    }
  } catch (err) {
    console.error(`[extract-release-notes] ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
