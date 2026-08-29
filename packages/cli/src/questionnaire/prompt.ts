import * as readline from 'node:readline';

// Zero-dependency, line-based prompts. Deliberately NO raw mode / arrow keys: those need a real
// TTY (which Windows Git Bash / MinTTY does not expose to node), whereas plain line reading works
// identically everywhere — PowerShell, conhost, MinTTY, pipes, CI. Selection is by number.
//
// A PromptSession owns ONE readline interface for the whole questionnaire and reads via a queue of
// 'line' events (NOT rl.question, which only yields the single next line and drops any lines that
// arrive between two calls — the exact failure when all answers are piped in at once). Lines that
// arrive before a reader is waiting are buffered; every prompt writes its own label to output.

export type InputStream = NodeJS.ReadableStream;

export interface OutputStream {
  write(chunk: string): boolean;
}

export type PromptResult =
  { cancelled: true } | { cancelled: false; value: string; nav?: 'left' | 'right' };

export interface TextPromptOptions {
  message: string;
  default?: string;
  validate?: (val: string) => { ok: true; value: string } | { ok: false; error: string };
  stepIndex?: number;
}

export interface SelectPromptOptions {
  message: string;
  choices: readonly { label: string; value: string }[];
  initialValue?: string;
  stepIndex?: number;
}

export interface MultiSelectPromptOptions {
  message: string;
  choices: readonly { label: string; value: string }[];
  initialValues?: string[];
  stepIndex?: number;
}

export type MultiSelectPromptResult =
  { cancelled: true } | { cancelled: false; value: string[]; nav?: 'left' | 'right' };

import type { InstallStep } from '../commands/install.js';

export interface PromptSession {
  text(opts: TextPromptOptions): Promise<PromptResult>;
  select(opts: SelectPromptOptions): Promise<PromptResult>;
  multiSelect(opts: MultiSelectPromptOptions): Promise<MultiSelectPromptResult>;
  review(opts: {
    answers: Record<string, string>;
    warnings?: string[] | undefined;
  }): Promise<PromptResult>;
  confirmInstall(opts: {
    language?: string | undefined;
    automationTool?: string | undefined;
    steps: InstallStep[];
  }): Promise<PromptResult>;
  close(): void;
}

