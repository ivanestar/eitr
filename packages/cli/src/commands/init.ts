import { parseArgs } from 'node:util';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { runQuestionnaire, type Mode } from '../questionnaire/driver.js';
import { createStdioIo, type IoPort } from '../questionnaire/io.js';
import type { InitAnswers, QuestionId } from '../questionnaire/schema.js';
import { checkPython, checkDotnet, checkJava, checkMaven, checkGradle } from './doctor.js';

const INIT_USAGE = `Usage: eitr init [options]

Runs the interactive questionnaire (start URL, output directory, optional stack hints) and
writes .eitr/init.json — the input for generation. Never asks for login or credentials.
(Use "eitr new" to also generate the framework in one go.)

Options:
  --cwd <dir>          Project root to write .eitr/init.json into (default: cwd)
  --start-url <url>    Start-page URL (required in non-interactive mode)
  --output-dir <dir>   Output directory (default: '.')
  --framework <id>     Framework hint: react|vue|angular|svelte|other
  --ui-library <id>    UI library hint: mui|antd|radix|chakra|tailwind|none|other
  --yes                Non-interactive: take flags as-is, ask nothing
  --language <id>      Programming language: javascript|typescript|python|java|csharp
  --automation-tool <id> E2E automation tool
  --ai-assistants <ids>  AI assistants (comma-separated): antigravity,cursor,claude,windsurf,codex,copilot
  --tms-provider <id>    TMS provider: azure-devops|testrail|jira-xray|zephyr|none
  -h, --help           Show this help
`;

