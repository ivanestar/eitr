// Template for scripts/auth-status.mjs — deterministic fact-gathering for /auth-setup's guided
// flow. Per the project's own rule (any multi-step guided flow needs a deterministic
// stage-dispatch script, not prose telling the model how to figure out what's next), this script
// answers "what does the current project state actually show" - the skill's prose still asks the
// human questions a script cannot answer (does this app need auth at all, how many roles), but
// never re-derives these specific facts by re-reading files inconsistently itself.
export function renderAuthStatus(): string {
  return `#!/usr/bin/env node

/**
 * Computes the current auth-setup state from real project state on disk - zero model
 * involvement, safe to run at any time.
 *
 * Usage:
 *   node scripts/auth-status.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const ENV_PATH = path.join(CWD, '.env');
const AUTH_DIR = path.join(CWD, '.auth');
const INIT_PATH = path.join(CWD, '.scaffold', 'init.json');

function readFilledEnvKeys() {
  if (!fs.existsSync(ENV_PATH)) return [];
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const filled = [];
  for (const rawLine of content.split('\\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && match[2].trim() !== '') filled.push(match[1]);
  }
  return filled;
}

function listSessionFiles() {
  if (!fs.existsSync(AUTH_DIR)) return [];
  return fs
    .readdirSync(AUTH_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

// Each provider's generated pipeline file, checked in this exact order (the file that actually
// exists on disk, not a record of what the questionnaire once said). \`.scaffold/init.json\` is
// gitignored by the generated project's own .gitignore - a fresh clone, a CI runner's checkout, or
// a plain workspace cleanup all legitimately lack it while the real pipeline file (committed,
// meant to persist) sits right there. Checking init.json first was live-observed reporting "no CI
// configured" against a project that already had a working .gitlab-ci.yml.
const CI_MARKER_FILES = [
  { provider: 'github', file: path.join('.github', 'workflows', 'playwright.yml') },
  { provider: 'gitlab', file: '.gitlab-ci.yml' },
  { provider: 'jenkins', file: 'Jenkinsfile' },
  { provider: 'teamcity', file: path.join('.teamcity', 'settings.kts') },
];

function readCiProviderFromInitJson() {
  if (!fs.existsSync(INIT_PATH)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(INIT_PATH, 'utf8'));
    const ciCd = data && typeof data === 'object' ? data.ciCd : null;
    return ciCd && ciCd !== 'none' ? ciCd : null;
  } catch {
    return null;
  }
}

function readCiProvider() {
  for (const { provider, file } of CI_MARKER_FILES) {
    if (fs.existsSync(path.join(CWD, file))) return provider;
  }
  // No pipeline file on disk yet - fall back to what the questionnaire recorded, in case CI/CD was
  // chosen but generation of that specific file was skipped for some other reason.
  return readCiProviderFromInitJson();
}

function main() {
  const filledEnvKeys = readFilledEnvKeys();
  const sessionFiles = listSessionFiles();
  const ciProvider = readCiProvider();

  const hasSession = sessionFiles.length > 0;
  const authEnvFilled = ['E2E_USERNAME', 'E2E_API_TOKEN', 'AUTH_TOKEN'].some((k) =>
    filledEnvKeys.includes(k),
  );

  const result = {
    sessionFiles,
    hasSession,
    filledEnvKeys,
    authEnvFilled,
    ciProvider,
    nextStep: hasSession ? 'session-exists' : 'capture-needed',
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

main();
`;
}
