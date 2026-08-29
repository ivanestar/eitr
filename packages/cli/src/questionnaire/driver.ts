import type { InitAnswers, Question, QuestionId } from './schema.js';
import {
  QUESTIONS,
  FLAG_OF,
  defaultOutputDirForAutomationTool,
  getChoicesForLanguage,
  isToolSupportedByLanguage,
} from './schema.js';
import { validateAnswer } from './validators.js';
import { answersToInitAnswers } from './reducer.js';
import {
  CANCELLED,
  NAV_LEFT,
  NAV_RIGHT,
  type IoPort,
  type SelectSpec,
  type MultiSelectSpec,
  type TextSpec,
} from './io.js';
import { detectStack, type DetectionResult } from './detect.js';
import {
  checkPython,
  checkDotnet,
  checkJava,
  checkMaven,
  checkGradle,
} from '../commands/doctor.js';
import { getPlannedInstallSteps } from '../commands/install.js';

// The driver owns ALL control flow — sequencing, the re-ask-on-invalid loop, the editable
// review menu, and cancel/error handling. It never touches process/fs/isTTY; every side effect
// is behind IoPort. It returns a discriminated result the thin command maps to an exit code.

export type Mode = 'interactive' | 'non-interactive';

export type QuestionnaireResult =
  | { status: 'ok'; answers: InitAnswers }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface RunOptions {
  mode: Mode;
  prefill: Partial<Record<QuestionId, string>>;
  /** Injectable for testing — defaults to the live detectStack implementation. */
  detect?: (url: string) => Promise<DetectionResult>;
}

type AskOutcome =
  | { kind: 'ok'; value: any }
  | { kind: 'cancelled' }
  | { kind: 'nav'; direction: 'left' | 'right' }
  | { kind: 'error'; message: string };

function toTextSpec(
  q: Extract<Question, { kind: 'text' }>,
  current: string | undefined,
  answers: Partial<Record<QuestionId, string>>,
): TextSpec {
  const def = current ?? q.default;
  return {
    id: q.id,
    message: q.message,
    ...(def !== undefined ? { default: def } : {}),
    validate: (v) => validateAnswer(q, v, answers),
  };
}

function toSelectSpec(
  q: Extract<Question, { kind: 'select' }>,
  current: string | undefined,
  answers: Partial<Record<QuestionId, string>>,
  hints: DetectionResult,
): SelectSpec {
  const choices =
    q.id === 'automationTool' ? getChoicesForLanguage(q.choices, answers.language) : q.choices;
  // Use detected hint as initial value only when the user hasn't explicitly answered yet
  const detectedInitial =
    current === undefined
      ? q.id === 'framework'
        ? hints.framework
        : q.id === 'uiLibrary'
          ? hints.uiLibrary
          : undefined
      : undefined;
  return {
    id: q.id,
    message: q.message,
    choices,
    initialValue: current ?? detectedInitial ?? q.default,
  };
}

function toMultiSelectSpec(
  q: Extract<Question, { kind: 'multiselect' }>,
  current: readonly string[] | undefined,
): MultiSelectSpec {
  return {
    id: q.id,
    message: q.message,
    choices: q.choices,
    initialValues: [...(current ?? q.default)],
  };
}

function resolveDefaultValue(q: Question, answers: Partial<Record<QuestionId, any>>): any {
  if (q.id === 'outputDir') {
    return (
      answers.outputDir ??
      defaultOutputDirForAutomationTool(answers.automationTool, answers.language)
    );
  }
  return q.default;
}

async function ask(
  io: IoPort,
  q: Question,
  answers: Partial<Record<QuestionId, any>>,
  stepIndex: number,
  hints: DetectionResult,
  current?: any,
): Promise<AskOutcome> {
  if (q.kind === 'select') {
    const spec = toSelectSpec(q, current, answers, hints);
    spec.stepIndex = stepIndex;
    const v = await io.select(spec);
    if (v === CANCELLED) return { kind: 'cancelled' };
    if (v === NAV_LEFT) return { kind: 'nav', direction: 'left' };
    if (v === NAV_RIGHT) return { kind: 'nav', direction: 'right' };
    return { kind: 'ok', value: v };
  } else if (q.kind === 'multiselect') {
    const spec = toMultiSelectSpec(q, current);
    spec.stepIndex = stepIndex;
    const v = await io.multiSelect(spec);
    if (v === CANCELLED) return { kind: 'cancelled' };
    if (v === NAV_LEFT) return { kind: 'nav', direction: 'left' };
    if (v === NAV_RIGHT) return { kind: 'nav', direction: 'right' };
    return { kind: 'ok', value: v };
  } else {
    const spec = toTextSpec(q, current, answers);
    spec.stepIndex = stepIndex;
    const v = await io.text(spec);
    if (v === CANCELLED) return { kind: 'cancelled' };
    if (v === NAV_LEFT) return { kind: 'nav', direction: 'left' };
    if (v === NAV_RIGHT) return { kind: 'nav', direction: 'right' };
    return { kind: 'ok', value: v };
  }
}