export function createPromptSession(input: InputStream, output: OutputStream): PromptSession {
  // Pass output so a real terminal echoes the user's typing; we still write every prompt label
  // ourselves and never call rl.prompt()/rl.question(), so readline renders nothing on its own.
  const rl = readline.createInterface({
    input,
    output: output as unknown as NodeJS.WritableStream,
  });

  const lineQueue: string[] = [];
  const waiters: Array<(r: PromptResult) => void> = [];
  let closed = false;

  rl.on('line', (line) => {
    // Clear history to prevent leaks/accidental cycling across different questions
    (rl as any).history = [];

    const waiter = waiters.shift();
    if (waiter) waiter({ cancelled: false, value: line });
    else lineQueue.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length > 0) waiters.shift()!({ cancelled: true });
  });
  // In a terminal, readline captures Ctrl-C and emits 'SIGINT'; closing converges it onto 'close'.
  rl.on('SIGINT', () => rl.close());

  const readLine = (): Promise<PromptResult> => {
    if (lineQueue.length > 0)
      return Promise.resolve({ cancelled: false, value: lineQueue.shift()! });
    if (closed) return Promise.resolve({ cancelled: true });
    return new Promise<PromptResult>((resolve) => waiters.push(resolve));
  };

  return {
    async text(opts) {
      const def = opts.default;
      const suffix =
        def !== undefined && def !== '' ? ` \u001b[90m(default: ${def})\u001b[39m` : '';

      let linesWritten = 0;
      const header = renderWizardHeader(opts.stepIndex);
      if (header) {
        output.write(header);
        linesWritten += 3;
        output.write(
          `\u001b[2K\u001b[36m?\u001b[39m \u001b[1m${opts.message}\u001b[22m${suffix}\n`,
        );
      } else {
        output.write(
          `\n\u001b[2K\u001b[36m?\u001b[39m \u001b[1m${opts.message}\u001b[22m${suffix}\n`,
        );
        linesWritten += 2;
      }

      let navDirection: 'left' | 'right' | null = null;
      const handleKey = (_char: string, key: any) => {
        if (!key || closed) return;
        if (key.name === 'left' && rl.line === '') {
          navDirection = 'left';
          rl.write('\n');
        } else if (key.name === 'escape') {
          navDirection = 'left';
          rl.write('\n');
        } else if (key.name === 'right' && rl.line === '') {
          navDirection = 'right';
          rl.write('\n');
        }
      };

      const hasRawMode =
        input === process.stdin &&
        typeof (input as any).setRawMode === 'function' &&
        (input as any).isTTY;

      if (hasRawMode) {
        input.on('keypress', handleKey);
      }

      try {
        for (let attempt = 0; attempt < 8; attempt++) {
          output.write(`\u001b[2K\u001b[36m›\u001b[39m `);
          const r = await readLine();
          linesWritten += 1;

          if (r.cancelled) return { cancelled: true };

          if (navDirection) {
            output.write(`\u001b[${linesWritten}A\r`);
            for (let j = 0; j < linesWritten; j++) output.write('\u001b[2K\n');
            output.write(`\u001b[${linesWritten}A\r`);
            return { cancelled: false, value: '', nav: navDirection };
          }

          const trimmed = r.value.trim();
          const val = trimmed === '' && def !== undefined ? def : trimmed;

          if (opts.validate) {
            const res = opts.validate(val);
            if (res.ok) {
              output.write(
                `\u001b[${linesWritten}A\r\u001b[2K\u001b[32m✔\u001b[39m \u001b[1m${opts.message}\u001b[22m: \u001b[36m${res.value}\u001b[39m\n`,
              );
              for (let j = 0; j < linesWritten - 1; j++) output.write('\u001b[2K\n');
              output.write(`\u001b[${linesWritten - 1}A\r`);
              return { cancelled: false, value: res.value };
            } else {
              output.write(`\u001b[2K${res.error}\n`);
              linesWritten += 1;
            }
          } else {
            output.write(
              `\u001b[${linesWritten}A\r\u001b[2K\u001b[32m✔\u001b[39m \u001b[1m${opts.message}\u001b[22m: \u001b[36m${val}\u001b[39m\n`,
            );
            for (let j = 0; j < linesWritten - 1; j++) output.write('\u001b[2K\n');
            output.write(`\u001b[${linesWritten - 1}A\r`);
            return { cancelled: false, value: val };
          }
        }
        return { cancelled: true };
      } finally {
        if (hasRawMode) {
          input.removeListener('keypress', handleKey);
        }
      }
    },

    async select(opts) {
      const { choices } = opts;
      if (choices.length === 0) throw new Error('select requires at least one choice');
      let defaultIndex = choices.findIndex((c) => c.value === opts.initialValue);
      if (defaultIndex < 0) defaultIndex = 0;

      // 1. Try interactive raw-mode select if supported
      if (
        input === process.stdin &&
        typeof (input as any).setRawMode === 'function' &&
        (input as any).isTTY
      ) {
        try {
          rl.pause();
          const res = await runInteractiveSelect(
            input,
            output,
            opts.message,
            choices,
            defaultIndex,
            opts.stepIndex,
          );
          return res;
        } catch {
          // Fall back to line-based select on failure
        } finally {
          if (!closed) {
            rl.resume();
          }
        }
      }

      // 2. Fallback to line-based numbered select with prefix matching
      let linesWritten = 0;
      const header = renderWizardHeader(opts.stepIndex);
      if (header) {
        output.write(header);
        linesWritten += 3;
        output.write(`\u001b[2K\u001b[36m?\u001b[39m \u001b[1m${opts.message}\u001b[22m\n`);
      } else {
        output.write(`\n\u001b[2K\u001b[36m?\u001b[39m \u001b[1m${opts.message}\u001b[22m\n`);
        linesWritten += 2;
      }
      choices.forEach((c, i) => {
        const marker = i === defaultIndex ? ' \u001b[90m(default)\u001b[39m' : '';
        output.write(`\u001b[2K  \u001b[36m${i + 1})\u001b[39m ${c.label}${marker}\n`);
        linesWritten += 1;
      });

      for (;;) {
        output.write(`\u001b[2K\u001b[36m›\u001b[39m Enter a number [${defaultIndex + 1}]: `);
        const r = await readLine();
        if (r.cancelled) return { cancelled: true };
        linesWritten += 1;
        const trimmed = r.value.trim().toLowerCase();

        if (trimmed === 'left' || trimmed === '<' || trimmed === 'back') {
          output.write(`\u001b[${linesWritten}A\r`);
          for (let j = 0; j < linesWritten; j++) output.write('\u001b[2K\n');
          output.write(`\u001b[${linesWritten}A\r`);
          return { cancelled: false, value: '', nav: 'left' };
        }
        if (trimmed === 'right' || trimmed === '>' || trimmed === 'forward') {
          output.write(`\u001b[${linesWritten}A\r`);
          for (let j = 0; j < linesWritten; j++) output.write('\u001b[2K\n');
          output.write(`\u001b[${linesWritten}A\r`);
          return { cancelled: false, value: '', nav: 'right' };
        }

        const accept = (value: string, label: string) => {
          output.write(
            `\u001b[${linesWritten}A\r\u001b[2K\u001b[32m✔\u001b[39m \u001b[1m${opts.message}\u001b[22m: \u001b[36m${label}\u001b[39m\n`,
          );
          for (let j = 0; j < linesWritten - 1; j++) output.write('\u001b[2K\n');
          output.write(`\u001b[${linesWritten - 1}A\r`);
          return { cancelled: false, value };
        };

        if (trimmed === '') {
          return accept(choices[defaultIndex].value, choices[defaultIndex].label);
        }
        const n = Number(trimmed);
        if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
          return accept(choices[n - 1].value, choices[n - 1].label);
        }

        // Try exact or prefix match on value or label
        const matches = choices.filter(
          (c) =>
            c.value.toLowerCase() === trimmed ||
            c.label.toLowerCase() === trimmed ||
            c.value.toLowerCase().startsWith(trimmed) ||
            c.label.toLowerCase().startsWith(trimmed) ||
            (trimmed === 'ts' && c.value === 'typescript') ||
            (trimmed === 'js' && c.value === 'javascript'),
        );

        if (matches.length === 1) {
          return accept(matches[0].value, matches[0].label);
        } else if (matches.length > 1) {
          output.write(
            `\u001b[2KMultiple choices matched "${r.value.trim()}". Please be more specific.\n`,
          );
          linesWritten += 1;
        } else {
          output.write(`\u001b[2KPlease enter a number between 1 and ${choices.length}.\n`);
          linesWritten += 1;
        }
      }
    },

    async review(opts: { answers: Record<string, string>; warnings?: string[] }) {
      const { answers, warnings } = opts;

      const items: { label: string; value: string }[] = [
        { label: 'Start URL', value: answers.startUrl || '' },
        { label: 'Language', value: answers.language || '' },
        { label: 'Automation tool', value: answers.automationTool || '' },
        { label: 'CI/CD integration', value: answers.ciCd || 'none' },
        { label: 'AI Assistants', value: answers.aiAssistants || '' },
        { label: 'Task Tracker (MCP)', value: answers.taskTracker || 'none' },
        { label: 'TMS Providers (MCP)', value: answers.tmsProviders || 'none' },
      ];

      const hasDetected =
        (answers.framework && answers.framework !== 'unknown') ||
        (answers.uiLibrary && answers.uiLibrary !== 'unknown');

      if (hasDetected) {
        items.push({ label: '---', value: '' });
        items.push({ label: 'AUTO-DETECTED STACK', value: '' });
        if (answers.framework && answers.framework !== 'unknown') {
          items.push({ label: 'Framework', value: answers.framework });
        }
        if (answers.uiLibrary && answers.uiLibrary !== 'unknown') {
          items.push({ label: 'UI Library', value: answers.uiLibrary });
        }
      }

      output.write(drawBox('R E V I E W   Y O U R   S E L E C T I O N S', items));

      if (warnings && warnings.length > 0) {
        for (const w of warnings) {
          output.write(`\u001b[33m${w}\u001b[39m\n`);
        }
        output.write('\n');
      }

      const choices = [
        { label: 'Submit', value: 'submit' },
        { label: 'Cancel', value: 'cancel' },
      ];
      return this.select({ message: 'Select an option', choices, initialValue: 'submit' });
    },

    async confirmInstall(opts: {
      language?: string | undefined;
      automationTool?: string | undefined;
      steps: InstallStep[];
    }) {
      const { language, automationTool, steps } = opts;
      const targetLabel = `${(language || 'typescript').toUpperCase()} (${(automationTool || 'playwright').toUpperCase()})`;

      const rows: { label: string; value: string }[] = [
        { label: 'Target Framework', value: targetLabel },
      ];

      steps.forEach((step, idx) => {
        rows.push({ label: `Step ${idx + 1}: ${step.description}`, value: '' });
        rows.push({ label: `   $ ${step.command}`, value: '' });
      });

      output.write(drawBox('A U T O M A T I C   I N S T A L L A T I O N', rows));

      const choices = [
        { label: 'Install automatically now (recommended)', value: 'auto' },
        {
          label: 'Skip automatic installation (I will run setup commands manually)',
          value: 'manual',
        },
      ];
      return this.select({
        message: 'Select installation preference',
        choices,
        initialValue: 'auto',
      });
    },

    async multiSelect(opts) {
      const { choices } = opts;
      if (choices.length === 0) throw new Error('multiSelect requires at least one choice');
      const initialSelected = new Set(opts.initialValues || []);

      if (
        input === process.stdin &&
        typeof (input as any).setRawMode === 'function' &&
        (input as any).isTTY
      ) {
        try {
          rl.pause();
          const res = await runInteractiveMultiSelect(
            input,
            output,
            opts.message,
            choices,
            initialSelected,
            opts.stepIndex,
          );
          return res;
        } catch {
        } finally {
          if (!closed) rl.resume();
        }
      }

      let linesWritten = 0;
      const header = renderWizardHeader(opts.stepIndex);
      if (header) {
        output.write(header);
        linesWritten += 3;
        output.write(
          `\u001b[2K\u001b[36m?\u001b[39m \u001b[1m${opts.message}\u001b[22m (comma-separated numbers)\n`,
        );
      } else {
        output.write(
          `\n\u001b[2K\u001b[36m?\u001b[39m \u001b[1m${opts.message}\u001b[22m (comma-separated numbers)\n`,
        );
        linesWritten += 2;
      }
      choices.forEach((c, i) => {
        const marker = initialSelected.has(c.value) ? ' \u001b[90m(selected)\u001b[39m' : '';
        output.write(`\u001b[2K  \u001b[36m${i + 1})\u001b[39m ${c.label}${marker}\n`);
        linesWritten += 1;
      });

      for (;;) {
        output.write(`\u001b[2K\u001b[36m›\u001b[39m Enter numbers: `);
        const r = await readLine();
        if (r.cancelled) return { cancelled: true };
        linesWritten += 1;
        const trimmed = r.value.trim().toLowerCase();

        if (trimmed === 'left' || trimmed === '<' || trimmed === 'back') {
          output.write(`\u001b[${linesWritten}A\r`);
          for (let j = 0; j < linesWritten; j++) output.write('\u001b[2K\n');
          output.write(`\u001b[${linesWritten}A\r`);
          return { cancelled: false, value: [], nav: 'left' };
        }
        if (trimmed === 'right' || trimmed === '>' || trimmed === 'forward') {
          output.write(`\u001b[${linesWritten}A\r`);
          for (let j = 0; j < linesWritten; j++) output.write('\u001b[2K\n');
          output.write(`\u001b[${linesWritten}A\r`);
          return { cancelled: false, value: [], nav: 'right' };
        }

        if (trimmed === '') {
          return { cancelled: false, value: Array.from(initialSelected) };
        }

        const nums = trimmed
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= choices.length);
        if (nums.length > 0 || trimmed.split(',').every((s) => s.trim() === '')) {
          const vals = nums.map((n) => choices[n - 1].value);
          output.write(
            `\u001b[${linesWritten}A\r\u001b[2K\u001b[32m✔\u001b[39m \u001b[1m${opts.message}\u001b[22m: \u001b[36m${vals.length} selected\u001b[39m\n`,
          );
          for (let j = 0; j < linesWritten - 1; j++) output.write('\u001b[2K\n');
          output.write(`\u001b[${linesWritten - 1}A\r`);
          return { cancelled: false, value: vals };
        }
        output.write(`\u001b[2KPlease enter valid comma-separated numbers.\n`);
        linesWritten += 1;
      }
    },

    close() {
      if (!closed) rl.close();
    },
  };
}

