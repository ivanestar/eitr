import type { FileDescriptor } from '../types/generation-plan.js';
import type { PlanOptions } from './types.js';
import { renderGitignore } from './templates/gitignore.js';
import { renderEditorConfig } from './templates/editorconfig.js';
import { renderVscodeExtensions, renderVscodeLaunch } from './templates/vscode.js';
import {
  renderGithubActions,
  renderGitlabCi,
  renderJenkinsfile,
  renderTeamcityInstructions,
  renderTeamcityKotlinDsl,
  renderTeamcityDslPom,
} from './templates/cicd.js';
import { planMcpServer } from './templates/mcp-server.js';
import { planMcpConfigs } from './templates/mcp-configs.js';
import { planAiAgents } from './templates/ai-agents.js';
import { planAiOperationalSkills } from './templates/ai-operational-skills.js';
import {
  renderClaudeMd,
  renderConventionsMd,
  renderAiderConf,
  renderAgentsMd,
  renderCopilotInstructions,
} from './templates/ai-rules.js';
import { renderCpomLinter } from './templates/cpom-linter.js';
import { renderCpomLinterPython } from './templates/cpom-linter-python.js';
import { renderCpomLinterJava } from './templates/cpom-linter-java.js';
import { renderCpomLinterCsharp } from './templates/cpom-linter-csharp.js';
import { renderEslintConfig } from './templates/eslint-config.js';
import { renderDockerfile, renderDockerignore } from './templates/docker.js';
import { renderSiteMapHtml } from './templates/site-map-html.js';
import { renderSiteMapSchema } from './templates/site-map-schema.js';
import { renderGitHooks } from './templates/git-hooks.js';
import { renderOverridesReadme } from './templates/overrides-readme.js';

/**
 * Emits project infrastructure files that are fully independent of the language and automation
 * tool: AI assistant rules, IDE settings, code-quality meta files, and CI/CD templates.
 *
 * This function is called once per generation and its output is the same regardless of the
 * language + tool combination chosen. When a new language or tool is added, only the
 * LanguageAdapter and ToolAdapter need to change — this function stays untouched.
 */
export function planSharedScaffold(opts: PlanOptions): FileDescriptor[] {
  const ciCd = opts.ciCd ?? 'none';

  const files: FileDescriptor[] = [
    ...planMcpServer(
      opts.taskTracker,
      opts.tmsProviders,
      opts.aiAssistants,
      opts.automationTool,
      opts.language,
    ),
    ...planMcpConfigs(opts.taskTracker, opts.tmsProviders, true, opts.aiAssistants),
    ...planAiAgents(opts.aiAssistants, opts.automationTool, opts.language),
    ...planAiOperationalSkills(opts.aiAssistants, opts.automationTool, opts.language),
    // ── Project meta ────────────────────────────────────────────────────────
    {
      path: '.gitignore',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderGitignore(opts.automationTool, opts.language) },
    },
    {
      path: '.editorconfig',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderEditorConfig() },
    },
    {
      path: 'docs/site-map/site-map.html',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderSiteMapHtml(opts.baseUrl) },
    },
    {
      path: 'docs/site-map/site-map.schema.json',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderSiteMapSchema() },
    },
    {
      path: '.githooks/pre-commit',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderGitHooks() },
    },
    {
      path: 'overrides/README.md',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'seed' },
      source: { kind: 'inline', text: renderOverridesReadme() },
    },
    ...(opts.docker !== false
      ? ([
          {
            path: 'Dockerfile',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: {
              kind: 'inline',
              text: renderDockerfile(opts.automationTool, opts.language),
            },
          },
          {
            path: '.dockerignore',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderDockerignore() },
          },
        ] as FileDescriptor[])
      : []),
    ...(opts.language === undefined ||
    opts.language === 'typescript' ||
    opts.automationTool === 'cypress'
      ? ([
          {
            path: 'scripts/lint-cpom.js',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderCpomLinter() },
          },
          {
            path: 'eslint.config.js',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderEslintConfig() },
          },
        ] as FileDescriptor[])
      : []),
    ...(opts.language === 'python'
      ? ([
          {
            path: 'scripts/lint_cpom.py',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderCpomLinterPython() },
          },
        ] as FileDescriptor[])
      : []),
    ...(opts.language === 'java'
      ? ([
          {
            path: 'scripts/LintCpom.java',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderCpomLinterJava() },
          },
        ] as FileDescriptor[])
      : []),
    ...(opts.language === 'csharp'
      ? ([
          {
            path: 'scripts/LintCpom.cs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderCpomLinterCsharp() },
          },
        ] as FileDescriptor[])
      : []),
    ...(opts.aiAssistants === undefined || opts.aiAssistants.includes('claude')
      ? ([
          {
            path: 'CLAUDE.md',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderClaudeMd(opts.automationTool, opts.language) },
          },
        ] as FileDescriptor[])
      : []),
    {
      path: 'CONVENTIONS.md',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderConventionsMd(opts.automationTool, opts.language) },
    },
    ...(opts.aiAssistants === undefined ||
    opts.aiAssistants.includes('antigravity') ||
    opts.aiAssistants.includes('aider') ||
    opts.aiAssistants.includes('codex')
      ? ([
          {
            path: 'AGENTS.md',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderAgentsMd(opts.automationTool, opts.language) },
          },
        ] as FileDescriptor[])
      : []),
    ...(opts.aiAssistants === undefined || opts.aiAssistants.includes('windsurf')
      ? ([
          {
            path: '.windsurfrules',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderAgentsMd(opts.automationTool, opts.language) },
          },
        ] as FileDescriptor[])
      : []),
    ...(opts.aiAssistants === undefined || opts.aiAssistants.includes('copilot')
      ? ([
          {
            path: '.github/copilot-instructions.md',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: {
              kind: 'inline',
              text: renderCopilotInstructions(opts.automationTool, opts.language),
            },
          },
        ] as FileDescriptor[])
      : []),
    ...(opts.aiAssistants === undefined || opts.aiAssistants.includes('aider')
      ? ([
          {
            path: '.aider.conf.yml',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderAiderConf(opts.automationTool, opts.language) },
          },
        ] as FileDescriptor[])
      : []),

    // ── VS Code ─────────────────────────────────────────────────────────────
    {
      path: '.vscode/extensions.json',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderVscodeExtensions(opts.automationTool) },
    },
    {
      path: '.vscode/launch.json',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderVscodeLaunch(opts.automationTool, opts.language) },
    },
  ];

  // ── CI/CD (conditional, language-aware) ───────────────────────────────────
  if (ciCd === 'github') {
    files.push({
      path: '.github/workflows/playwright.yml',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderGithubActions(opts.language, opts.automationTool) },
    });
  } else if (ciCd === 'gitlab') {
    files.push({
      path: '.gitlab-ci.yml',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderGitlabCi(opts.language, opts.automationTool) },
    });
  } else if (ciCd === 'jenkins') {
    files.push({
      path: 'Jenkinsfile',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderJenkinsfile(opts.language, opts.automationTool) },
    });
  } else if (ciCd === 'teamcity') {
    files.push({
      path: 'teamcity-instructions.md',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: {
        kind: 'inline',
        text: renderTeamcityInstructions(opts.language, opts.automationTool),
      },
    });
    files.push({
      path: '.teamcity/settings.kts',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: {
        kind: 'inline',
        text: renderTeamcityKotlinDsl(opts.language, opts.automationTool),
      },
    });
    files.push({
      path: '.teamcity/pom.xml',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderTeamcityDslPom() },
    });
  }

  return files;
}
