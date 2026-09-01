// Pure data + types for the `scaffold init` questionnaire. No IO here — all prompting lives
// behind IoPort (io.ts); the driver (driver.ts) orchestrates these questions. This is the one
// place the question set is declared, so adding/removing a question is a data edit.
export type QuestionId =
  | 'startUrl'
  | 'language'
  | 'automationTool'
  | 'outputDir'
  | 'framework'
  | 'uiLibrary'
  | 'ciCd'
  | 'aiAssistants'
  | 'taskTracker'
  | 'tmsProviders';

export interface Choice {
  readonly label: string;
  readonly value: string;
}

// Task/issue tracker — where tickets/bugs live. Xray and Zephyr are Jira apps (their Test/Test
// Execution issues are Jira issues), so selecting either of them as a TMS below requires Jira
// selected here — enforced in validators.ts.
const TASK_TRACKER_CHOICES: readonly Choice[] = [
  { label: 'Jira', value: 'jira' },
  { label: 'Azure DevOps (Work Items)', value: 'azure-devops' },
  { label: 'None / Skip', value: 'none' },
];

// Test Management System(s) — where test cases/plans/runs live. Multi-select: a project
// commonly pairs one task tracker with one or more of these (e.g. Jira + TestRail, or just Xray
// on top of Jira). Azure DevOps can be selected here too since it has native Test Plans on the
// same account as its Work Items.
const TMS_CHOICES: readonly Choice[] = [
  { label: 'Azure DevOps (Test Plans)', value: 'azure-devops' },
  { label: 'TestRail REST API', value: 'testrail' },
  { label: 'Jira Xray Cloud API (requires Jira as Task Tracker)', value: 'xray' },
  { label: 'Zephyr Scale API (requires Jira as Task Tracker)', value: 'zephyr' },
];

export interface TextQuestion {
  readonly kind: 'text';
  readonly id: QuestionId;
  readonly message: string;
  readonly required: boolean;
  readonly default?: string;
  readonly skipInteractive?: boolean;
}

export interface SelectQuestion {
  readonly kind: 'select';
  readonly id: QuestionId;
  readonly message: string;
  readonly choices: readonly Choice[];
  readonly default: string;
  readonly skipInteractive?: boolean;
}

export interface MultiSelectQuestion {
  readonly kind: 'multiselect';
  readonly id: QuestionId;
  readonly message: string;
  readonly choices: readonly Choice[];
  readonly default: readonly string[];
  readonly skipInteractive?: boolean;
}

export type Question = TextQuestion | SelectQuestion | MultiSelectQuestion;

export const DEFAULT_OUTPUT_DIR = 'AutomatedTests';

export function defaultOutputDirForAutomationTool(tool?: string, language?: string): string {
  const lang = (language ?? '').toLowerCase();
  const t = (tool ?? '').toLowerCase();

  if (lang === 'csharp') return 'PlaywrightCsharpTests';
  if (lang === 'python') return 'PytestTests';
  if (lang === 'java') return 'PlaywrightJavaTests';

  switch (t) {
    case 'playwright':
      return 'PlaywrightTests';
    // 'cypress' is withheld from AUTOMATION_TOOL_CHOICES pending a native CPOM redesign (see the
    // comment above that constant) but intentionally kept reachable here for when it returns.
    case 'cypress':
      return 'CypressTests';
    case 'pytest':
      return 'PytestTests';
    default:
      return DEFAULT_OUTPUT_DIR;
  }
}

// Sentinel hint value meaning "no hint — let recon decide". The reducer omits hints equal to it.
export const HINT_UNKNOWN = 'unknown';

const FRAMEWORK_CHOICES: readonly Choice[] = [
  { label: 'React', value: 'react' },
  { label: 'Vue', value: 'vue' },
  { label: 'Angular', value: 'angular' },
  { label: 'Svelte', value: 'svelte' },
  { label: 'None / Other (Let recon decide)', value: HINT_UNKNOWN },
];

const UI_LIBRARY_CHOICES: readonly Choice[] = [
  { label: 'Material UI (MUI)', value: 'mui' },
  { label: 'Ant Design', value: 'antd' },
  { label: 'Radix', value: 'radix' },
  { label: 'Chakra UI', value: 'chakra' },
  { label: 'Tailwind', value: 'tailwind' },
  { label: 'None / Other (Let recon decide)', value: HINT_UNKNOWN },
];

const LANGUAGE_CHOICES: readonly Choice[] = [
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python', value: 'python' },
  { label: 'C# (.NET 8)', value: 'csharp' },
  { label: 'Java (JDK 17+)', value: 'java' },
];

// Cypress is temporarily withheld from the questionnaire pending a CPOM primitive redesign
// native to its own retry/command-chain model - see the SUPPORTED-combo comment in
// packages/cli/src/commands/generate.ts. Not deleted, just not offered.
export const AUTOMATION_TOOL_CHOICES: readonly Choice[] = [
  { label: 'Playwright', value: 'playwright' },
  { label: 'Playwright (Maven)', value: 'playwright-maven' },
  { label: 'Playwright (Gradle)', value: 'playwright-gradle' },
  { label: 'Pytest + Playwright', value: 'pytest' },
];

