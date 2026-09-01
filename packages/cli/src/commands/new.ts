import { collectInit } from './init.js';
import { runGenerate, type GenerateDeps } from './generate.js';

const NEW_USAGE = `Usage: eitr new [options]

Runs the whole flow in ONE command: the questionnaire, then generates AND installs a complete,
runnable test project (in the chosen language and framework, equivalent to "eitr init" then "eitr generate").
Never asks for login or credentials.

Options:
  --cwd <dir>            Project root (default: cwd)
  --start-url <url>      Start-page URL (required in non-interactive mode)
  --output-dir <dir>     Project folder (default: 'PlaywrightTests')
  --language <id>        Programming language: javascript|typescript|python|java|csharp
  --automation-tool <id> E2E automation tool
  --framework <id>       Framework hint: react|vue|angular|svelte|other
  --ui-library <id>      UI library hint: mui|antd|radix|chakra|tailwind|none|other
  --ci-cd <id>           CI/CD pipeline template: github|gitlab|jenkins|teamcity|none
  --ai-assistants <ids>  AI assistants (comma-separated): antigravity,cursor,claude,windsurf,codex,copilot
  --task-tracker <id>    Task/issue tracker: jira|azure-devops|none
  --tms-providers <ids>  Test Management System(s) (comma-separated): azure-devops,testrail,xray,zephyr
                          (xray/zephyr require --task-tracker jira)
  --no-install           Emit files only; skip npm install + browsers
  --storage-state <f>    Playwright storageState JSON file (auth.json) to bypass SSO during recon
  --yes                  Non-interactive: take flags as-is, ask nothing
  -h, --help             Show this help
`;

export async function runNew(argv: string[], deps: GenerateDeps = {}): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(NEW_USAGE);
    return 0;
  }
  const collected = await collectInit(argv);
  if (!collected.ok) return collected.code; // cancelled / error — stop before generating

  const genArgv = ['--cwd', collected.cwd];
  if (argv.includes('--no-install')) genArgv.push('--no-install');

  // Forward --storage-state to generate
  const storageStateIdx = argv.indexOf('--storage-state');
  if (storageStateIdx !== -1 && storageStateIdx + 1 < argv.length) {
    genArgv.push('--storage-state', argv[storageStateIdx + 1]);
  }

  return runGenerate(genArgv, deps);
}