const REVIEW_SUBMIT = 'submit';
const REVIEW_CANCEL = 'cancel';
const EDIT_PREFIX = 'edit:';

export async function runQuestionnaire(io: IoPort, opts: RunOptions): Promise<QuestionnaireResult> {
  const answers: Partial<Record<QuestionId, any>> = {};
  if (opts.prefill.outputDir !== undefined) {
    answers.outputDir = opts.prefill.outputDir;
  }

  if (opts.mode === 'interactive') {
    io.note('\n\u001b[36m\u001b[1mConfiguration Questionnaire\u001b[22m\u001b[39m\n');
  }

  // 1. Seed from prefill, validated through the same validators as interactive input.
  for (const q of QUESTIONS) {
    const raw = opts.prefill[q.id];
    if (raw === undefined) continue;
    const res = validateAnswer(q, raw, answers);
    if (res.ok) {
      answers[q.id] = res.value;
    } else if (opts.mode === 'non-interactive') {
      return { status: 'error', message: `--${FLAG_OF[q.id]}: ${res.error}` };
    }
  }

  // 2. Non-interactive: every required question must be satisfied by a flag; optionals default.
  if (opts.mode === 'non-interactive') {
    for (const q of QUESTIONS) {
      if (answers[q.id] !== undefined) continue;
      if (q.kind === 'text' && q.required) {
        return {
          status: 'error',
          message: `Missing required --${FLAG_OF[q.id]} in --yes (non-interactive) mode.`,
        };
      }
      answers[q.id] = q.kind === 'select' ? q.default : (q.default ?? '');
    }
    if (answers.language && answers.automationTool) {
      if (!isToolSupportedByLanguage(answers.automationTool, answers.language)) {
        return {
          status: 'error',
          message: `--automation-tool: E2E automation tool "${answers.automationTool}" is not supported for language "${answers.language}".`,
        };
      }
    }
    if (answers.outputDir === undefined) {
      answers.outputDir = defaultOutputDirForAutomationTool(
        answers.automationTool,
        answers.language,
      );
    }
    return { status: 'ok', answers: answersToInitAnswers(answers as Record<QuestionId, string>) };
  }

  // 3. Interactive step-by-step wizard (allowing left/right arrow navigation)
  let step = 0;
  const manuallyNavigated = new Set<number>();
  let detectedHints: DetectionResult = {};

  for (;;) {
    if (step === QUESTIONS.length) {
      // Environment check warnings for Review step (passed to io.review so rendered UNDER table)
      const warnings: string[] = [];
      if (answers.language === 'python') {
        const py = await checkPython();
        if (py.warning) {
          warnings.push(
            '[WARN] Note: Python was not found in PATH. Framework will be generated, but running tests requires Python 3.8+.',
          );
        }
      } else if (answers.language === 'csharp') {
        const cs = await checkDotnet();
        if (cs.warning) {
          warnings.push(
            '[WARN] Note: .NET SDK (dotnet) was not found in PATH. Framework will be generated, but running tests requires .NET 8+ SDK.',
          );
        }
      } else if (answers.language === 'java') {
        const javaCheck = await checkJava();
        if (javaCheck.warning) {
          warnings.push(
            '[WARN] Note: Java JDK (java) was not found in PATH. Framework will be generated, but running tests requires JDK 17+.',
          );
        }
        const isGradle = answers.automationTool?.includes('gradle');
        if (isGradle) {
          const gradleCheck = await checkGradle();
          if (gradleCheck.warning) {
            warnings.push(
              '[WARN] Note: Gradle (gradle) was not found in PATH. Running tests requires Gradle installed.',
            );
          }
        } else {
          const mvnCheck = await checkMaven();
          if (mvnCheck.warning) {
            warnings.push(
              '[WARN] Note: Maven (mvn) was not found in PATH. Running tests requires Apache Maven installed.',
            );
          }
        }
      }

      // Review step
      const reviewAnswers: Record<string, string> = {};
      for (const [k, v] of Object.entries(answers)) {
        reviewAnswers[k] = Array.isArray(v) ? v.join(', ') : (v as string);
      }
      const choice = await io.review(reviewAnswers, warnings);
      if (choice === CANCELLED || choice === REVIEW_CANCEL) return { status: 'cancelled' };
      if (choice === NAV_LEFT) {
        step = QUESTIONS.length - 1; // Go back to last question
        manuallyNavigated.add(step);
        continue;
      }
      if (choice === REVIEW_SUBMIT || choice === NAV_RIGHT) {
        if (answers.outputDir === undefined) {
          answers.outputDir = defaultOutputDirForAutomationTool(
            answers.automationTool,
            answers.language,
          );
        }

        const plannedSteps = getPlannedInstallSteps(
          answers.language,
          answers.automationTool,
          answers.outputDir,
        );
        const autoInstall = await io.confirmInstall({
          language: answers.language,
          automationTool: answers.automationTool,
          steps: plannedSteps,
        });

        if (autoInstall === CANCELLED) return { status: 'cancelled' };
        if (autoInstall === NAV_LEFT) {
          // Left arrow on install confirmation step returns to Review step
          continue;
        }

        const finalAnswers = answersToInitAnswers(answers as Record<QuestionId, string>);
        if (autoInstall === false) {
          (finalAnswers as any).skipInstall = true;
        }

        return {
          status: 'ok',
          answers: finalAnswers,
        };
      }

      if (typeof choice !== 'string') continue;
      // If choice starts with edit:, e.g. edit:language
      const id = choice.slice(EDIT_PREFIX.length) as QuestionId;
      const targetStep = QUESTIONS.findIndex((q) => q.id === id);
      if (targetStep !== -1) {
        step = targetStep;
        manuallyNavigated.add(step);
      }
      continue;
    }

    const q = QUESTIONS[step];

    // Skip this step if it is already answered (prefilled) AND the user didn't manually navigate to it!
    if (answers[q.id] !== undefined && !manuallyNavigated.has(step)) {
      step++;
      continue;
    }

    // Skip this step if it is flagged to skip in interactive mode AND the user didn't manually navigate to it.
    if (q.skipInteractive && !manuallyNavigated.has(step)) {
      if (answers[q.id] === undefined) {
        answers[q.id] = q.kind === 'select' ? q.default : (q.default ?? '');
      }
      step++;
      continue;
    }

    const outcome = await ask(
      io,
      q,
      answers,
      step,
      detectedHints,
      answers[q.id], // undefined for unanswered → lets detectedHints kick in before q.default
    );

    if (outcome.kind === 'cancelled') return { status: 'cancelled' };
    if (outcome.kind === 'error') return { status: 'error', message: outcome.message };

    if (outcome.kind === 'nav') {
      if (outcome.direction === 'left') {
        // Glide back past auto-detected hint questions (framework/uiLibrary) — they're never
        // directly editable through step navigation, forward or backward; only detectStack()
        // (re-run when startUrl changes) sets them. Landing on one via a left-press would
        // surface a question the user never asked to answer.
        if (step > 0) {
          let target = step - 1;
          while (target > 0 && QUESTIONS[target].skipInteractive) {
            target--;
          }
          step = target;
          manuallyNavigated.add(step);
        }
      } else if (outcome.direction === 'right') {
        // Can only go right if we have some value (default or existing)
        const currentVal = answers[q.id] ?? resolveDefaultValue(q, answers);
        if (currentVal !== undefined) {
          answers[q.id] = currentVal;
          // Same glide as the left-arrow branch: never manually land on an auto-detected hint
          // question moving forward either. Give each skipped-over question its default, same
          // as the main forward-skip path does.
          let target = step + 1;
          while (target < QUESTIONS.length && QUESTIONS[target].skipInteractive) {
            const skipped = QUESTIONS[target];
            if (answers[skipped.id] === undefined) {
              answers[skipped.id] =
                skipped.kind === 'select' ? skipped.default : (skipped.default ?? '');
            }
            target++;
          }
          step = target;
          manuallyNavigated.add(step);
        }
      }
      continue;
    }

    // Normal answer accepted
    answers[q.id] = outcome.value;

    // After URL answered — kick off stack detection
    if (q.id === 'startUrl' && answers.startUrl) {
      io.note('\u001b[90m  Scanning app stack...\u001b[39m');
      const doDetect = opts.detect ?? detectStack;
      detectedHints = await doDetect(answers.startUrl);
      if (detectedHints.framework) answers.framework = detectedHints.framework;
      if (detectedHints.uiLibrary) answers.uiLibrary = detectedHints.uiLibrary;
      const parts: string[] = [];
      if (detectedHints.framework) parts.push(`\u001b[36m${detectedHints.framework}\u001b[39m`);
      if (detectedHints.uiLibrary) parts.push(`\u001b[36m${detectedHints.uiLibrary}\u001b[39m`);
      if (parts.length > 0) {
        io.note(`\u001b[32m  ✔ Detected:\u001b[39m ${parts.join(' + ')} — applying automatically`);
      } else {
        io.note('\u001b[90m  Could not detect stack — using standard HTML primitives\u001b[39m');
      }
    }

    if (q.id === 'language' && answers.automationTool && answers.language) {
      if (!isToolSupportedByLanguage(answers.automationTool, answers.language)) {
        answers.automationTool = 'playwright';
        io.note('Language changed; resetting E2E automation tool to Playwright.');
      }
    }

    step++;
  }
}