export const INIT_ARG_OPTIONS = {
  cwd: { type: 'string' },
  'start-url': { type: 'string' },
  'output-dir': { type: 'string' },
  language: { type: 'string' },
  'automation-tool': { type: 'string' },
  framework: { type: 'string' },
  'ui-library': { type: 'string' },
  'ci-cd': { type: 'string' },
  'ai-assistants': { type: 'string' },
  'tms-provider': { type: 'string' },
  // Accepted (and ignored) here so `eitr new --storage-state` parses; `new` forwards it to generate.
  'storage-state': { type: 'string' },
  yes: { type: 'boolean' },
  // Accepted (and ignored) here so `eitr new --no-install` parses; `new` forwards it to generate.
  'no-install': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

// In --yes mode the driver makes zero prompt calls, so we neither open a readline session nor touch
// stdin; this throwing io guarantees that (a stray prompt would fail loud instead of hanging CI).
const NON_INTERACTIVE_IO: IoPort = {
  text() {
    throw new Error('unexpected interactive prompt in --yes mode');
  },
  select() {
    throw new Error('unexpected interactive prompt in --yes mode');
  },
  review() {
    throw new Error('unexpected interactive prompt in --yes mode');
  },
  confirmInstall() {
    throw new Error('unexpected interactive prompt in --yes mode');
  },
  multiSelect() {
    throw new Error('unexpected interactive prompt in --yes mode');
  },
  note() {},
};

function renderAnswers(answers: InitAnswers): string {
  const lines = [
    'Collected configuration:',
    `  startUrl    ${answers.startUrl}`,
    `  outputDir   ${answers.outputDir}`,
  ];
  if (answers.stackHints?.framework) lines.push(`  framework   ${answers.stackHints.framework}`);
  if (answers.stackHints?.uiLibrary) lines.push(`  uiLibrary   ${answers.stackHints.uiLibrary}`);
  return lines.join('\n');
}

export interface CollectResult {
  code: number;
  cwd: string;
  ok: boolean;
}

// Shared by `init` and `new`: parse flags, run the questionnaire, and write .eitr/init.json.
// Assumes --help was already handled by the caller. Returns ok=true only when init.json was written.
export async function collectInit(argv: string[]): Promise<CollectResult> {
  const { values } = parseArgs({ args: argv, options: INIT_ARG_OPTIONS });
  const cwd = path.resolve(values.cwd ?? process.cwd());

  const prefill: Partial<Record<QuestionId, string>> = {};
  if (values['start-url'] !== undefined) prefill.startUrl = values['start-url'];
  if (values['output-dir'] !== undefined) prefill.outputDir = values['output-dir'];
  if (values.framework !== undefined) prefill.framework = values.framework;
  if (values['ui-library'] !== undefined) prefill.uiLibrary = values['ui-library'];
  if (values.language !== undefined) prefill.language = values.language;
  if (values['automation-tool'] !== undefined) prefill.automationTool = values['automation-tool'];
  if (values['ci-cd'] !== undefined) prefill.ciCd = values['ci-cd'] as string;
  if (values['ai-assistants'] !== undefined) {
    prefill.aiAssistants = values['ai-assistants'] as string;
  }
  if (values['tms-provider'] !== undefined) prefill.tmsProvider = values['tms-provider'];

  const mode: Mode = values.yes ? 'non-interactive' : 'interactive';

  let result;
  if (mode === 'non-interactive') {
    result = await runQuestionnaire(NON_INTERACTIVE_IO, { mode, prefill });
  } else {
    const { io, close } = createStdioIo(process.stdin, process.stdout);
    try {
      result = await runQuestionnaire(io, { mode, prefill });
    } finally {
      close();
    }
  }

  if (result.status === 'cancelled') {
    process.stderr.write('Aborted. Nothing was written.\n');
    return { code: 130, cwd, ok: false };
  }
  if (result.status === 'error') {
    process.stderr.write(`eitr init: ${result.message}\n`);
    return { code: 1, cwd, ok: false };
  }

  const dir = path.join(cwd, '.eitr');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'init.json');
  await fs.writeFile(file, `${JSON.stringify(result.answers, null, 2)}\n`, 'utf8');

  process.stdout.write(`${renderAnswers(result.answers)}\n`);
  process.stdout.write(`Wrote ${path.relative(cwd, file).split(path.sep).join('/')}\n`);

  if (result.answers.stackHints?.language === 'python') {
    const pyCheck = await checkPython();
    if (!pyCheck.ok || pyCheck.warning) {
      process.stdout.write(
        '[WARN] Note: Python was not found in your local PATH. Framework will be generated, but running tests locally requires Python 3.8+.\n',
      );
    }
  } else if (result.answers.stackHints?.language === 'csharp') {
    const csCheck = await checkDotnet();
    if (!csCheck.ok || csCheck.warning) {
      process.stdout.write(
        '[WARN] Note: .NET SDK (dotnet) was not found in your local PATH. Framework will be generated, but running tests locally requires .NET 8+ SDK.\n',
      );
    }
  } else if (result.answers.stackHints?.language === 'java') {
    const javaCheck = await checkJava();
    if (!javaCheck.ok || javaCheck.warning) {
      process.stdout.write(
        '[WARN] Note: Java JDK (java) was not found in your local PATH. Framework will be generated, but running tests locally requires JDK 17+.\n',
      );
    }
    const isGradle = result.answers.stackHints?.automationTool?.includes('gradle');
    if (isGradle) {
      const gradleCheck = await checkGradle();
      if (!gradleCheck.ok || gradleCheck.warning) {
        process.stdout.write(
          '[WARN] Note: Gradle (gradle) was not found in your local PATH. Running tests locally requires Gradle installed.\n',
        );
      }
    } else {
      const mvnCheck = await checkMaven();
      if (!mvnCheck.ok || mvnCheck.warning) {
        process.stdout.write(
          '[WARN] Note: Maven (mvn) was not found in your local PATH. Running tests locally requires Apache Maven installed.\n',
        );
      }
    }
  }

  return { code: 0, cwd, ok: true };
}

export async function runInit(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(INIT_USAGE);
    return 0;
  }
  const collected = await collectInit(argv);
  if (collected.ok) {
    process.stdout.write('Next: run `eitr generate` to write the framework core.\n');
  }
  return collected.code;
}