function runInteractiveSelect(
  stdin: any,
  stdout: OutputStream,
  message: string,
  choices: readonly { label: string; value: string }[],
  initialIndex: number,
  stepIndex?: number,
): Promise<PromptResult> {
  return new Promise<PromptResult>((resolve) => {
    let activeIndex = initialIndex;

    readline.emitKeypressEvents(stdin);

    const oldRaw = stdin.isRaw;
    try {
      stdin.setRawMode(true);
    } catch {
      resolve({ cancelled: true });
      return;
    }
    stdin.resume();

    // Hide cursor
    stdout.write('\u001b[?25l');

    // Print initial state
    let boxHeight = choices.length + 2;
    const header = renderWizardHeader(stepIndex);
    if (header) {
      stdout.write(header);
      boxHeight += 1;
      stdout.write(`\u001b[2K\u001b[36m?\u001b[39m \u001b[1m${message}\u001b[22m\n`);
    } else {
      stdout.write(`\n\u001b[2K\u001b[36m?\u001b[39m \u001b[1m${message}\u001b[22m\n`);
    }

    choices.forEach((c, idx) => {
      const bullet = idx === activeIndex ? '\u001b[32m(●)\u001b[39m' : '\u001b[90m( )\u001b[39m';
      const color = idx === activeIndex ? '\u001b[1m' : '';
      const reset = idx === activeIndex ? '\u001b[22m' : '';
      stdout.write(`\u001b[2K   ${bullet} ${color}${c.label}${reset}\n`);
    });

    const cleanup = () => {
      stdin.removeListener('keypress', handleKeypress);
      try {
        stdin.setRawMode(oldRaw);
      } catch {}
      // Show cursor
      stdout.write('\u001b[?25h');
    };

    function handleKeypress(_str: any, key: any) {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        cleanup();
        resolve({ cancelled: true });
        return;
      }

      if (key.name === 'up') {
        activeIndex = (activeIndex - 1 + choices.length) % choices.length;
        redraw();
      } else if (key.name === 'down') {
        activeIndex = (activeIndex + 1) % choices.length;
        redraw();
      } else if (key.name === 'left') {
        cleanup();
        stdout.write(`\u001b[${boxHeight}A\r`);
        for (let j = 0; j < boxHeight; j++) stdout.write('\u001b[2K\n');
        stdout.write(`\u001b[${boxHeight}A\r`);
        resolve({ cancelled: false, value: '', nav: 'left' });
        return;
      } else if (key.name === 'right') {
        cleanup();
        stdout.write(`\u001b[${boxHeight}A\r`);
        for (let j = 0; j < boxHeight; j++) stdout.write('\u001b[2K\n');
        stdout.write(`\u001b[${boxHeight}A\r`);
        resolve({ cancelled: false, value: '', nav: 'right' });
        return;
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        // Clear the lines and print the final selected value for clean history
        stdout.write(
          `\u001b[${boxHeight}A\r\u001b[2K\u001b[32m✔\u001b[39m \u001b[1m${message}\u001b[22m: \u001b[36m${choices[activeIndex].label}\u001b[39m\n`,
        );
        for (let j = 0; j < boxHeight - 1; j++) stdout.write('\u001b[2K\n');
        stdout.write(`\u001b[${boxHeight - 1}A\r`);
        resolve({ cancelled: false, value: choices[activeIndex].value });
      }
    }

    function moveCursorUp(n: number) {
      stdout.write(`\u001b[${n}A\r`);
    }

    function redraw() {
      moveCursorUp(choices.length);
      choices.forEach((c, idx) => {
        const bullet = idx === activeIndex ? '\u001b[32m(●)\u001b[39m' : '\u001b[90m( )\u001b[39m';
        const color = idx === activeIndex ? '\u001b[1m' : '';
        const reset = idx === activeIndex ? '\u001b[22m' : '';
        stdout.write(`\u001b[2K   ${bullet} ${color}${c.label}${reset}\n`);
      });
    }

    stdin.on('keypress', handleKeypress);
  });
}

