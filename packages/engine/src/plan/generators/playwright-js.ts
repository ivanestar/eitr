import type { StackProfile } from '../../types/stack-profile.js';
import type { FileDescriptor } from '../../types/generation-plan.js';
import type { TargetGenerator, LanguageAdapter, ToolAdapter, PlanOptions } from '../types.js';
import { planSharedScaffold } from '../shared.js';
import { JavaScriptAdapter } from '../adapters/language/javascript.js';
import { PlaywrightJsAdapter } from '../adapters/tool/playwright-js.js';

export class PlaywrightJsGenerator implements TargetGenerator {
  readonly language = 'javascript';
  readonly automationTool = 'playwright';

  private readonly langAdapter: LanguageAdapter = new JavaScriptAdapter();
  private readonly toolAdapter: ToolAdapter = new PlaywrightJsAdapter();

  plan(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    return [
      ...planSharedScaffold(opts),
      ...this.langAdapter.planFiles(profile, opts),
      ...this.toolAdapter.planFiles(profile, opts),
    ];
  }
}
