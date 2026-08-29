import {
  CANCELLED,
  type Cancelled,
  type IoPort,
  type SelectSpec,
  type MultiSelectSpec,
  type TextSpec,
} from '../src/questionnaire/io.js';
import { NAV_LEFT, NAV_RIGHT } from '../src/questionnaire/io.js';
import type { InstallStep } from '../src/commands/install.js';

// A scripted IoPort for headless driver tests. Answers are per-id FIFO queues (NOT one value per
// id) so re-ask-after-invalid and edit-before-submit — which ask the same id twice with different
// answers — are faithfully reproduced. It throws on an exhausted queue (an accidental infinite
// re-ask surfaces as a test failure, never a hang) and on a select value outside the option set
// (keeps "options are closed" real). It resolves on a microtask so a missing `await` surfaces.

export interface FakeScript {
  text?: Record<string, (string | Cancelled)[]>;
  select?: Record<string, (string | Cancelled)[]>;
  multiSelect?: Record<string, (string[] | Cancelled)[]>;
}

export interface FakeCall {
  type: 'text' | 'select' | 'multiSelect';
  id: string;
  message: string;
  default?: string;
  initialValue?: string;
  choices?: string[];
}

export interface FakeIo {
  io: IoPort;
  calls: FakeCall[];
  notes: string[];
}

function clone<T>(
  src: Record<string, (T | Cancelled)[]> | undefined,
): Record<string, (T | Cancelled)[]> {
  const out: Record<string, (T | Cancelled)[]> = {};
  for (const [k, v] of Object.entries(src ?? {})) out[k] = [...v];
  return out;
}

export function createFakeIo(script: FakeScript): FakeIo {
  const text = clone<string>(script.text);
  const select = clone<string>(script.select);
  const multiSelect = clone<string[]>(script.multiSelect);
  const calls: FakeCall[] = [];
  const notes: string[] = [];

  const io: IoPort = {
    text(spec: TextSpec) {
      const call: FakeCall = { type: 'text', id: spec.id, message: spec.message };
      if (spec.default !== undefined) call.default = spec.default;
      calls.push(call);
      const queue = text[spec.id];
      if (!queue || queue.length === 0) {
        throw new Error(`fake io: no scripted text answer left for "${spec.id}"`);
      }
      const runValidation = (attempt: number): Promise<string | Cancelled> => {
        if (queue.length === 0) {
          throw new Error(
            `fake io: no scripted text answer left for "${spec.id}" during validation`,
          );
        }
        const next = queue.shift() as string | Cancelled;
        if (next === CANCELLED) return Promise.resolve(CANCELLED);
        if (spec.validate) {
          const res = spec.validate(next);
          if (res.ok) {
            return Promise.resolve(res.value);
          } else {
            notes.push(res.error);
            if (attempt >= 7) return Promise.resolve(CANCELLED);
            return runValidation(attempt + 1);
          }
        }
        return Promise.resolve(next);
      };
      return runValidation(0);
    },
    select(spec: SelectSpec) {
      const call: FakeCall = {
        type: 'select',
        id: spec.id,
        message: spec.message,
        choices: spec.choices.map((c) => c.value),
      };
      if (spec.initialValue !== undefined) call.initialValue = spec.initialValue;
      calls.push(call);
      const queue = select[spec.id];
      if (!queue || queue.length === 0) {
        if (spec.initialValue !== undefined) {
          return Promise.resolve().then(() => spec.initialValue);
        }
        throw new Error(`fake io: no scripted select answer left for "${spec.id}"`);
      }
      const next = queue.shift() as string | Cancelled;
      if (next !== CANCELLED && !spec.choices.some((c) => c.value === next)) {
        throw new Error(
          `fake io: scripted select value "${String(next)}" is not a choice for "${spec.id}"`,
        );
      }
      return Promise.resolve().then(() => next);
    },
    multiSelect(spec: MultiSelectSpec) {
      const call: FakeCall = {
        type: 'multiSelect',
        id: spec.id,
        message: spec.message,
        choices: spec.choices.map((c) => c.value),
      };
      calls.push(call);
      const queue = multiSelect?.[spec.id];
      if (!queue || queue.length === 0) {
        return Promise.resolve().then(() => spec.initialValues ?? []);
      }
      const next = queue.shift() as string[] | Cancelled;
      if (next !== CANCELLED) {
        for (const v of next) {
          if (!spec.choices.some((c) => c.value === v)) {
            throw new Error(
              `fake io: scripted multiSelect value "${String(v)}" is not a choice for "${spec.id}"`,
            );
          }
        }
      }
      return Promise.resolve().then(() => next);
    },
    review(answers: Record<string, string>, warnings?: string[]) {
      if (warnings && warnings.length > 0) {
        notes.push(...warnings);
      }
      // Serialize answers to notes so driver test assertions can find edited values
      notes.push(JSON.stringify(answers));

      const call: FakeCall = {
        type: 'select',
        id: 'review',
        message: 'What next?',
        choices: [
          'submit',
          'cancel',
          'edit:startUrl',
          'edit:language',
          'edit:automationTool',
          'edit:framework',
          'edit:uiLibrary',
          'edit:ciCd',
          'edit:aiAssistants',
          'edit:taskTracker',
          'edit:tmsProviders',
        ],
      };
      calls.push(call);
      const queue = select['review'];
      if (!queue || queue.length === 0) {
        throw new Error(`fake io: no scripted review answer left`);
      }
      const next = queue.shift() as string | Cancelled;
      return Promise.resolve().then(() => next);
    },
    confirmInstall(_opts: {
      language?: string | undefined;
      automationTool?: string | undefined;
      steps: InstallStep[];
    }) {
      const queue = select['confirmInstall'];
      if (!queue || queue.length === 0) {
        return Promise.resolve().then(() => true);
      }
      const next = queue.shift();
      if (next === CANCELLED) return Promise.resolve().then(() => CANCELLED);
      if (next === NAV_LEFT) return Promise.resolve().then(() => NAV_LEFT);
      if (next === NAV_RIGHT) return Promise.resolve().then(() => NAV_RIGHT);
      return Promise.resolve().then(() => next === 'auto' || next === 'yes' || next === true);
    },

    note(message: string) {
      notes.push(message);
    },
  };

  return { io, calls, notes };
}