function renderWizardHeader(stepIndex?: number): string {
  if (stepIndex === undefined) return '';
  const steps = [
    'App URL',
    'Test Lang',
    'Test Tool',
    '',
    '',
    'CI/CD',
    'AI Rules',
    'TMS / MCP',
    'Review',
  ];
  const parts: string[] = [];
  steps.forEach((name, idx) => {
    if (!name) return; // Hide skipped tabs like framework and uiLibrary
    if (idx === stepIndex) {
      parts.push(`\u001b[36m\u001b[1m${name}\u001b[22m\u001b[39m`);
    } else {
      parts.push(`\u001b[90m${name}\u001b[39m`);
    }
  });
  return `\n\u001b[2K${parts.join('  \u001b[90m›\u001b[39m  ')}\n`;
}

function drawBox(title: string, lines: { label: string; value: string }[]): string {
  const stripAnsi = (str: string) => str.replace(/\u001b\[[0-9;]*m/g, '');

  const calculatedLines = lines.map(({ label, value }) => {
    if (label === '---') {
      return { isDivider: true, rawLength: 0, formattedText: '' };
    }
    if (!value) {
      const rawText = label;
      const formattedText = `\u001b[33m\u001b[1m${label}\u001b[22m\u001b[39m`;
      return { isDivider: false, rawLength: stripAnsi(rawText).length, formattedText };
    }
    const labelPadded = label.padEnd(Math.max(18, label.length));
    const rawText = `${labelPadded} : ${value}`;
    const formattedText = `\u001b[1m${labelPadded}\u001b[22m : \u001b[36m${value}\u001b[39m`;
    return { isDivider: false, rawLength: stripAnsi(rawText).length, formattedText };
  });

  const maxLineLength = Math.max(title.length, ...calculatedLines.map((l) => l.rawLength));
  const contentWidth = Math.max(56, maxLineLength);

  const borderTop = `┌${'─'.repeat(contentWidth + 4)}┐`;
  const borderMid = `├${'─'.repeat(contentWidth + 4)}┤`;
  const borderBot = `└${'─'.repeat(contentWidth + 4)}┘`;

  const paddedTitle = title.padEnd(contentWidth);
  const titleLine = `│  \u001b[36m\u001b[1m${paddedTitle}\u001b[22m\u001b[39m  │`;

  const formattedLines = calculatedLines.map(({ isDivider, rawLength, formattedText }) => {
    if (isDivider) {
      return borderMid;
    }
    const pad = ' '.repeat(Math.max(0, contentWidth - rawLength));
    return `│  ${formattedText}${pad}  │`;
  });

  return ['', borderTop, titleLine, borderMid, ...formattedLines, borderBot, ''].join('\n');
}

function runInteractiveMultiSelect(
  stdin: any,
  stdout: OutputStream,
  message: string,
  choices: readonly { label: string; value: string }[],
  initialSelected: Set<string>,
  stepIndex?: number,
): Promise<MultiSelectPromptResult> {
  return new Promise<MultiSelectPromptResult>((resolve) => {
    let activeIndex = 0;
    const selected = new Set(initialSelected);

    readline.emitKeypressEvents(stdin);

    const oldRaw = stdin.isRaw;
    try {
      stdin.setRawMode(true);
    } catch {
      resolve({ cancelled: true });
      return;
    }
    stdin.resume();
    stdout.write('\u001b[?25l');

    let boxHeight = choices.length + 2;
    const header = renderWizardHeader(stepIndex);
    if (header) {
      stdout.write(header);
      boxHeight += 1;
      stdout.write(`\u001b[2K\u001b[36m?\u001b[39m \u001b[1m${message}\u001b[22m\n`);
    } else {
      stdout.write(`\n\u001b[2K\u001b[36m?\u001b[39m \u001b[1m${message}\u001b[22m\n`);
    }

    const drawChoices = () => {
      choices.forEach((c, idx) => {
        const isSelected = selected.has(c.value);
        const checkbox = isSelected ? '\u001b[32m[x]\u001b[39m' : '\u001b[90m[ ]\u001b[39m';
        const pointer = idx === activeIndex ? '\u001b[36m›\u001b[39m' : ' ';
        const color = idx === activeIndex ? '\u001b[1m' : '';
        const reset = idx === activeIndex ? '\u001b[22m' : '';
        stdout.write(`\u001b[2K ${pointer} ${checkbox} ${color}${c.label}${reset}\n`);
      });
    };
    drawChoices();

    const cleanup = () => {
      stdin.removeListener('keypress', handleKeypress);
      try {
        stdin.setRawMode(oldRaw);
      } catch {}
      stdout.write('\u001b[?25h');
    };

    function handleKeypress(_str: any, key: any) {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        cleanup();
        resolve({ cancelled: true });
        return;
      }

      if (key.name === 'up') {
        activeIndex = (activeIndex - 1 + choices.length) % choices.length;
        redraw();
      } else if (key.name === 'down') {
        activeIndex = (activeIndex + 1) % choices.length;
        redraw();
      } else if (key.name === 'space' || _str === ' ') {
        const val = choices[activeIndex].value;
        if (selected.has(val)) selected.delete(val);
        else selected.add(val);
        redraw();
      } else if (key.name === 'left') {
        cleanup();
        stdout.write(`\u001b[${boxHeight}A\r`);
        for (let j = 0; j < boxHeight; j++) stdout.write('\u001b[2K\n');
        stdout.write(`\u001b[${boxHeight}A\r`);
        resolve({ cancelled: false, value: [], nav: 'left' });
      } else if (key.name === 'right') {
        cleanup();
        stdout.write(`\u001b[${boxHeight}A\r`);
        for (let j = 0; j < boxHeight; j++) stdout.write('\u001b[2K\n');
        stdout.write(`\u001b[${boxHeight}A\r`);
        resolve({ cancelled: false, value: [], nav: 'right' });
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        stdout.write(
          `\u001b[${boxHeight}A\r\u001b[2K\u001b[32m✔\u001b[39m \u001b[1m${message}\u001b[22m: \u001b[36m${selected.size} selected\u001b[39m\n`,
        );
        for (let j = 0; j < boxHeight - 1; j++) stdout.write('\u001b[2K\n');
        stdout.write(`\u001b[${boxHeight - 1}A\r`);
        resolve({ cancelled: false, value: Array.from(selected) });
      }
    }

    function redraw() {
      stdout.write(`\u001b[${choices.length}A\r`);
      drawChoices();
    }

    stdin.on('keypress', handleKeypress);
  });
}
