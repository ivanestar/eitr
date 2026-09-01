import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import {
  renderGithubActions,
  renderGitlabCi,
  renderJenkinsfile,
  renderTeamcityKotlinDsl,
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

  it('GitHub Actions java-gradle branch: gradle cache + gradle test', () => {
    const yaml = renderGithubActions('java', 'gradle');
    expect(yaml).toContain(`cache: 'gradle'`);
    expect(yaml).toContain('gradle test');
    expect(yaml).not.toContain('mvn test');
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
});
