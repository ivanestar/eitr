import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planSharedScaffold } from '../src/plan/shared.js';
import { plan } from '../src/plan/plan.js';
import { renderCpomLinterPython } from '../src/plan/templates/cpom-linter-python.js';
import { renderCpomLinterJava } from '../src/plan/templates/cpom-linter-java.js';
import { renderCpomLinterCsharp } from '../src/plan/templates/cpom-linter-csharp.js';
import { renderJavaLink } from '../src/plan/templates/java/project.js';
import type { StackProfile } from '../src/types/stack-profile.js';

function commandAvailable(cmd: string, args: string[]): boolean {
  try {
    const result = spawnSync(cmd, args, { stdio: 'ignore' });
    return result.error === undefined && result.status !== null;
  } catch {
    return false;
  }
}

const pythonCmd = commandAvailable('python', ['--version'])
  ? 'python'
  : commandAvailable('python3', ['--version'])
    ? 'python3'
    : null;
const javaAvailable = commandAvailable('java', ['-version']);

describe('Per-language CPOM contract linter parity', () => {
  const dummyProfile: StackProfile = {
    testRunner: { value: 'playwright', confidence: 'high' },
    language: { value: 'typescript', confidence: 'high' },
    framework: { value: 'react', confidence: 'high' },
    styling: { value: 'tailwind', confidence: 'high' },
    testIdAttribute: { value: 'data-testid', confidence: 'high' },
  };

  it('emits scripts/lint_cpom.py only for language: python', () => {
    const pythonFiles = planSharedScaffold({ language: 'python', automationTool: 'pytest' });
    expect(pythonFiles.map((f) => f.path)).toContain('scripts/lint_cpom.py');

    const tsFiles = planSharedScaffold({ language: 'typescript', automationTool: 'playwright' });
    expect(tsFiles.map((f) => f.path)).not.toContain('scripts/lint_cpom.py');
  });

  it('emits scripts/LintCpom.java only for language: java', () => {
    const javaFiles = planSharedScaffold({ language: 'java', automationTool: 'playwright-maven' });
    expect(javaFiles.map((f) => f.path)).toContain('scripts/LintCpom.java');

    const csharpFiles = planSharedScaffold({ language: 'csharp', automationTool: 'playwright' });
    expect(csharpFiles.map((f) => f.path)).not.toContain('scripts/LintCpom.java');
  });

  it('emits scripts/LintCpom.cs only for language: csharp', () => {
    const csharpFiles = planSharedScaffold({ language: 'csharp', automationTool: 'playwright' });
    expect(csharpFiles.map((f) => f.path)).toContain('scripts/LintCpom.cs');

    const javaFiles = planSharedScaffold({ language: 'java', automationTool: 'playwright-maven' });
    expect(javaFiles.map((f) => f.path)).not.toContain('scripts/LintCpom.cs');
  });

  it('Python linter documents Rules 1-3 real, Rule 4 N/A, Rule 5 deferred', () => {
    const text = renderCpomLinterPython();
    expect(text).toContain('Rule 1: Zero Arbitrary Delays');
    expect(text).toContain('Rule 2: Mandatory _now Suffix');
    expect(text).toContain('Rule 3: Zero Assertions in Components');
    expect(text).toContain('N/A for Python');
    expect(text).toContain('Deferred');
    expect(text).not.toContain('EITR');
    expect(text).not.toContain('Eitr');
  });

  it('Java linter covers all 5 rules with Now()/get*Now() parity', () => {
    const text = renderCpomLinterJava();
    expect(text).toContain('Rule 1: Zero Arbitrary Delays');
    expect(text).toContain('Rule 2: Mandatory Now() Suffix');
    expect(text).toContain('Rule 3: Zero Assertions in Components');
    expect(text).toContain('Rule 4: Non-Retrying State Assertion Guard');
    expect(text).toContain('Rule 5: Fixture Dependency Injection');
    expect(text).not.toContain('EITR');
    expect(text).not.toContain('Eitr');
  });

  it('C# linter covers all 5 rules, flags raw Assert.* as the anti-pattern, and recognizes Expect(...) as the real assertion idiom', () => {
    const text = renderCpomLinterCsharp();
    expect(text).toContain('Rule 1: Zero Arbitrary Delays');
    expect(text).toContain('Rule 2: Mandatory NowAsync() Suffix');
    expect(text).toContain('Rule 3: Zero Assertions in Components');
    expect(text).toContain('Rule 4: Non-Retrying State Assertion Guard');
    expect(text).toContain('Rule 5: Fixture Dependency Injection');
    // Rule 3 flags an assertion of ANY kind inside a component (Assert.* or Expect(...) alike -
    // components must have neither); Rule 4 specifically flags a raw Assert.That/IsTrue/IsFalse
    // wrapping a state-read call in tests, recommending Expect(...) instead. Both patterns must
    // be present for the linter to actually catch what its own rule descriptions promise.
    expect(text).toContain('"Expect("');
    expect(text).toContain('Assert.That(');
    expect(text).not.toContain('EITR');
    expect(text).not.toContain('Eitr');
  });

  it('Link.java no longer duplicates hrefNow()/getHrefNow()', () => {
    const text = renderJavaLink();
    expect(text).toContain('getHrefNow');
    expect(text).not.toMatch(/public String hrefNow\(\)/);
  });

  it('full plan() includes the language-appropriate linter for python/java/csharp', () => {
    const pythonPlan = plan(dummyProfile, {
      language: 'python',
      automationTool: 'pytest',
      ciCd: 'github',
    });
    expect(pythonPlan.files.map((f) => f.path)).toContain('scripts/lint_cpom.py');

    const javaPlan = plan(dummyProfile, {
      language: 'java',
      automationTool: 'playwright-maven',
      ciCd: 'github',
    });
    expect(javaPlan.files.map((f) => f.path)).toContain('scripts/LintCpom.java');

    const csharpPlan = plan(dummyProfile, {
      language: 'csharp',
      automationTool: 'playwright',
      ciCd: 'github',
    });
    expect(csharpPlan.files.map((f) => f.path)).toContain('scripts/LintCpom.cs');
  });

  it.skipIf(pythonCmd === null)(
    'Python linter is syntactically valid (python -m py_compile)',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'eitr-lint-py-'));
      try {
        const filePath = join(dir, 'lint_cpom.py');
        writeFileSync(filePath, renderCpomLinterPython(), 'utf8');
        const result = spawnSync(pythonCmd as string, ['-m', 'py_compile', filePath], {
          encoding: 'utf8',
        });
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!javaAvailable)(
    'Java linter runs via single-file source-launch and reports [INFO] on an empty project',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'eitr-lint-java-'));
      try {
        const filePath = join(dir, 'LintCpom.java');
        writeFileSync(filePath, renderCpomLinterJava(), 'utf8');
        const result = spawnSync('java', ['LintCpom.java'], { cwd: dir, encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('[INFO] No components or tests directory found to lint.');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!javaAvailable)(
    'Java Rule 2 exempts structural-return-type getters by type, not by a fixed name list, while still catching a real violation',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'eitr-lint-java-rule2-'));
      try {
        const filePath = join(dir, 'LintCpom.java');
        writeFileSync(filePath, renderCpomLinterJava(), 'utf8');
        const componentsDir = join(dir, 'src', 'main', 'java', 'components');
        mkdirSync(componentsDir, { recursive: true });
        writeFileSync(
          join(componentsDir, 'Widget.java'),
          [
            'public class Widget {',
            '    public Locator getRootLocator() { return root; }',
            '    public String getPlaceholderNow() { return ""; }',
            '    public String getPlaceholder() { return ""; }',
            '}',
          ].join('\n'),
          'utf8',
        );
        const result = spawnSync('java', ['LintCpom.java'], { cwd: dir, encoding: 'utf8' });
        expect(result.status).toBe(1);
        const rule2Violations = (result.stderr.match(/Rule 2: Mandatory Now\(\) Suffix/g) ?? [])
          .length;
        // Exactly one real violation: getPlaceholder(). getRootLocator() (structural return type)
        // and getPlaceholderNow() (already compliant) must not add a second/third violation.
        expect(rule2Violations).toBe(1);
        expect(result.stderr).toContain('State reader "getPlaceholder" in component');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('C# linter is structurally well-formed (best-effort, no .NET 10 SDK assumed present)', () => {
    const text = renderCpomLinterCsharp();
    const openBraces = (text.match(/\{/g) ?? []).length;
    const closeBraces = (text.match(/\}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
    expect(text).toContain('using System;');
    expect(text).toContain('void Walk(');
    expect(text).toContain('void AuditFile(');
  });
});
