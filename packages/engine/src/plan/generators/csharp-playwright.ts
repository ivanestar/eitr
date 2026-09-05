import type { StackProfile } from '../../types/stack-profile.js';
import type { FileDescriptor } from '../../types/generation-plan.js';
import type { TargetGenerator, LanguageAdapter, ToolAdapter, PlanOptions } from '../types.js';
import { planSharedScaffold } from '../shared.js';
import { CsharpAdapter } from '../adapters/language/csharp.js';
import { CsharpPlaywrightAdapter } from '../adapters/tool/csharp-playwright.js';

export class CsharpPlaywrightGenerator implements TargetGenerator {
  readonly language = 'csharp';
  readonly automationTool = 'playwright';

  private readonly langAdapter: LanguageAdapter = new CsharpAdapter();
  private readonly toolAdapter: ToolAdapter = new CsharpPlaywrightAdapter();

  plan(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    return [
      ...planSharedScaffold({
        ...opts,
        language: this.language,
        automationTool: this.automationTool,
      }),
      ...this.langAdapter.planFiles(profile, opts),
      ...this.toolAdapter.planFiles(profile, opts),
    ];
  }
}
