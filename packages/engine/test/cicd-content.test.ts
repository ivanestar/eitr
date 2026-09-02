import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import {
  renderGithubActions,
  renderGitlabCi,
  renderJenkinsfile,
  renderTeamcityKotlinDsl,
  renderTeamcityInstructions,
} from '../src/plan/templates/cicd.js';
import { planSharedScaffold } from '../src/plan/shared.js';

const LANG_TOOL_BRANCHES: Array<[string | undefined, string | undefined]> = [
  ['python', undefined],
  ['csharp', undefined],
  ['java', 'maven'],
  ['java', 'gradle'],
  [undefined, undefined],
];

describe('cicd.ts content assertions', () => {
  // ── GitLab CI ──────────────────────────────────────────────────────────
  it('GitLab CI python branch: pip-audit + anti-dup rule', () => {
    const yaml = renderGitlabCi('python');
    expect(yaml).toContain('pip install pip-audit && pip-audit');
    expect(yaml).toContain('CI_OPEN_MERGE_REQUESTS');
  });

  it('GitLab CI csharp branch: dotnet vulnerability audit + anti-dup rule', () => {
    const yaml = renderGitlabCi('csharp');
    expect(yaml).toContain('dotnet list package --vulnerable --include-transitive');
    expect(yaml).toContain('CI_OPEN_MERGE_REQUESTS');
  });

  it('GitLab CI java-maven branch: mvn test, not gradle test', () => {
    const yaml = renderGitlabCi('java', 'maven');
    expect(yaml).toContain('mvn test');
    expect(yaml).not.toContain('gradle test');
    expect(yaml).toContain('CI_OPEN_MERGE_REQUESTS');
  });

  it('GitLab CI java-gradle branch: gradle test, not mvn test', () => {
    const yaml = renderGitlabCi('java', 'gradle');
    expect(yaml).toContain('gradle test');
    expect(yaml).not.toContain('mvn test');
    expect(yaml).toContain('CI_OPEN_MERGE_REQUESTS');
  });

  it('GitLab CI default (TS/JS) branch: npm audit + sharding + anti-dup rule', () => {
    const yaml = renderGitlabCi(undefined, undefined);
    expect(yaml).toContain('npm audit --audit-level=high');
    expect(yaml).toContain('--shard=$CI_NODE_INDEX/$CI_NODE_TOTAL');
    expect(yaml).toContain('CI_OPEN_MERGE_REQUESTS');
  });

  // ── Jenkinsfile ────────────────────────────────────────────────────────
  it('Jenkinsfile python branch: pytest-split shard matrix + pip-audit', () => {
    const jf = renderJenkinsfile('python');
    expect(jf).toContain('pytest --splits 4 --group $SHARD');
    expect(jf).toContain('pip install pip-audit && pip-audit');
  });

  it('Jenkinsfile csharp branch: dotnet test + vulnerability audit', () => {
    const jf = renderJenkinsfile('csharp');
    expect(jf).toContain('dotnet test --logger');
    expect(jf).toContain('dotnet list package --vulnerable --include-transitive');
  });

  it('Jenkinsfile java-maven branch: mvn test, not gradle test', () => {
    const jf = renderJenkinsfile('java', 'maven');
    expect(jf).toContain('mvn test');
    expect(jf).not.toContain('gradle test');
  });

  it('Jenkinsfile java-gradle branch: gradle test, not mvn test', () => {
    const jf = renderJenkinsfile('java', 'gradle');
    expect(jf).toContain('gradle test');
    expect(jf).not.toContain('mvn test');
  });

  it('Jenkinsfile default (TS/JS) branch: playwright shard matrix + npm audit', () => {
    const jf = renderJenkinsfile(undefined, undefined);
    expect(jf).toContain('npx playwright test --project=chromium --shard=$SHARD/4');
    expect(jf).toContain('npm audit --audit-level=high');
  });

  // ── GitHub Actions ─────────────────────────────────────────────────────
  it('GitHub Actions python branch: pip cache + pip-audit', () => {
    const yaml = renderGithubActions('python');
    expect(yaml).toContain(`cache: 'pip'`);
    expect(yaml).toContain('pip install pip-audit && pip-audit');
  });

  it('GitHub Actions java-maven branch: maven cache + mvn test', () => {
    const yaml = renderGithubActions('java', 'maven');
    expect(yaml).toContain(`cache: 'maven'`);
    expect(yaml).toContain('mvn test');
    expect(yaml).not.toContain('gradle test');
  });

  it('GitHub Actions java-gradle branch: gradle cache + sharded gradle test dispatch', () => {
    const yaml = renderGithubActions('java', 'gradle');
    expect(yaml).toContain(`cache: 'gradle'`);
    expect(yaml).toContain("$gradleArgs = @('test')");
    expect(yaml).toContain('& gradle @gradleArgs');
    expect(yaml).not.toContain('mvn test');
  });

  // ── Track 8: deterministic FNV-1a hash-based CI sharding for C#/Java ──────
  describe('GitHub Actions C#/Java: 4-way FNV-1a shard matrix + indexed artifacts (Track 8)', () => {
    it('csharp branch has a 4-way matrix, FNV-1a partition, and indexed artifact name', () => {
      const yaml = renderGithubActions('csharp', 'playwright');
      const parsed = parse(yaml) as { jobs: Record<string, any> };
      expect(parsed.jobs.test.strategy.matrix.shard).toEqual([0, 1, 2, 3]);
      expect(parsed.jobs.test.strategy['fail-fast']).toBe(false);
      expect(yaml).toContain('function Get-Fnv1a32');
      // Decimal mask, not the buggy 0xFFFFFFFF hex form (see the dedicated regression test
      // below) - checking the exact operator expression, not just presence of "0xFFFFFFFF",
      // since that substring also appears inside this file's own explanatory comment.
      expect(yaml).toContain('(($h -bxor $b) * 16777619) -band 4294967295');
      expect(yaml).toContain('name: test-results-${{ matrix.shard }}');
      // Discovery must be by file-name convention, never by parsing `dotnet test --list-tests`
      // free-text output (not a documented, locale-stable contract). Lowercase "tests" (not
      // "Tests") matches the real generated test directory - verified against a real generated
      // project, not assumed from naming convention.
      expect(yaml).toContain('Get-ChildItem -Path "tests" -Filter "*Test.cs"');
      expect(yaml).toContain('Get-ChildItem -Path "tests" -Filter "*Tests.cs"');
      // The response-file ("@file.rsp") indirection was tried and found broken against a real
      // dotnet test invocation (PowerShell/MSBuild fail to round-trip the quoted filter value) -
      // the filter must be passed directly as a normal argument instead.
      expect(yaml).not.toContain('.rsp');
      expect(yaml).toContain('dotnet test --no-build --filter "$filter"');
    });

    it('java-maven branch has a 4-way matrix, FNV-1a partition, and indexed artifact name', () => {
      const yaml = renderGithubActions('java', 'maven');
      const parsed = parse(yaml) as { jobs: Record<string, any> };
      expect(parsed.jobs.test.strategy.matrix.shard).toEqual([0, 1, 2, 3]);
      expect(parsed.jobs.test.strategy['fail-fast']).toBe(false);
      expect(yaml).toContain('function Get-Fnv1a32');
      expect(yaml).toContain('name: test-results-${{ matrix.shard }}');
      expect(yaml).toContain('Get-ChildItem -Path "src/test/java" -Filter "*Test.java"');
      expect(yaml).toContain('Get-ChildItem -Path "src/test/java" -Filter "*Tests.java"');
      // Both -D properties must be individually quoted when invoked from PowerShell against
      // mvn.cmd (a batch-file wrapper) - an unquoted "-Dproperty=value" argument was found to be
      // silently corrupted into an invalid lifecycle-phase token against a real generated
      // project. Testing the exact substrings (not just presence of each property) is the point:
      // an unquoted regression would still contain "-Dtest=$testPattern" as a substring.
      expect(yaml).toContain(
        'mvn test "-Dtest=$testPattern" "-Dsurefire.failIfNoSpecifiedTests=false"',
      );
    });

    it('java-gradle branch has a 4-way matrix, FNV-1a partition, and indexed artifact name', () => {
      const yaml = renderGithubActions('java', 'gradle');
      const parsed = parse(yaml) as { jobs: Record<string, any> };
      expect(parsed.jobs.test.strategy.matrix.shard).toEqual([0, 1, 2, 3]);
      expect(parsed.jobs.test.strategy['fail-fast']).toBe(false);
      expect(yaml).toContain('function Get-Fnv1a32');
      expect(yaml).toContain('name: test-results-${{ matrix.shard }}');
      expect(yaml).toContain('Get-ChildItem -Path "src/test/java" -Filter "*Test.java"');
      expect(yaml).toContain('Get-ChildItem -Path "src/test/java" -Filter "*Tests.java"');
    });

    it('zero brand leak: the sharding step never mentions EITR/Eitr in any branch', () => {
      // Regression guard for a real, previously-shipped leak: the explanatory comments in the
      // sharding step referred to "EITR's own generated test directory"/"EITR's own generated
      // seed" - real Zero Lock-in violations, since this text is written verbatim into every
      // generated project's own CI workflow file. The existing generic e2e-scaffold.test.ts
      // zero-lock-in loop never exercises a csharp/java plan(), so it never caught this - this
      // test closes that specific coverage gap for the sharding step.
      for (const [language, tool] of [
        ['csharp', 'playwright'],
        ['java', 'maven'],
        ['java', 'gradle'],
      ] as const) {
        const yaml = renderGithubActions(language, tool);
        expect(yaml).not.toContain('EITR');
        expect(yaml).not.toContain('Eitr');
      }
    });

    it('warns explicitly when zero test classes are discovered in total, across every shard', () => {
      // A shard with zero assigned classes prints its own "No test classes assigned to shard N"
      // message, but that alone can't distinguish "this shard just got none of the N discovered
      // classes" (normal) from "discovery itself found nothing at all" (the exact failure
      // signature of the already-fixed directory/filename-mismatch bug) - every shard would
      // print its own message and the whole matrix would exit green having run zero tests.
      for (const [language, tool] of [
        ['csharp', 'playwright'],
        ['java', 'maven'],
        ['java', 'gradle'],
      ] as const) {
        const yaml = renderGithubActions(language, tool);
        expect(yaml).toContain('::warning::');
      }
    });

    it('the FNV-1a partition function is byte-for-byte identical across csharp/maven/gradle branches', () => {
      const extractFn = (yaml: string) => {
        const start = yaml.indexOf('function Get-Fnv1a32');
        const end = yaml.indexOf('\n        }', start) + '\n        }'.length;
        return yaml.slice(start, end);
      };
      const csharpFn = extractFn(renderGithubActions('csharp', 'playwright'));
      const mavenFn = extractFn(renderGithubActions('java', 'maven'));
      const gradleFn = extractFn(renderGithubActions('java', 'gradle'));
      expect(csharpFn).toBe(mavenFn);
      expect(mavenFn).toBe(gradleFn);
    });

    it('the FNV-1a mask literal is decimal, never the buggy 0xFFFFFFFF hex form', () => {
      // Real bug, verified by hand-running this exact PowerShell block: an 8-digit hex literal
      // parses as a 32-bit-signed pattern first (all-Fs -> Int32 -1), so "-band 0xFFFFFFFF" is a
      // silent AND-with-minus-one no-op that never truncates to 32 bits, letting the hash grow
      // unbounded across iterations until it overflows into a double and the next multiply
      // throws a real runtime error. Decimal 4294967295 parses as a positive Int64 and masks
      // correctly - this must never regress back to the hex form.
      for (const [language, tool] of [
        ['csharp', 'playwright'],
        ['java', 'maven'],
        ['java', 'gradle'],
      ] as const) {
        const yaml = renderGithubActions(language, tool);
        expect(yaml).toContain('(($h -bxor $b) * 16777619) -band 4294967295');
      }
    });
  });

  // ── YAML syntactic validity (GitHub Actions + GitLab CI) ──────────────
  describe('GitHub Actions YAML is syntactically valid', () => {
    for (const [language, automationTool] of LANG_TOOL_BRANCHES) {
      it(`language=${language ?? 'default(ts/js)'} tool=${automationTool ?? 'n/a'}`, () => {
        const text = renderGithubActions(language, automationTool);
        let parsed: unknown;
        expect(() => {
          parsed = parse(text);
        }).not.toThrow();
        expect(parsed).not.toBeNull();
        expect(typeof parsed).toBe('object');
        expect(parsed).toHaveProperty('jobs');
      });
    }

    it('cypress branch parses and has jobs', () => {
      const text = renderGithubActions(undefined, 'cypress');
      const parsed = parse(text);
      expect(parsed).toHaveProperty('jobs');
    });
  });

  describe('GitLab CI YAML is syntactically valid', () => {
    for (const [language, automationTool] of LANG_TOOL_BRANCHES) {
      it(`language=${language ?? 'default(ts/js)'} tool=${automationTool ?? 'n/a'}`, () => {
        const text = renderGitlabCi(language, automationTool);
        let parsed: unknown;
        expect(() => {
          parsed = parse(text);
        }).not.toThrow();
        expect(parsed).not.toBeNull();
        expect(typeof parsed).toBe('object');
        expect(parsed).toHaveProperty('stages');
      });
    }

    it('cypress branch parses and has stages', () => {
      const text = renderGitlabCi(undefined, 'cypress');
      const parsed = parse(text);
      expect(parsed).toHaveProperty('stages');
    });
  });

  // ── TeamCity Kotlin DSL brace-balance ──────────────────────────────────
  describe('TeamCity Kotlin DSL is brace-balanced', () => {
    for (const [language, automationTool] of LANG_TOOL_BRANCHES) {
      it(`language=${language ?? 'default(ts/js)'} tool=${automationTool ?? 'n/a'}`, () => {
        const text = renderTeamcityKotlinDsl(language, automationTool);
        const openBraces = (text.match(/\{/g) ?? []).length;
        const closeBraces = (text.match(/\}/g) ?? []).length;
        expect(openBraces).toBe(closeBraces);
      });
    }
  });

  // ── TeamCity matrix-import regression guard (PR #35 bugfix) ────────────
  it('TeamCity Kotlin DSL python branch imports matrix correctly (not buildFeatures.matrix)', () => {
    const text = renderTeamcityKotlinDsl('python');
    expect(text).toContain('import jetbrains.buildServer.configs.kotlin.matrix');
    expect(text).not.toContain('buildFeatures.matrix');
  });

  it('TeamCity Kotlin DSL default (TS/JS) branch imports matrix correctly (not buildFeatures.matrix)', () => {
    const text = renderTeamcityKotlinDsl(undefined);
    expect(text).toContain('import jetbrains.buildServer.configs.kotlin.matrix');
    expect(text).not.toContain('buildFeatures.matrix');
  });

  // ── TeamCity CPOM linter parity with GitHub Actions/GitLab/Jenkins ──────
  // TeamCity used to be the only one of the 4 CI providers where the Kotlin DSL never called the
  // CPOM linter for python/csharp/java, and the markdown setup guide never called it for any
  // language at all - both would have failed this assertion before that fix.
  const LINT_COMMAND_BY_LANGUAGE: Record<string, string> = {
    python: 'python scripts/lint_cpom.py',
    csharp: 'dotnet run --file scripts/LintCpom.cs',
    java: 'java scripts/LintCpom.java',
  };

  describe('TeamCity wires the CPOM contract linter for every language', () => {
    for (const [language, automationTool] of LANG_TOOL_BRANCHES) {
      const expectedCommand = language ? LINT_COMMAND_BY_LANGUAGE[language] : 'npm run lint:cpom';
      const label = `language=${language ?? 'default(ts)'} tool=${automationTool ?? 'n/a'}`;

      it(`Kotlin DSL: ${label}`, () => {
        expect(renderTeamcityKotlinDsl(language, automationTool)).toContain(expectedCommand);
      });

      it(`Setup guide: ${label}`, () => {
        expect(renderTeamcityInstructions(language, automationTool)).toContain(expectedCommand);
      });
    }
  });
});
