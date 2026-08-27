import type { InitAnswers, QuestionId } from './schema.js';
import { HINT_UNKNOWN } from './schema.js';

// Pure: turns a complete, already-validated answer map into the persisted InitAnswers.
// A stack hint equal to HINT_UNKNOWN means "no hint" and is omitted entirely. No hidden state,
// so repeated/edited inputs always yield the same output.
export function answersToInitAnswers(answers: Record<QuestionId, any>): InitAnswers {
  const hints: {
    framework?: string;
    uiLibrary?: string;
    language?: string;
    automationTool?: string;
  } = {};

  if (answers.language) hints.language = answers.language;
  if (answers.automationTool) hints.automationTool = answers.automationTool;
  if (answers.framework && answers.framework !== HINT_UNKNOWN) hints.framework = answers.framework;
  if (answers.uiLibrary && answers.uiLibrary !== HINT_UNKNOWN) hints.uiLibrary = answers.uiLibrary;

  const base: InitAnswers = {
    schemaVersion: 1,
    startUrl: answers.startUrl,
    outputDir: answers.outputDir,
    ...(answers.ciCd && answers.ciCd !== 'none' ? { ciCd: answers.ciCd } : {}),
    ...(answers.aiAssistants !== undefined ? { aiAssistants: answers.aiAssistants } : {}),
    ...(answers.tmsProvider && answers.tmsProvider !== 'none'
      ? { tmsProvider: answers.tmsProvider }
      : {}),
  };

  return Object.keys(hints).length > 0 ? { ...base, stackHints: hints } : base;
}
