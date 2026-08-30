#!/usr/bin/env node

import { runNew } from './commands/new.js';
import { runInit } from './commands/init.js';
import { runGenerate } from './commands/generate.js';
import { runInstallCommand } from './commands/install-command.js';
import { runAuth } from './commands/auth.js';
import { runDoctor } from './commands/doctor.js';

import { ENGINE_VERSION } from '@eitr/engine';
const version = ENGINE_VERSION;

const BANNER = `
\x1b[36m  ███████╗██╗████████╗██████╗ \x1b[0m
\x1b[36m  ██╔════╝██║╚══██╔══╝██╔══██╗\x1b[0m
\x1b[36m  █████╗  ██║   ██║   ██████╔╝\x1b[0m
\x1b[36m  ██╔══╝  ██║   ██║   ██╔══██╗\x1b[0m
\x1b[36m  ███████╗██║   ██║   ██║  ██║\x1b[0m
\x1b[36m  ╚══════╝╚═╝   ╚═╝   ╚═╝  ╚═╝\x1b[0m
  \x1b[36mE2E Integration & Test Rig\x1b[0m \x1b[90mv${version}\x1b[0m
  \x1b[90mDesigned by Ivan Nestaruk\x1b[0m
`;

const USAGE = `${BANNER}
Usage: eitr <command> [options]

Commands:
  new        Questionnaire + generate + install the framework project, in one command
  init       Run only the questionnaire and write .eitr/init.json
  generate   Read .eitr/init.json and write + install the framework project
  install    (Re)install an already-generated project (npm install + browsers)
  auth       Capture browser session credentials and save to auth.json
  doctor     Check system environment (Node.js, npm, Python, Git, Playwright)

Run "eitr <command> --help" for command-specific flags.
`;

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }

  // Print banner for any primary executing command, but not for --help
  process.stdout.write(BANNER + '\n');

  switch (command) {
    case 'new':
      return runNew(rest);
    case 'init':
      return runInit(rest);
    case 'generate':
      return runGenerate(rest);
    case 'install':
      return runInstallCommand(rest);
    case 'auth':
      return runAuth(rest);
    case 'doctor':
      return runDoctor(rest);
    default:
      process.stderr.write(`eitr: unknown command "${command}"\n\n${USAGE}`);
      return 1;
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`eitr: ${message}\n`);
    process.exit(1);
  });
