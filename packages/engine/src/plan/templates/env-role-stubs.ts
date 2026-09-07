// Template for scripts/env-role-stubs.mjs — creates one labeled credential slot per role in `.env`
// at the moment /auth-setup learns how many roles the app has.
//
// Naming follows the role-infix form (`E2E_ADMIN_USERNAME`, not `E2E_USERNAME_ADMIN`): it is what
// real multi-role Playwright setups use, it groups a role's variables together alphabetically in
// `.env`, in a CI secret list, and in `gh secret list`, and it keeps each value individually
// maskable and rotatable - which a single JSON blob of all users would not. A single-role project
// keeps the flat `E2E_USERNAME`/`E2E_PASSWORD` names unchanged rather than gaining a pointless
// `E2E_USER_*` rename.
//
// Writing this deterministically rather than leaving it to the assistant matters for the same
// reason the rest of the pipeline's status scripts exist: "which variable names should exist for
// these role names" is a pure function of the role list, and a model composing them freshly each
// run is exactly how a name drifts between `.env`, the fixture that reads it, and the CI secret.
export function renderEnvRoleStubs(): string {
  return `#!/usr/bin/env node

/**
 * Adds an empty credential slot per role to .env - never overwrites a value, never prints one.
 *
 * Usage:
 *   node scripts/env-role-stubs.mjs --roles=admin,customer
 *
 * Idempotent: re-running with the same roles reports them as already present and changes nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const ENV_PATH = path.join(CWD, '.env');
const BLOCK_HEADER = '# --- Per-role credentials (added by /auth-setup) ---';

function argValue(name) {
  const prefix = '--' + name + '=';
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function fail(message) {
  process.stderr.write('[env-role-stubs] ' + message + '\\n');
  process.exit(1);
}

// The slug becomes part of an environment variable name, so it is validated rather than rewritten:
// silently mangling an unexpected role name would produce a variable the human never sees coming
// and cannot correlate with the role they typed.
function normalizeRole(raw) {
  const slug = raw.trim().toLowerCase().replace(/[\\s-]+/g, '_');
  if (!/^[a-z0-9_]+$/.test(slug)) return null;
  return slug;
}

function envVarNames(slug) {
  const upper = slug.toUpperCase();
  return ['E2E_' + upper + '_USERNAME', 'E2E_' + upper + '_PASSWORD'];
}

// Matches the variable whether it is live (\`NAME=value\`) or commented out (\`# NAME=\`) - a
// commented placeholder is already a slot the human can fill in, so re-adding it would just
// duplicate the line on every run.
function hasVariable(contents, name) {
  const pattern = new RegExp('^\\\\s*#?\\\\s*' + name + '\\\\s*=', 'm');
  return pattern.test(contents);
}

function main() {
  const rolesArg = argValue('roles');
  if (!rolesArg) {
    fail('missing --roles=<comma-separated role names>');
  }

  const rawRoles = rolesArg
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  if (rawRoles.length === 0) {
    fail('--roles was empty - pass at least one role name');
  }

  const roles = [];
  for (const raw of rawRoles) {
    const slug = normalizeRole(raw);
    if (slug === null) {
      fail('invalid role name "' + raw + '" - use letters, digits, spaces or hyphens only');
    }
    if (!roles.includes(slug)) roles.push(slug);
  }

  const envExisted = fs.existsSync(ENV_PATH);
  let contents = envExisted ? fs.readFileSync(ENV_PATH, 'utf8') : '';

  const added = [];
  const alreadyPresent = [];
  const newLines = [];
  for (const slug of roles) {
    for (const name of envVarNames(slug)) {
      if (hasVariable(contents, name)) {
        alreadyPresent.push(name);
      } else {
        added.push(name);
        newLines.push(name + '=');
      }
    }
  }

  if (newLines.length > 0) {
    const needsBlockHeader = !contents.includes(BLOCK_HEADER);
    const prefix = contents.length > 0 && !contents.endsWith('\\n') ? '\\n' : '';
    const header = needsBlockHeader ? '\\n' + BLOCK_HEADER + '\\n' : '';
    fs.writeFileSync(ENV_PATH, contents + prefix + header + newLines.join('\\n') + '\\n', 'utf8');
  }

  const result = {
    envPath: path.relative(CWD, ENV_PATH),
    envCreated: !envExisted,
    roles,
    added,
    alreadyPresent,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
}

main();
`;
}
