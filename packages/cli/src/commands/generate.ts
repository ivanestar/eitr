import { parseArgs } from 'node:util';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { plan, apply, baselineStackProfile, recon } from '@eitr/engine';
import { validateStartUrl, validateOutputDir } from '../questionnaire/validators.js';
import type { InitAnswers } from '../questionnaire/schema.js';
import { runInstall, manualInstallHint, type InstallFn } from './install.js';

// Exit codes: 0 = emitted (and, unless --no-install, fully installed); 2 = emitted but install
// incomplete (files valid — run the printed commands); 1 = emission failed / bad input.
export interface GenerateDeps {
  install?: InstallFn;
}

const GENERATE_USAGE = `Usage: eitr generate [options]

Reads .scaffold/init.json (produced by "eitr init") and writes a complete, runnable
project (in the chosen language and test framework) into the output directory, then installs it (npm install +
browsers). No login. If the browser install is blocked (e.g. antivirus), the files are still valid
and the exact commands to finish are printed.

Options:
  --cwd <dir>           Project root that holds .scaffold/init.json (default: cwd)
  --no-install          Emit files only; skip npm install + browsers
  --storage-state <file> Playwright storageState JSON file (auth.json) to bypass SSO during recon
  -h, --help            Show this help
`;

const GENERATE_ARG_OPTIONS = {
  cwd: { type: 'string' },
  'no-install': { type: 'boolean' },
  'storage-state': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// A safe npm "name" from the project folder basename.
// npm/pip/Java package naming all favor lowercase-kebab, so that's the default. .NET's own
// convention (assembly name, root namespace) is PascalCase - a lowercase-kebab .csproj name is
// valid but reads as foreign to any C# developer, so csharp gets its own transform.
export function toProjectName(dir: string, language?: string): string {
  const base = path
    .basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  const sanitized = base || 'playwright-tests';

  if (language === 'csharp') {
    const pascal = sanitized
      .split(/[-_.]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
    return pascal || 'PlaywrightTests';
  }

  return sanitized;
}

export async function runGenerate(argv: string[], deps: GenerateDeps = {}): Promise<number> {
  const { values } = parseArgs({ args: argv, options: GENERATE_ARG_OPTIONS });

  if (values.help) {
    process.stdout.write(GENERATE_USAGE);
    return 0;
  }

  const cwd = path.resolve(values.cwd ?? process.cwd());
  const initPath = path.join(cwd, '.scaffold', 'init.json');

  let raw: string;
  try {
    raw = await fs.readFile(initPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      process.stderr.write('eitr generate: no .scaffold/init.json found. Run `eitr init` first.\n');
      return 1;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stderr.write(`eitr generate: ${initPath} is not valid JSON. Re-run \`eitr init\`.\n`);
    return 1;
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    process.stderr.write(
      'eitr generate: unsupported .scaffold/init.json schema. Re-run `eitr init`.\n',
    );
    return 1;
  }
  const answers = parsed as unknown as InitAnswers;

  const language = answers.stackHints?.language ?? 'typescript';
  const tool = answers.stackHints?.automationTool ?? 'playwright';

  if (language === 'javascript') {
    process.stderr.write(
      "eitr generate: JavaScript support has been removed. Please migrate your project to TypeScript by changing 'language' to 'typescript' in .scaffold/init.json.\n",
    );
    return 1;
  }

  // Extensible supported-combo list. Add a new entry here when a new
  // TargetGenerator is registered in packages/engine/src/plan/plan.ts.
  // Cypress (typescript) is temporarily withheld from release pending a
  // CPOM primitive redesign native to Cypress's own retry/command-chain model rather
  // than the Playwright-shaped one it currently reuses - the generator code itself is
  // untouched and still works, it is just not offered to users yet. Re-add the entry
  // here (and the questionnaire/schema.ts choices) when that redesign lands.
  const SUPPORTED: Array<{ language: string; automationTool: string }> = [
    { language: 'typescript', automationTool: 'playwright' },
    { language: 'python', automationTool: 'playwright' },
    { language: 'python', automationTool: 'pytest' },
    { language: 'csharp', automationTool: 'playwright' },
    { language: 'java', automationTool: 'playwright' },
    { language: 'java', automationTool: 'playwright-maven' },
    { language: 'java', automationTool: 'playwright-gradle' },
  ];
  if (!SUPPORTED.some((s) => s.language === language && s.automationTool === tool)) {
    process.stderr.write(
      `eitr generate: generation for language "${language}" and E2E automation tool "${tool}" is not implemented yet.\n`,
    );
    return 1;
  }

  const urlCheck = validateStartUrl(String(answers.startUrl ?? ''));
  if (!urlCheck.ok) {
    process.stderr.write(`eitr generate: startUrl: ${urlCheck.error}\n`);
    return 1;
  }
  const dirCheck = validateOutputDir(String(answers.outputDir ?? ''));
  if (!dirCheck.ok) {
    process.stderr.write(`eitr generate: outputDir: ${dirCheck.error}\n`);
    return 1;
  }

  const outputRoot = path.resolve(cwd, dirCheck.value);
  const rel = path.relative(cwd, outputRoot);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    process.stderr.write('eitr generate: refusing to write outside the project root.\n');
    return 1;
  }
  const relOut = rel || '.';

  // Perform remote stack reconnaissance
  process.stdout.write(`Running reconnaissance scan on ${urlCheck.value}...\n`);

  const storageStateArg = values['storage-state'] as string | undefined;
  const reconOpts = storageStateArg ? { storageStatePath: path.resolve(cwd, storageStateArg) } : {};
  const reconResult = await recon(urlCheck.value, reconOpts);

  const profile = baselineStackProfile(outputRoot);

  // Merge live recon findings if not overridden by manual answers
  if (reconResult.framework) {
    profile.framework = {
      value: reconResult.framework,
      confidence: 'medium',
      source: 'live',
      evidence: [{ file: 'live-dom', matchedPattern: reconResult.framework }],
    };
  }
  if (reconResult.uiLibraries.length > 0) {
    profile.uiLibraries = reconResult.uiLibraries;
  }
  if (reconResult.testIdAttribute) {
    profile.testIdAttribute = {
      value: reconResult.testIdAttribute,
      confidence: 'medium',
      source: 'live',
      evidence: [{ file: 'live-dom', matchedPattern: reconResult.testIdAttribute }],
    };
  }

  // Override with manual stack hints if present
  if (answers.stackHints?.framework && answers.stackHints.framework !== 'unknown') {
    profile.framework = {
      value: answers.stackHints.framework as any,
      confidence: 'high',
      source: 'manual',
      evidence: [{ file: 'init.json', matchedPattern: answers.stackHints.framework }],
    };
  }
  if (answers.stackHints?.uiLibrary && answers.stackHints.uiLibrary !== 'unknown') {
    profile.uiLibraries = [
      {
        id: answers.stackHints.uiLibrary as any,
        version: '0.0.0',
        dependencyKind: 'direct',
        confidence: 'high',
        source: 'manual',
        evidence: [{ file: 'init.json', matchedPattern: answers.stackHints.uiLibrary }],
      },
    ];
  }

  const genPlan = plan(profile, {
    baseUrl: urlCheck.value,
    projectName: toProjectName(outputRoot, language),
    language,
    automationTool: tool,
    ...(answers.ciCd !== undefined ? { ciCd: answers.ciCd } : {}),
    ...(answers.aiAssistants !== undefined ? { aiAssistants: answers.aiAssistants } : {}),
    ...(answers.taskTracker !== undefined ? { taskTracker: answers.taskTracker } : {}),
    ...(answers.tmsProviders !== undefined ? { tmsProviders: answers.tmsProviders } : {}),
  });
  const result = await apply(genPlan, outputRoot, { pendingRecon: false });

  process.stdout.write(
    `\n[1/3] Generating ${tool.toUpperCase()} + ${language.toUpperCase()} framework into ${relOut}/:\n`,
  );
  for (const p of result.written) process.stdout.write(`  + ${relOut}/${p}\n`);
  if (result.skipped.length > 0) {
    process.stdout.write('\nkept (create-if-absent, already present):\n');
    for (const p of result.skipped) process.stdout.write(`  = ${relOut}/${p}\n`);
  }
  const skipInstall =
    Boolean(values['no-install']) ||
    Boolean(answers.skipInstall) ||
    process.env.EITR_SKIP_INSTALL === '1' ||
    process.env.SCAFFOLDER_SKIP_INSTALL === '1';

  if (skipInstall) {
    process.stdout.write(
      `\n[OK] Generation complete! (Installation skipped)\nTo finish setup:\n  ${manualInstallHint(relOut, language)}\n`,
    );
    return 0;
  }

  process.stdout.write(
    '\n[2/3] Installing dependencies and browser binaries... (skip next time with --no-install)\n',
  );
  const install = deps.install ?? ((dir: string) => runInstall(dir));
  const outcome = await install(outputRoot);

  if (outcome.installedDeps && outcome.installedBrowsers) {
    const isWindows = process.platform === 'win32';
    const cdCmd = relOut && relOut !== '.' ? `cd ${relOut}\n  ` : '';

    let instructions = '';
    if (language === 'python') {
      const runCmd = isWindows ? '.\\test' : './test.sh';
      instructions = `  ${cdCmd}${runCmd}               # Run all tests`;
    } else if (language === 'csharp') {
      instructions = `  ${cdCmd}dotnet test          # Run all C# tests with NUnit`;
    } else if (language === 'java') {
      const runCmd = tool.includes('gradle') ? 'gradle test' : 'mvn test';
      instructions = `  ${cdCmd}${runCmd}            # Run all Java tests with JUnit 5`;
    } else if (tool === 'cypress') {
      instructions = `  ${cdCmd}npm test             # Run Cypress tests in headless mode\n  npm run test:open    # Open interactive Cypress UI`;
    } else {
      instructions = `  ${cdCmd}npm test             # Run Playwright tests in headless mode\n  npm run test:ui      # Open Playwright UI mode`;
    }

    process.stdout.write(
      `\n[3/3] Project successfully generated and ready to run!\n` +
        `--------------------------------------------------\n` +
        `Next steps:\n${instructions}\n` +
        `--------------------------------------------------\n`,
    );
    return 0;
  }

  const what = outcome.installedDeps ? 'browser install' : 'dependency install';
  process.stderr.write(
    `\nGenerated OK, but ${what} did not complete${outcome.message ? ` (${outcome.message})` : ''}.\n` +
      `The project files are valid. Finish with:\n  ${manualInstallHint(relOut, language, { installedDeps: outcome.installedDeps })}\n`,
  );
  return 2;
}
