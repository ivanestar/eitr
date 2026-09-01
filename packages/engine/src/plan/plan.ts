import { ENGINE_VERSION } from '../version.js';
import type { StackProfile } from '../types/stack-profile.js';
import type { GenerationPlan } from '../types/generation-plan.js';
import type { PlanOptions, SupportedLanguage } from './types.js';
import { UnsupportedLanguageError } from './types.js';
import { TARGET_GENERATORS } from './registry.js';

export type {
  PlanOptions,
  TargetGenerator,
  LanguageAdapter,
  ToolAdapter,
  SupportedLanguage,
} from './types.js';
export { DEFAULT_BASE_URL, DEFAULT_PROJECT_NAME } from './types.js';
export { TARGET_GENERATORS } from './registry.js';

const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'typescript',
  'python',
  'csharp',
  'java',
];

/**
 * PURE: no fs, no network, no LLM (D1). engineVersion = ENGINE_VERSION (statically imported).
 * Resolves the generator matching the specified language & tool, then delegates planning to it.
 */
export function plan(profile: StackProfile, opts: PlanOptions = {}): GenerationPlan {
  const language = opts.language ?? 'typescript';
  const automationTool = opts.automationTool ?? 'playwright';

  if (!SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
    throw new UnsupportedLanguageError(language);
  }

  const generator = TARGET_GENERATORS.find(
    (g) => g.language === language && g.automationTool === automationTool,
  );

  if (!generator) {
    throw new Error(
      `No generator registered for language "${language}" and automation tool "${automationTool}".`,
    );
  }

  const files = generator.plan(profile, opts);
  return { engineVersion: ENGINE_VERSION, profile, files };
}
