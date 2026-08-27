import { createPromptSession, type InputStream, type OutputStream } from './prompt.js';
import type { ValidationResult } from './validators.js';

// Library-agnostic cancel sentinel. The production adapter translates any underlying cancel
// (Ctrl-C / SIGINT) into this before returning; the driver only ever compares against it, so
// interactive and test-fake paths share one control flow.
export const CANCELLED: unique symbol = Symbol('cancelled');
export type Cancelled = typeof CANCELLED;

export const NAV_LEFT: unique symbol = Symbol('nav_left');
export type NavLeft = typeof NAV_LEFT;

export const NAV_RIGHT: unique symbol = Symbol('nav_right');
export type NavRight = typeof NAV_RIGHT;

export interface TextSpec {
  id: string;
  message: string;
  default?: string;
  validate?: (val: string) => ValidationResult;
  stepIndex?: number;
}

export interface SelectSpec {
  id: string;
  message: string;
  choices: readonly { label: string; value: string }[];
  initialValue?: string;
  stepIndex?: number;
}

export interface MultiSelectSpec {
  id: string;
  message: string;
  choices: readonly { label: string; value: string }[];
  initialValues?: string[];
  stepIndex?: number;
}

import type { InstallStep } from '../commands/install.js';

export interface IoPort {
  text(spec: TextSpec): Promise<string | Cancelled | NavLeft | NavRight>;
  select(spec: SelectSpec): Promise<string | Cancelled | NavLeft | NavRight>;
  multiSelect(spec: MultiSelectSpec): Promise<string[] | Cancelled | NavLeft | NavRight>;
  review(
    answers: Record<string, string>,
    warnings?: string[] | undefined,
  ): Promise<string | Cancelled | NavLeft | NavRight>;
  confirmInstall(opts: {
    language?: string | undefined;
    automationTool?: string | undefined;
    steps: InstallStep[];
  }): Promise<boolean | Cancelled | NavLeft | NavRight>;
  note(message: string): void;
}

// Production IoPort over the zero-dep line-based prompts. Owns ONE readline session for the whole
// run (closed via the returned close()); translation only, cancel -> sentinel. No validation,
// defaulting, or re-ask here — the driver owns those.
export function createStdioIo(
  input: InputStream,
  output: OutputStream,
): { io: IoPort; close(): void } {
  const session = createPromptSession(input, output);
  const io: IoPort = {
    async text(spec) {
      const result = await session.text({
        message: spec.message,
        ...(spec.default !== undefined ? { default: spec.default } : {}),
        ...(spec.validate !== undefined ? { validate: spec.validate } : {}),
        ...(spec.stepIndex !== undefined ? { stepIndex: spec.stepIndex } : {}),
      });
      if (result.cancelled) return CANCELLED;
      if (result.nav === 'left') return NAV_LEFT;
      if (result.nav === 'right') return NAV_RIGHT;
      return result.value;
    },
    async select(spec) {
      const result = await session.select({
        message: spec.message,
        choices: spec.choices,
        ...(spec.initialValue !== undefined ? { initialValue: spec.initialValue } : {}),
        ...(spec.stepIndex !== undefined ? { stepIndex: spec.stepIndex } : {}),
      });
      if (result.cancelled) return CANCELLED;
      if (result.nav === 'left') return NAV_LEFT;
      if (result.nav === 'right') return NAV_RIGHT;
      return result.value;
    },
    async multiSelect(spec) {
      const result = await session.multiSelect({
        message: spec.message,
        choices: spec.choices,
        ...(spec.initialValues !== undefined ? { initialValues: spec.initialValues } : {}),
        ...(spec.stepIndex !== undefined ? { stepIndex: spec.stepIndex } : {}),
      });
      if (result.cancelled) return CANCELLED;
      if (result.nav === 'left') return NAV_LEFT;
      if (result.nav === 'right') return NAV_RIGHT;
      return result.value;
    },
    async review(answers, warnings) {
      const result = await session.review({
        answers,
        ...(warnings !== undefined ? { warnings } : {}),
      });
      if (result.cancelled) return CANCELLED;
      if (result.nav === 'left') return NAV_LEFT;
      if (result.nav === 'right') return NAV_RIGHT;
      return result.value;
    },
    async confirmInstall(opts) {
      const result = await session.confirmInstall(opts);
      if (result.cancelled) return CANCELLED;
      if (result.nav === 'left') return NAV_LEFT;
      if (result.nav === 'right') return NAV_RIGHT;
      return result.value === 'auto';
    },

    note(message) {
      output.write(`${message}\n`);
    },
  };
  return { io, close: () => session.close() };
}
