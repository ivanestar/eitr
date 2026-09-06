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

function readCiProvider() {
  if (!fs.existsSync(INIT_PATH)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(INIT_PATH, 'utf8'));
    const ciCd = data && typeof data === 'object' ? data.ciCd : null;
    return ciCd && ciCd !== 'none' ? ciCd : null;
  } catch {
    return null;
  }
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