const CI_CD_CHOICES: readonly Choice[] = [
  { label: 'GitHub Actions', value: 'github' },
  { label: 'GitLab CI/CD', value: 'gitlab' },
  { label: 'Jenkins', value: 'jenkins' },
  { label: 'TeamCity', value: 'teamcity' },
  { label: 'None / Skip', value: 'none' },
];

const AI_ASSISTANT_CHOICES: readonly Choice[] = [
  { label: 'Antigravity (.agents/skills)', value: 'antigravity' },
  { label: 'Cursor (.cursor/rules)', value: 'cursor' },
  { label: 'Claude Code (.claude/skills)', value: 'claude' },
  { label: 'Windsurf (.windsurf)', value: 'windsurf' },
  { label: 'Codex CLI (.codex/skills)', value: 'codex' },
  { label: 'GitHub Copilot (.github/copilot)', value: 'copilot' },
  { label: 'Aider (.aider.conf.yml)', value: 'aider' },
];

export function isToolSupportedByLanguage(tool: string, language: string): boolean {
  switch (language) {
    case 'typescript':
      return tool === 'playwright';
    case 'python':
      return tool === 'playwright' || tool === 'pytest';
    case 'csharp':
      return tool === 'playwright';
    case 'java':
      return tool === 'playwright-maven' || tool === 'playwright-gradle';

    default:
      return false;
  }
}

export function getChoicesForLanguage(
  choices: readonly Choice[],
  language?: string,
): readonly Choice[] {
  if (!language) return choices;
  return choices.filter((c) => isToolSupportedByLanguage(c.value, language));
}

export const QUESTIONS: readonly Question[] = [
  {
    kind: 'text',
    id: 'startUrl',
    message: 'App start-page URL',
    required: true,
  },
  {
    kind: 'select',
    id: 'language',
    message: 'Programming language for E2E tests',
    choices: LANGUAGE_CHOICES,
    default: 'typescript',
  },
  {
    kind: 'select',
    id: 'automationTool',
    message: 'E2E test automation tool',
    choices: AUTOMATION_TOOL_CHOICES,
    default: 'playwright',
  },

  {
    kind: 'select',
    id: 'framework',
    message: 'Frontend framework of the app (optional hint)',
    choices: FRAMEWORK_CHOICES,
    default: HINT_UNKNOWN,
    skipInteractive: true,
  },
  {
    kind: 'select',
    id: 'uiLibrary',
    message: 'UI component library of the app (optional hint)',
    choices: UI_LIBRARY_CHOICES,
    default: HINT_UNKNOWN,
    skipInteractive: true,
  },
  {
    kind: 'select',
    id: 'ciCd',
    message: 'CI/CD pipeline template to generate',
    choices: CI_CD_CHOICES,
    default: 'none',
  },
  {
    kind: 'multiselect',
    id: 'aiAssistants',
    message:
      'AI Assistants to generate rules for \x1b[22m\x1b[90m(Space to toggle, Enter to confirm)\x1b[39m',
    choices: AI_ASSISTANT_CHOICES,
    default: [],
  },
  {
    kind: 'select',
    id: 'taskTracker',
    message: 'Task/issue tracker for MCP integration',
    choices: TASK_TRACKER_CHOICES,
    default: 'none',
  },
  {
    kind: 'multiselect',
    id: 'tmsProviders',
    message:
      'Test Management System(s) for MCP integration \x1b[22m\x1b[90m(Space to toggle, Enter to confirm)\x1b[39m',
    choices: TMS_CHOICES,
    default: [],
  },
];

export interface StackHints {
  readonly framework?: string;
  readonly uiLibrary?: string;
  readonly language?: string;
  readonly automationTool?: string;
}

// The persisted contract written to .scaffold/init.json and consumed later by recon/generate.
export interface InitAnswers {
  readonly schemaVersion: 1;
  readonly startUrl: string;
  readonly outputDir: string;
  readonly stackHints?: StackHints;
  readonly ciCd?: string;
  readonly aiAssistants?: string[];
  readonly taskTracker?: string;
  readonly tmsProviders?: string[];
  readonly skipInstall?: boolean;
}

// QuestionId -> CLI flag name, for non-interactive error messages.
export const FLAG_OF: Record<QuestionId, string> = {
  startUrl: 'start-url',
  outputDir: 'output-dir',
  language: 'language',
  automationTool: 'automation-tool',
  framework: 'framework',
  uiLibrary: 'ui-library',
  ciCd: 'ci-cd',
  aiAssistants: 'ai-assistants',
  taskTracker: 'task-tracker',
  tmsProviders: 'tms-providers',
};
