import type { StackProfile } from '../../types/stack-profile.js';
import type { FileDescriptor } from '../../types/generation-plan.js';
import type { TargetGenerator, LanguageAdapter, ToolAdapter, PlanOptions } from '../types.js';
import { planSharedScaffold } from '../shared.js';
import { TypeScriptAdapter } from '../adapters/language/typescript.js';
import { PlaywrightAdapter } from '../adapters/tool/playwright.js';

export class PlaywrightTsGenerator implements TargetGenerator {
  readonly language = 'typescript';
  readonly automationTool = 'playwright';

  private readonly langAdapter: LanguageAdapter = new TypeScriptAdapter();
  private readonly toolAdapter: ToolAdapter = new PlaywrightAdapter();

  plan(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    return [
      ...planSharedScaffold(opts),
      ...this.langAdapter.planFiles(profile, opts),
      ...this.toolAdapter.planFiles(profile, opts),
    ];
  }
}
