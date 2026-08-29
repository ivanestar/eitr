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
  const isTest = relPath.startsWith('tests/') || relPath.startsWith('cypress/e2e/');
  const isFixtureOrSetup = relPath.includes('fixtures.') || relPath.includes('auth.setup.') || relPath.includes('setup.');

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
      const stateGetterMatch = line.match(/(?:async\\s+)?\\b(is|has)[A-Z][a-zA-Z0-9_]*\\s*\\([^)]*\\)/);
      if (stateGetterMatch && !line.includes('Now(') && !line.includes('constructor') && !line.includes('_child')) {
        const methodName = stateGetterMatch[0].split('(')[0].replace(/^(?:async\\s+)/, '').trim();
        if (
          (methodName.startsWith('is') || methodName.startsWith('has')) &&
          !methodName.endsWith('Now') &&
          !methodName.startsWith('isAttached')
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
  }
}

function run() {
  const targetDirs = ['components', 'tests', 'cypress', 'shared'].filter((d) =>
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
