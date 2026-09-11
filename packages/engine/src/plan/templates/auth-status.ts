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
const PROFILE_PATH = path.join(CWD, 'artifacts', 'analysis', 'app-profile.json');

// Whether this application has a sign-in, if anyone ever said so. Read from the project's own
// record of durable facts rather than re-asked: without it the auth flow opened with the same
// question on every single run, including for a person who had already answered that there is no
// login anywhere. null means nobody has established it, which is different from "no".
function readRecordedLogin() {
  if (!fs.existsSync(PROFILE_PATH)) return null;
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8').replace(/^\\uFEFF/, ''));
    const value = profile && profile.login ? profile.login.value : null;
    return value === 'none' || value === 'present' ? value : null;
  } catch {
    return null;
  }
}

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

// A session file on disk is one reading; whether it can still sign anyone in is another, and the
// file says that too without being used: a token in it usually carries its own expiry, and cookies
// carry theirs. A crawl started from an expired session maps the sign-in page at every address and
// finds out pages later. Only the expiry is read - never a value, never printed.
function tokenExpiry(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload && typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

const SOON_MS = 24 * 60 * 60 * 1000;

function sessionHealth(file) {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, file), 'utf8').replace(/^\\uFEFF/, ''));
  } catch {
    return { file, verdict: 'unreadable', reason: 'not valid JSON' };
  }
  const now = Date.now();
  const cookies = Array.isArray(state && state.cookies) ? state.cookies : [];
  const tokens = [];
  for (const cookie of cookies) {
    const expiry = tokenExpiry(cookie && cookie.value);
    if (expiry) tokens.push(expiry);
  }
  for (const origin of Array.isArray(state && state.origins) ? state.origins : []) {
    for (const item of Array.isArray(origin && origin.localStorage) ? origin.localStorage : []) {
      const expiry = tokenExpiry(item && item.value);
      if (expiry) tokens.push(expiry);
    }
  }
  if (tokens.length > 0) {
    const live = tokens.filter((expiry) => expiry > now).sort((a, b) => a - b);
    if (live.length === 0) {
      return { file, verdict: 'expired', expiredAt: new Date(Math.max(...tokens)).toISOString(), reason: 'every token in it expired' };
    }
    if (live[0] - now < SOON_MS) {
      return { file, verdict: 'expires-soon', expiresAt: new Date(live[0]).toISOString(), reason: 'a token in it expires within a day' };
    }
    return { file, verdict: 'not-expired', expiresAt: new Date(live[0]).toISOString(), reason: 'its tokens have not expired' };
  }
  // Without a token, only "every cookie that has a date is past it, and none lives for the browser
  // session" says anything: a cookie that has not expired may well not be the one that signs in.
  const dated = cookies.filter((cookie) => cookie && typeof cookie.expires === 'number' && cookie.expires > 0);
  const sessionOnly = cookies.some((cookie) => cookie && (typeof cookie.expires !== 'number' || cookie.expires <= 0));
  if (dated.length > 0 && !sessionOnly && dated.every((cookie) => cookie.expires * 1000 <= now)) {
    return {
      file,
      verdict: 'expired',
      expiredAt: new Date(Math.max(...dated.map((cookie) => cookie.expires * 1000))).toISOString(),
      reason: 'every cookie in it expired',
    };
  }
  return { file, verdict: 'unknown', reason: 'nothing in it says when it expires' };
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

// Which roles the project has DECLARED, read from the per-role credential slots scripts/
// env-role-stubs.mjs writes into .env during /auth-setup ("E2E_ADMIN_USERNAME" -> "admin"). This is
// the durable record of "how many roles does this app have" - the answer the human gave once, still
// on disk afterwards - so a later stage can compare it against what was actually captured instead
// of asking again. Slot presence is what counts, filled or not: a slot exists because a role was
// named, and an empty one means "declared, not filled in yet".
function readDeclaredRoles() {
  if (!fs.existsSync(ENV_PATH)) return [];
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const roles = new Set();
  for (const rawLine of content.split('\\n')) {
    const line = rawLine.trim().replace(/^#\\s*/, '');
    const match = line.match(/^E2E_([A-Z0-9_]+)_USERNAME\\s*=/);
    if (match) roles.add(match[1].toLowerCase());
  }
  return Array.from(roles).sort();
}

function main() {
  const filledEnvKeys = readFilledEnvKeys();
  const sessionFiles = listSessionFiles();
  const ciProvider = readCiProvider();
  const declaredRoles = readDeclaredRoles();

  const hasSession = sessionFiles.length > 0;
  const capturedRoles = sessionFiles.map((f) => f.replace(/\\.json$/, '')).sort();
  // A role is only "missing" when it was explicitly declared and has no session file of its own.
  // The flat single-user case declares no roles at all, so this is empty there by construction.
  const rolesMissingSession = declaredRoles.filter((r) => !capturedRoles.includes(r));
  const authEnvFilled = ['E2E_USERNAME', 'E2E_API_TOKEN', 'AUTH_TOKEN'].some((k) =>
    filledEnvKeys.includes(k),
  );

  const health = sessionFiles.map(sessionHealth);
  const expired = health.filter((entry) => entry.verdict === 'expired');

  const result = {
    sessionFiles,
    hasSession,
    capturedRoles,
    declaredRoles,
    rolesMissingSession,
    sessionHealth: health,
    filledEnvKeys,
    authEnvFilled,
    ciProvider,
    recordedLogin: readRecordedLogin(),
    nextStep: hasSession
      ? expired.length > 0
        ? 'session-expired'
        : rolesMissingSession.length > 0
          ? 'roles-incomplete'
          : 'session-exists'
      : 'capture-needed',
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

main();
`;
}
