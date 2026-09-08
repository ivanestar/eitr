#!/usr/bin/env node

/**
 * Materializes a named starting state in a generated project, so /auth-setup can be exercised from
 * a known position without assembling one by hand every time.
 *
 * The four states below are the branches auth-status.mjs can report. Building them by hand - create
 * .auth/user.json, add an E2E_ADMIN_USERNAME= slot to .env, regenerate with --ci-cd none - is
 * fiddly enough that it gets done slightly differently each time, which makes two runs of the same
 * flow not actually comparable.
 *
 * Usage:
 *   node scripts/seed-auth-state.mjs --list
 *   node scripts/seed-auth-state.mjs --target=<generated project> --state=<name> [--dry-run]
 *   node scripts/seed-auth-state.mjs --target=<generated project> --state=<name> --verify
 *
 * --verify runs the target's own scripts/auth-status.mjs afterwards and checks it actually reports
 * the state that was asked for, so the seeder cannot drift away from what the flow really reads.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

// A plausible saved session: the shape Playwright's storageState writes, with nothing real in it.
const SESSION_FIXTURE = {
  cookies: [
    {
      name: 'session',
      value: 'seeded-not-a-real-session',
      domain: 'app.example.com',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ],
  origins: [],
};

const CI_MARKER_FILES = [
  path.join('.github', 'workflows', 'playwright.yml'),
  '.gitlab-ci.yml',
  'Jenkinsfile',
  path.join('.teamcity', 'settings.kts'),
];

const STATES = {
  fresh: {
    description: 'No session captured, no roles declared, CI present. The first-run position.',
    sessions: [],
    declaredRoles: [],
    ci: 'keep',
    expect: { nextStep: 'capture-needed', hasSession: false },
  },
  'session-exists': {
    description:
      'One saved session, no roles declared. The re-run position for a flat single user.',
    sessions: ['user'],
    declaredRoles: [],
    ci: 'keep',
    expect: { nextStep: 'session-exists', hasSession: true },
  },
  'roles-incomplete': {
    description:
      'Two roles declared, only one captured. The position where the flow has to notice a gap.',
    sessions: ['admin'],
    declaredRoles: ['admin', 'viewer'],
    ci: 'keep',
    expect: { nextStep: 'roles-incomplete', hasSession: true, rolesMissingSession: ['viewer'] },
  },
  'no-ci': {
    description:
      'No session and no CI pipeline of any kind, so the flow must not offer to wire secrets.',
    sessions: [],
    declaredRoles: [],
    ci: 'remove',
    expect: { nextStep: 'capture-needed', ciProvider: null },
  },
};

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) args[raw.slice(2)] = true;
    else args[raw.slice(2, eq)] = raw.slice(eq + 1);
  }
  return args;
}

function fail(message) {
  process.stdout.write(JSON.stringify({ error: message }, null, 2) + '\n');
  process.exit(1);
}

// Refuses to act on anything that is not recognisably one of this generator's own outputs. The
// script deletes .auth/ and rewrites .env, and pointing it at a source tree by mistake - this
// repository included - has to be impossible rather than merely unlikely.
function resolveTarget(raw) {
  if (typeof raw !== 'string' || raw === '') {
    fail('--target=<generated project directory> is required');
  }
  const target = path.resolve(process.cwd(), raw);
  if (!fs.existsSync(path.join(target, 'scripts', 'auth-status.mjs'))) {
    fail(
      target +
        ' does not look like a generated project - scripts/auth-status.mjs is missing, and this ' +
        'script rewrites .env and .auth/ so it refuses to touch anything else.',
    );
  }
  if (fs.existsSync(path.join(target, 'packages', 'engine'))) {
    fail(target + " looks like this generator's own source tree, not a generated project.");
  }
  return target;
}

// Rewrites the per-role credential slots and nothing else: any other variable a human put in .env
// (a base URL, a token) stays exactly as it was.
function rewriteEnvRoleSlots(envPath, declaredRoles) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const kept = existing
    .split('\n')
    .filter((line) => !/^#?\s*E2E_[A-Z0-9_]+_(USERNAME|PASSWORD)\s*=/.test(line.trim()));
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();

  if (declaredRoles.length > 0) {
    kept.push('');
    kept.push('# Per-role credential slots, seeded for a known starting state.');
    for (const role of declaredRoles) {
      const upper = role.toUpperCase();
      kept.push('E2E_' + upper + '_USERNAME=');
      kept.push('E2E_' + upper + '_PASSWORD=');
    }
  }
  return kept.join('\n') + '\n';
}

function seed(target, stateName, dryRun) {
  const state = STATES[stateName];
  const changes = [];
  const authDir = path.join(target, '.auth');
  const envPath = path.join(target, '.env');

  const existingSessions = fs.existsSync(authDir)
    ? fs.readdirSync(authDir).filter((name) => name.endsWith('.json'))
    : [];
  for (const name of existingSessions) {
    changes.push({ action: 'delete', path: path.join('.auth', name) });
    if (!dryRun) fs.rmSync(path.join(authDir, name));
  }
  for (const role of state.sessions) {
    changes.push({ action: 'write', path: path.join('.auth', role + '.json') });
    if (!dryRun) {
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, role + '.json'),
        JSON.stringify(SESSION_FIXTURE, null, 2) + '\n',
        'utf8',
      );
    }
  }

  changes.push({
    action: 'rewrite-role-slots',
    path: '.env',
    roles: state.declaredRoles,
  });
  if (!dryRun) fs.writeFileSync(envPath, rewriteEnvRoleSlots(envPath, state.declaredRoles), 'utf8');

  if (state.ci === 'remove') {
    for (const marker of CI_MARKER_FILES) {
      const full = path.join(target, marker);
      if (!fs.existsSync(full)) continue;
      changes.push({ action: 'delete', path: marker });
      if (!dryRun) fs.rmSync(full);
    }
    // auth-status falls back to the questionnaire's own record when no pipeline file is on disk, so
    // a state that claims "no CI" has to clear that too or it reports a provider that is not there.
    const initPath = path.join(target, '.scaffold', 'init.json');
    if (fs.existsSync(initPath)) {
      try {
        const init = JSON.parse(fs.readFileSync(initPath, 'utf8'));
        if (init && typeof init === 'object' && init.ciCd && init.ciCd !== 'none') {
          changes.push({ action: 'set', path: path.join('.scaffold', 'init.json'), ciCd: 'none' });
          if (!dryRun) {
            init.ciCd = 'none';
            fs.writeFileSync(initPath, JSON.stringify(init, null, 2) + '\n', 'utf8');
          }
        }
      } catch {
        // An unreadable init.json already reports no provider, which is what this state wants.
      }
    }
  }

  return changes;
}

function readAuthStatus(target) {
  const result = spawnSync('node', [path.join('scripts', 'auth-status.mjs')], {
    cwd: target,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail('scripts/auth-status.mjs failed in ' + target + ': ' + (result.stderr || '').trim());
  }
  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    fail('scripts/auth-status.mjs did not return JSON: ' + err.message);
  }
}

function verify(target, stateName) {
  const observed = readAuthStatus(target);
  const mismatches = [];
  for (const [field, expected] of Object.entries(STATES[stateName].expect)) {
    const actual = observed[field];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      mismatches.push({ field, expected, actual });
    }
  }
  return { mismatches, observed };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    process.stdout.write(
      JSON.stringify(
        {
          action: 'list',
          states: Object.entries(STATES).map(([name, state]) => ({
            name,
            description: state.description,
          })),
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const stateName = typeof args.state === 'string' ? args.state : '';
  if (!Object.prototype.hasOwnProperty.call(STATES, stateName)) {
    fail(
      '--state must be one of ' +
        Object.keys(STATES).join('|') +
        ' (got ' +
        (stateName || '(none)') +
        '); run --list for what each one is.',
    );
  }

  const target = resolveTarget(args.target);
  const dryRun = args['dry-run'] === true;
  const changes = seed(target, stateName, dryRun);

  const result = {
    action: dryRun ? 'dry-run' : 'seed',
    state: stateName,
    target,
    changes,
  };

  if (args.verify) {
    if (dryRun)
      fail('--verify cannot be combined with --dry-run - there is nothing to verify yet.');
    const { mismatches, observed } = verify(target, stateName);
    result.verified = mismatches.length === 0;
    result.mismatches = mismatches;
    result.authStatus = observed;
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (mismatches.length > 0) process.exit(1);
    return;
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main();
