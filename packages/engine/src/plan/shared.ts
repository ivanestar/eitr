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
  renderCursorRuleFile,
  renderDevinRuleFile,
  renderCopilotPathInstructions,
  RULE_TASK_KEYS,
} from './templates/ai-rules.js';
import { renderCpomLinter } from './templates/cpom-linter.js';
import { renderCpomLinterPython } from './templates/cpom-linter-python.js';
import { renderCpomLinterJava } from './templates/cpom-linter-java.js';
import { renderCpomLinterCsharp } from './templates/cpom-linter-csharp.js';
import { renderEslintConfig } from './templates/eslint-config.js';
import { renderDockerfile, renderDockerignore } from './templates/docker.js';
import { renderSiteMapSchema } from './templates/site-map-schema.js';
import { renderGitHooks } from './templates/git-hooks.js';
import { renderSwarmDispatcher } from './templates/swarm-dispatcher.js';
import { renderSiteMapValidator } from './templates/site-map-validator.js';
import { renderSitemapCoverageChecker } from './templates/sitemap-coverage-checker.js';
import { renderFeatureMapTypes } from './templates/feature-map-types.js';
import { renderFeatureMapEngine } from './templates/feature-map-engine.js';
import { renderFeatureMapValidator } from './templates/feature-map-validator.js';
import { renderTestConditionsTypes } from './templates/test-conditions-types.js';
import { renderTestConditionsEngine } from './templates/test-conditions-engine.js';
import { renderTestConditionsValidator } from './templates/test-conditions-validator.js';
import { renderPipelineStatus } from './templates/pipeline-status.js';
import { renderAuthStatus } from './templates/auth-status.js';
import { renderAuthQuestions } from './templates/auth-questions.js';
import { renderArtifactJournal } from './templates/artifact-journal.js';
import { renderCrawlBudget } from './templates/crawl-budget.js';
import { renderVisualCopilot } from './templates/visual-copilot.js';
import { renderOverlayLedger } from './templates/overlay-ledger.js';
import { renderPageInventory } from './templates/page-inventory.js';
import { renderFieldProbe } from './templates/field-probe.js';
import { renderTestResearch } from './templates/test-research.js';
import { renderTestAnalysisPlan } from './templates/test-analysis-plan.js';
import { renderSkillBriefing } from './templates/skill-briefing.js';
import { renderMapSiteQuestions } from './templates/map-site-questions.js';
import { renderMapFeaturesQuestions } from './templates/map-features-questions.js';
import { renderDebugLog } from './templates/debug-log.js';
import { renderMapSiteStatus } from './templates/map-site-status.js';
import { renderAutomateTestStatus } from './templates/automate-test-status.js';
import { renderEnvRoleStubs } from './templates/env-role-stubs.js';
import { renderReviewArtifactRenderer } from './templates/review-artifact-renderer.js';
import { renderReviewApply } from './templates/review-apply.js';
import { renderCorroboration } from './templates/corroboration.js';
import { renderAppProfile } from './templates/app-profile.js';
import { renderAppProfileTypes } from './templates/app-profile-types.js';
import { renderCoverageStatus } from './templates/coverage-status.js';
import { resolveStackConventions } from './stack-conventions.js';
import { renderJourneysTypes } from './templates/journeys-types.js';
import { renderJourneysEngine } from './templates/journeys-engine.js';
import { renderApiContractsTypes } from './templates/api-contracts-types.js';
import { renderApiContractsValidator } from './templates/api-contracts-validator.js';
import { renderJourneysValidator } from './templates/journeys-validator.js';

/**
 * Emits project infrastructure files that are fully independent of the language and automation
 * tool: AI assistant rules, IDE settings, code-quality meta files, and CI/CD templates.
 *
 * This function is called once per generation and its output is the same regardless of the
 * language + tool combination chosen. When a new language or tool is added, only the
 * LanguageAdapter and ToolAdapter need to change - this function stays untouched.
 */
