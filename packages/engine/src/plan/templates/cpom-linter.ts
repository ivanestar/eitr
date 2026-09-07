// Template for generating scripts/lint-cpom.js in scaffolded projects. create-if-absent.

export function renderCpomLinter(): string {
  return `#!/usr/bin/env node

/**
 * CPOM Contract & Anti-Fake-Green Linter
 * Zero-dependency static rule auditor for Page Objects, Components, and Test Specs.
 *
 * Rules enforced:
 * 1. Zero Arbitrary Delays (No sleep, setTimeout, or page.waitForTimeout)
 * 2. Mandatory Now() Suffix for non-retrying boolean/string state getters in components
 * 3. Zero Assertions inside Component & Page Object classes (expect inside components/)
 * 4. Unawaited Promise Guard in test assertions (e.g. expect(locator.isVisible()).toBeTruthy())
 * 5. Fixture Dependency Injection (No direct new PageObject(page) in tests)
 * 6. Anti-Over-Mocking Guard (No page.route/context.route/browserContext.route/routeFromHAR or
 *    cy.intercept in test specs without a structured "// @allow-mock: <reason>" annotation)
 * 7. Hardcoded Credential Literal (No credential-shaped string literal filled into a
 *    password/username/email/token field in a test spec, unless annotated with a structured
 *    "// @allow-credential-literal: <reason>" - the one legitimate case being a deliberately
 *    wrong value in a rejection test)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.auth',
  '.tms-cache',
  'test-results',
  'playwright-report',
]);

// Known Playwright/DOM built-ins matching the (is|has|get)[A-Z]... shape that are never
// themselves a point-in-time state read needing a Now() suffix - calling one of these from
// inside a properly-suffixed method (e.g. link.ts's getHrefNow() wrapping getAttribute('href'))
// must not trip Rule 2 a second time on the same line.
const STRUCTURAL_GETTER_EXEMPTIONS = new Set([
  'getAttribute',
  'getByRole',
  'getByTestId',
  'getByLabel',
  'getByText',
  'getByAltText',
  'getByPlaceholder',
  'getByTitle',
  'getByDisplayValue',
  'getAnimations',
  'getOwnPropertyDescriptor',
  'getPrototypeOf',
  'isChecked',
  'isVisible',
  'isHidden',
  'isEnabled',
  'isEditable',
  'isDisabled',
]);

// Rule 6 suppression: a "// @allow-mock: <reason>" comment on the flagged line, the line before,
// or the line after, with a non-empty reason - legitimate 3rd-party isolation (analytics, Sentry)
// must state why, not just silence the rule.
const ALLOW_MOCK_PATTERN = /\\/\\/\\s*@allow-mock:\\s*\\S.*/;

function hasAllowMockSuppression(fileLines, idx) {
  return [fileLines[idx], fileLines[idx - 1], fileLines[idx + 1]].some(
    (candidate) => candidate !== undefined && ALLOW_MOCK_PATTERN.test(candidate),
  );
}

// Rule 7: a literal typed into a credential-shaped field. A working account's credentials belong in
// environment variables, and a value that merely needs to be valid belongs in a test-data helper -
// either way, not inline in a spec. The escape hatch exists because one legitimate case does need a
// literal: a deliberately wrong password in a rejection test is test data, not a secret. Same shape
// as Rule 6's suppression, so there is one convention to learn rather than two.
const CREDENTIAL_TARGET_PATTERN = /(?:password|passwd|pwd|username|user_?name|email|login|token|secret|api_?key)/i;
// The receiver segment immediately before .fill()/.type(), plus that call's arguments. Matching the
// receiver rather than the whole line is what keeps loginPage.searchInput.fill('shoes') clean: the
// page object is called "loginPage", which a line-wide match would flag every time.
const FILL_CALL_PATTERN = /([A-Za-z0-9_$]+)\\s*\\.\\s*(?:fill|type)\\s*\\(([^)]*)\\)/;
const STRING_LITERAL_PATTERN = /(['"])((?:(?!\\1).)*)\\1/g;
const ALLOW_CREDENTIAL_PATTERN = /\\/\\/\\s*@allow-credential-literal:\\s*\\S.*/;

function credentialLiteralViolation(line) {
  const call = line.match(FILL_CALL_PATTERN);
  if (!call) return false;
  const receiver = call[1];
  const args = call[2];

  const literals = [];
  STRING_LITERAL_PATTERN.lastIndex = 0;
  let match;
  while ((match = STRING_LITERAL_PATTERN.exec(args)) !== null) {
    literals.push(match[2]);
  }
  if (literals.length === 0) return false;

  // The value is always the last string argument; an empty one is a legitimate boundary case.
  if (literals[literals.length - 1] === '') return false;

  // Page-level two-argument form (page.fill('#password', 'x')) names its target in the selector,
  // not the receiver - check both so neither call style slips through.
  const target = literals.length >= 2 ? receiver + ' ' + literals[0] : receiver;
  return CREDENTIAL_TARGET_PATTERN.test(target);
}

function hasAllowCredentialSuppression(fileLines, idx) {
  return [fileLines[idx], fileLines[idx - 1], fileLines[idx + 1]].some(
    (candidate) => candidate !== undefined && ALLOW_CREDENTIAL_PATTERN.test(candidate),
  );
}

const violations = [];

function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (entry.isFile() && /\\.(ts|js|tsx|jsx|mjs)$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function auditFile(filePath) {
  const relPath = path.relative(CWD, filePath).replace(/\\\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\\r?\\n/);
  const isComponent = relPath.startsWith('components/');
  const isTest = (relPath.startsWith('tests/') || relPath.startsWith('cypress/e2e/')) && !relPath.startsWith('fixtures/');
  const isFixtureOrSetup = relPath.includes('fixtures.') || relPath.includes('auth.setup.') || relPath.includes('setup.') || relPath.startsWith('fixtures/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip full-line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // Rule 1: Zero Arbitrary Delays
    if (
      /page\\.waitForTimeout\\(/.test(line) ||
      /\\bsetTimeout\\s*\\(/.test(line) ||
      /\\bsleep\\s*\\(/.test(line)
    ) {
      violations.push({
        file: relPath,
        line: lineNum,
        rule: 'Rule 1: Zero Arbitrary Delays',
        message: 'Arbitrary delay detected. Use web-first auto-retrying assertions or state waiters instead.',
        snippet: trimmed,
      });
    }

    // Rule 2: Mandatory Now() Suffix for snapshot state getters in components
    if (isComponent) {
      const stateGetterMatch = line.match(/(?:async\\s+)?\\b(is|has|get)[A-Z][a-zA-Z0-9_]*\\s*\\([^)]*\\)/);
      if (stateGetterMatch && !line.includes('Now(') && !line.includes('constructor') && !line.includes('_child')) {
        const methodName = stateGetterMatch[0].split('(')[0].replace(/^(?:async\\s+)/, '').trim();
        if (
          (methodName.startsWith('is') || methodName.startsWith('has') || methodName.startsWith('get')) &&
          !methodName.endsWith('Now') &&
          !methodName.startsWith('isAttached') &&
          !STRUCTURAL_GETTER_EXEMPTIONS.has(methodName)
        ) {
          violations.push({
            file: relPath,
            line: lineNum,
            rule: 'Rule 2: Mandatory Now() Suffix',
            message: 'State reader "' + methodName + '" in component must have "Now()" suffix (e.g. ' + methodName + 'Now()) to signify point-in-time read.',
            snippet: trimmed,
          });
        }
      }
    }

    // Rule 3: Zero Assertions in Components
    if (isComponent) {
      if (/\\bexpect\\s*\\(/.test(line) && !line.includes('expect:')) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'Rule 3: Zero Assertions in Components',
          message: 'Assertion "expect(...)" found in component. Components must only provide locators and actions; assertions belong in test specs.',
          snippet: trimmed,
        });
      }
    }

    // Rule 4: Unawaited Promise Guard in Tests
    if (isTest) {
      if (/expect\\s*\\([\\s\\S]*?\\.(?:isVisible|isEnabled|isChecked|isHidden|isDisabled|isEditable)\\(\\)\\s*\\)\\s*\\.(?:toBeTruthy|toBeFalsy)\\(\\)/.test(line)) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'Rule 4: Unawaited Promise Guard',
          message: 'Unawaited promise inside assertion detected (always evaluates truthy). Use "await expect(locator).toBeVisible()" instead.',
          snippet: trimmed,
        });
      }
    }

    // Rule 5: Fixture Dependency Injection in Tests
    if (isTest && !isFixtureOrSetup) {
      if (/new\\s+[A-Z][a-zA-Z0-9]*(?:Page|Component)\\s*\\(/.test(line)) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'Rule 5: Fixture Dependency Injection',
          message: 'Direct Page Object instantiation detected in test spec. Inject Page Objects via Playwright test.extend fixtures instead.',
          snippet: trimmed,
        });
      }
    }

    // Rule 6: Anti-Over-Mocking Guard
    if (isTest && !isFixtureOrSetup) {
      if (
        /\\b(?:page|context|browserContext)\\.(?:route|routeFromHAR)\\s*\\(|\\bcy\\.intercept\\s*\\(/.test(
          line,
        ) &&
        !hasAllowMockSuppression(lines, i)
      ) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'Rule 6: Inappropriate Mocking Guard',
          message: 'Network route interception/mocking detected in a test spec. This can mask a real backend defect behind a fake-green test. If this is legitimate 3rd-party isolation (e.g. analytics, Sentry), annotate with "// @allow-mock: <reason>".',
          snippet: trimmed,
        });
      }
    }

    // Rule 7: Hardcoded Credential Literal
    if (isTest && !isFixtureOrSetup) {
      if (credentialLiteralViolation(line) && !hasAllowCredentialSuppression(lines, i)) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'Rule 7: Hardcoded Credential Literal',
          message: 'Credential-shaped literal typed into a credential field in a test spec. Read a real account\\'s value from an environment variable (e.g. process.env.E2E_PASSWORD, or the per-role E2E_<ROLE>_PASSWORD), or generate one via the project\\'s test-data helpers. If this literal is deliberately invalid test data for a rejection case, annotate with "// @allow-credential-literal: <reason>".',
          snippet: trimmed,
        });
      }
    }
  }
}

function run() {
  const targetDirs = ['components', 'tests', 'fixtures', 'cypress', 'shared'].filter((d) =>
    fs.existsSync(path.join(CWD, d)),
  );

  if (targetDirs.length === 0) {
    process.stdout.write('[INFO] No components or tests directory found to lint.\\n');
    process.exit(0);
  }

  const allFiles = [];
  for (const dir of targetDirs) {
    walkDir(path.join(CWD, dir), allFiles);
  }

  for (const file of allFiles) {
    auditFile(file);
  }

  if (violations.length === 0) {
    process.stdout.write('[PASS] CPOM Contract & Anti-Fake-Green Audit Passed (' + allFiles.length + ' files checked).\\n');
    process.exit(0);
  } else {
    process.stderr.write('\\n[FAIL] CPOM Contract Violations Found (' + violations.length + ' issues):\\n\\n');
    for (const v of violations) {
      process.stderr.write('  ' + v.file + ':' + v.line + ' [' + v.rule + ']\\n');
      process.stderr.write('    Error: ' + v.message + '\\n');
      process.stderr.write('    Code:  ' + v.snippet + '\\n\\n');
    }
    process.exit(1);
  }
}

run();
`;
}
