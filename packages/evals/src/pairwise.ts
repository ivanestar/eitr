export interface TestCombination {
  id: string;
  language: string;
  automationTool: string;
  framework: string;
  uiLibrary: string;
  ciCd: string;
  aiAssistants?: string[];
}

// One stack, every other axis covered. This list used to carry 16 combinations because the language
// and runner axes had four values each; with Python, C#, Java and Cypress frozen, those axes have
// one value apiece and the remaining variation is what the questionnaire still asks about -
// framework, UI library, CI provider, AI assistants. Six combinations reach every value of each,
// which is what the coverage check below actually enforces.
export const TEST_COMBINATIONS: TestCombination[] = [
  {
    id: 'combo-01-ts-pw-react-mui-github',
    language: 'typescript',
    automationTool: 'playwright',
    framework: 'react',
    uiLibrary: 'mui',
    ciCd: 'github',
    aiAssistants: ['antigravity', 'cursor'],
  },
  {
    id: 'combo-02-ts-pw-vue-antd-gitlab',
    language: 'typescript',
    automationTool: 'playwright',
    framework: 'vue',
    uiLibrary: 'antd',
    ciCd: 'gitlab',
    aiAssistants: ['claude'],
  },
  {
    id: 'combo-03-ts-pw-angular-radix-jenkins',
    language: 'typescript',
    automationTool: 'playwright',
    framework: 'angular',
    uiLibrary: 'radix',
    ciCd: 'jenkins',
    aiAssistants: ['devin'],
  },
  {
    id: 'combo-04-ts-pw-svelte-chakra-teamcity',
    language: 'typescript',
    automationTool: 'playwright',
    framework: 'svelte',
    uiLibrary: 'chakra',
    ciCd: 'teamcity',
    aiAssistants: ['codex'],
  },
  {
    id: 'combo-05-ts-pw-unknown-tailwind-none',
    language: 'typescript',
    automationTool: 'playwright',
    framework: 'unknown',
    uiLibrary: 'tailwind',
    ciCd: 'none',
    aiAssistants: ['copilot'],
  },
  {
    id: 'combo-06-ts-pw-react-unknown-github',
    language: 'typescript',
    automationTool: 'playwright',
    framework: 'react',
    uiLibrary: 'unknown',
    ciCd: 'github',
    aiAssistants: ['claude', 'copilot'],
  },
];

export function verifyFullCoverage(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];

  // Only what the questionnaire offers. A frozen stack listed here would report a permanent gap
  // nobody can close, which is a check that has stopped meaning anything.
  const languages = ['typescript'];
  const tools = ['playwright'];
  const frameworks = ['react', 'vue', 'angular', 'svelte', 'unknown'];
  const uiLibs = ['mui', 'antd', 'radix', 'chakra', 'tailwind', 'unknown'];
  const ciCds = ['github', 'gitlab', 'jenkins', 'teamcity', 'none'];
  const aiAssistants = ['antigravity', 'cursor', 'claude', 'devin', 'codex', 'copilot'];

  for (const l of languages) {
    if (!TEST_COMBINATIONS.some((c) => c.language === l)) missing.push(`language:${l}`);
  }
  for (const t of tools) {
    if (!TEST_COMBINATIONS.some((c) => c.automationTool === t)) missing.push(`automationTool:${t}`);
  }
  for (const f of frameworks) {
    if (!TEST_COMBINATIONS.some((c) => c.framework === f)) missing.push(`framework:${f}`);
  }
  for (const u of uiLibs) {
    if (!TEST_COMBINATIONS.some((c) => c.uiLibrary === u)) missing.push(`uiLibrary:${u}`);
  }
  for (const c of ciCds) {
    if (!TEST_COMBINATIONS.some((combo) => combo.ciCd === c)) missing.push(`ciCd:${c}`);
  }
  for (const a of aiAssistants) {
    if (!TEST_COMBINATIONS.some((c) => c.aiAssistants?.includes(a)))
      missing.push(`aiAssistant:${a}`);
  }

  return { ok: missing.length === 0, missing };
}
