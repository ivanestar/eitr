export interface TestCombination {
  id: string;
  language: string;
  automationTool: string;
  framework: string;
  uiLibrary: string;
  ciCd: string;
  aiAssistants?: string[];
}

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
    id: 'combo-02-js-cy-vue-antd-gitlab',
    language: 'javascript',
    automationTool: 'cypress',
    framework: 'vue',
    uiLibrary: 'antd',
    ciCd: 'gitlab',
    aiAssistants: ['claude'],
  },
  {
    id: 'combo-03-py-pw-angular-radix-jenkins',
    language: 'python',
    automationTool: 'playwright',
    framework: 'angular',
    uiLibrary: 'radix',
    ciCd: 'jenkins',
    aiAssistants: ['windsurf'],
  },
  {
    id: 'combo-04-cs-pw-svelte-chakra-teamcity',
    language: 'csharp',
    automationTool: 'playwright',
    framework: 'svelte',
    uiLibrary: 'chakra',
    ciCd: 'teamcity',
    aiAssistants: ['codex'],
  },
  {
    id: 'combo-05-java-mvn-unknown-tailwind-none',
    language: 'java',
    automationTool: 'playwright-maven',
    framework: 'unknown',
    uiLibrary: 'tailwind',
    ciCd: 'none',
    aiAssistants: ['copilot'],
  },
  {
    id: 'combo-06-java-gradle-react-unknown-github',
    language: 'java',
    automationTool: 'playwright-gradle',
    framework: 'react',
    uiLibrary: 'unknown',
    ciCd: 'github',
  },
  {
    id: 'combo-07-ts-cy-vue-mui-jenkins',
    language: 'typescript',
    automationTool: 'cypress',
    framework: 'vue',
    uiLibrary: 'mui',
    ciCd: 'jenkins',
  },
  {
    id: 'combo-08-js-pw-angular-antd-teamcity',
    language: 'javascript',
    automationTool: 'playwright',
    framework: 'angular',
    uiLibrary: 'antd',
    ciCd: 'teamcity',
  },
  {
    id: 'combo-09-py-pw-svelte-mui-gitlab',
    language: 'python',
    automationTool: 'playwright',
    framework: 'svelte',
    uiLibrary: 'mui',
    ciCd: 'gitlab',
  },
  {
    id: 'combo-10-cs-pw-react-radix-none',
    language: 'csharp',
    automationTool: 'playwright',
    framework: 'react',
    uiLibrary: 'radix',
    ciCd: 'none',
  },
  {
    id: 'combo-11-ts-pw-unknown-chakra-github',
    language: 'typescript',
    automationTool: 'playwright',
    framework: 'unknown',
    uiLibrary: 'chakra',
    ciCd: 'github',
  },
  {
    id: 'combo-12-js-cy-react-tailwind-none',
    language: 'javascript',
    automationTool: 'cypress',
    framework: 'react',
    uiLibrary: 'tailwind',
    ciCd: 'none',
  },
  {
    id: 'combo-13-py-pw-vue-unknown-jenkins',
    language: 'python',
    automationTool: 'playwright',
    framework: 'vue',
    uiLibrary: 'unknown',
    ciCd: 'jenkins',
  },
  {
    id: 'combo-14-cs-pw-angular-mui-gitlab',
    language: 'csharp',
    automationTool: 'playwright',
    framework: 'angular',
    uiLibrary: 'mui',
    ciCd: 'gitlab',
  },
  {
    id: 'combo-15-java-mvn-svelte-antd-teamcity',
    language: 'java',
    automationTool: 'playwright-maven',
    framework: 'svelte',
    uiLibrary: 'antd',
    ciCd: 'teamcity',
  },
  {
    id: 'combo-16-ts-cy-angular-unknown-gitlab',
    language: 'typescript',
    automationTool: 'cypress',
    framework: 'angular',
    uiLibrary: 'unknown',
    ciCd: 'gitlab',
  },
];

export function verifyFullCoverage(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];

  const languages = ['javascript', 'typescript', 'python', 'csharp', 'java'];
  const tools = ['playwright', 'playwright-maven', 'playwright-gradle', 'cypress'];
  const frameworks = ['react', 'vue', 'angular', 'svelte', 'unknown'];
  const uiLibs = ['mui', 'antd', 'radix', 'chakra', 'tailwind', 'unknown'];
  const ciCds = ['github', 'gitlab', 'jenkins', 'teamcity', 'none'];
  const aiAssistants = ['antigravity', 'cursor', 'claude', 'windsurf', 'codex', 'copilot'];

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