export function planSharedScaffold(opts: PlanOptions): FileDescriptor[] {
  const ciCd = opts.ciCd ?? 'none';
  // Where specs live, so coverage-status can confirm a journey's spec exists on disk.
  const specs = resolveStackConventions(opts.automationTool, opts.language);

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
    // -- Project meta --------------------------------------------------------
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
      path: '.scaffold/schemas/site-map.schema.json',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderSiteMapSchema() },
    },
    {
      path: '.githooks/pre-commit',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderGitHooks(opts.language, opts.automationTool) },
    },
    // Only meaningful when an AI assistant is actually configured to invoke it - mirrors the same
    // gating planAiAgents()/planAiOperationalSkills() already apply to their own output.
    ...(opts.aiAssistants === undefined || opts.aiAssistants.length > 0
      ? ([
          {
            path: 'scripts/orchestrate-swarm.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderSwarmDispatcher() },
          },
          {
            path: 'scripts/validate-site-map.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderSiteMapValidator() },
          },
          {
            path: '.scaffold/schemas/api-contracts.types.ts',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderApiContractsTypes() },
          },
          {
            path: 'scripts/validate-api-contracts.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderApiContractsValidator() },
          },
          {
            path: 'scripts/check-sitemap-coverage.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderSitemapCoverageChecker() },
          },
          {
            path: '.scaffold/schemas/feature-map.types.ts',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderFeatureMapTypes() },
          },
          {
            path: 'scripts/derive-feature-map.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderFeatureMapEngine() },
          },
          {
            path: 'scripts/validate-feature-map.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderFeatureMapValidator() },
          },
          {
            path: '.scaffold/schemas/test-conditions.types.ts',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderTestConditionsTypes() },
          },
          {
            path: 'scripts/generate-test-conditions.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderTestConditionsEngine() },
          },
          {
            path: 'scripts/validate-test-conditions.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderTestConditionsValidator() },
          },
          {
            path: 'scripts/pipeline-status.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderPipelineStatus() },
          },
          {
            path: 'scripts/auth-status.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderAuthStatus() },
          },
          {
            path: 'scripts/auth-questions.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderAuthQuestions() },
          },
          {
            path: 'scripts/map-site-status.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderMapSiteStatus() },
          },
          {
            path: 'scripts/map-site-questions.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderMapSiteQuestions() },
          },
          {
            path: 'scripts/map-features-questions.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderMapFeaturesQuestions() },
          },

          {
            path: 'scripts/crawl-budget.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderCrawlBudget() },
          },
          {
            path: 'scripts/visual-copilot.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderVisualCopilot() },
          },
          {
            path: 'scripts/skill-briefing.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: {
              kind: 'inline',
              text: renderSkillBriefing(opts.automationTool, opts.language),
            },
          },
          {
            path: 'scripts/overlay-ledger.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderOverlayLedger() },
          },
          {
            path: 'scripts/page-inventory.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderPageInventory() },
          },
          {
            path: 'scripts/field-probe.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderFieldProbe() },
          },
          {
            path: 'scripts/test-research.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderTestResearch() },
          },
          {
            path: 'scripts/test-analysis-plan.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderTestAnalysisPlan() },
          },
          {
            path: 'scripts/artifact-journal.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderArtifactJournal() },
          },
          {
            path: 'scripts/debug-log.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderDebugLog() },
          },
          {
            path: 'scripts/automate-test-status.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderAutomateTestStatus() },
          },
          {
            path: 'scripts/env-role-stubs.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderEnvRoleStubs() },
          },
          {
            path: 'scripts/render-review-artifact.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderReviewArtifactRenderer() },
          },
          {
            path: 'scripts/apply-review.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderReviewApply() },
          },
          {
            path: 'scripts/corroboration.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderCorroboration() },
          },
          {
            path: '.scaffold/schemas/app-profile.types.ts',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderAppProfileTypes() },
          },
          {
            path: 'scripts/app-profile.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderAppProfile() },
          },
          {
            path: 'scripts/coverage-status.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: {
              kind: 'inline',
              text: renderCoverageStatus(specs.specDir, specs.specExtension),
            },
          },
          {
            path: '.scaffold/schemas/test-cases.types.ts',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderJourneysTypes() },
          },
          {
            path: 'scripts/compose-journeys.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderJourneysEngine() },
          },
          {
            path: 'scripts/validate-journeys.mjs',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderJourneysValidator() },
          },
        ] as FileDescriptor[])
      : []),
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
    // AGENTS.md is read natively by Antigravity, Aider, Codex CLI, Cursor, and Devin Desktop (all
    // live-verified 2026) - a shared root file every one of them discovers with zero config.
    ...(opts.aiAssistants === undefined ||
    opts.aiAssistants.includes('antigravity') ||
    opts.aiAssistants.includes('aider') ||
    opts.aiAssistants.includes('codex') ||
    opts.aiAssistants.includes('cursor') ||
    opts.aiAssistants.includes('devin')
      ? ([
          {
            path: 'AGENTS.md',
            writePolicy: 'create-if-absent',
            provenance: { origin: 'project' },
            source: { kind: 'inline', text: renderAgentsMd(opts.automationTool, opts.language) },
          },
        ] as FileDescriptor[])
      : []),
    ...(opts.aiAssistants === undefined || opts.aiAssistants.includes('cursor')
      ? RULE_TASK_KEYS.map(
          (task) =>
            ({
              path: `.cursor/rules/${task}.mdc`,
              writePolicy: 'create-if-absent',
              provenance: { origin: 'project' },
              source: {
                kind: 'inline',
                text: renderCursorRuleFile(task, opts.automationTool, opts.language),
              },
            }) as FileDescriptor,
        )
      : []),
    ...(opts.aiAssistants === undefined || opts.aiAssistants.includes('devin')
      ? RULE_TASK_KEYS.map(
          (task) =>
            ({
              path: `.devin/rules/${task}.md`,
              writePolicy: 'create-if-absent',
              provenance: { origin: 'project' },
              source: {
                kind: 'inline',
                text: renderDevinRuleFile(task, opts.automationTool, opts.language),
              },
            }) as FileDescriptor,
        )
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
          ...RULE_TASK_KEYS.map(
            (task) =>
              ({
                path: `.github/instructions/${task}.instructions.md`,
                writePolicy: 'create-if-absent',
                provenance: { origin: 'project' },
                source: {
                  kind: 'inline',
                  text: renderCopilotPathInstructions(task, opts.automationTool, opts.language),
                },
              }) as FileDescriptor,
          ),
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

    // -- VS Code -------------------------------------------------------------
    {
      path: '.vscode/extensions.json',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderVscodeExtensions(opts.automationTool, opts.language) },
    },
    {
      path: '.vscode/launch.json',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderVscodeLaunch(opts.automationTool, opts.language) },
    },
  ];

  // -- CI/CD (conditional, language-aware) -----------------------------------
  if (ciCd === 'github') {
    files.push({
      path: '.github/workflows/playwright.yml',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: {
        kind: 'inline',
        text: renderGithubActions(opts.language, opts.automationTool, opts.baseUrl),
      },
    });
  } else if (ciCd === 'gitlab') {
    files.push({
      path: '.gitlab-ci.yml',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: {
        kind: 'inline',
        text: renderGitlabCi(opts.language, opts.automationTool, opts.baseUrl),
      },
    });
  } else if (ciCd === 'jenkins') {
    files.push({
      path: 'Jenkinsfile',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: {
        kind: 'inline',
        text: renderJenkinsfile(opts.language, opts.automationTool, opts.baseUrl),
      },
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
        text: renderTeamcityKotlinDsl(opts.language, opts.automationTool, opts.baseUrl),
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
