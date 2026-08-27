import type { StackProfile } from '../../types/stack-profile.js';
import type { FileDescriptor } from '../../types/generation-plan.js';
import type { TargetGenerator, LanguageAdapter, ToolAdapter, PlanOptions } from '../types.js';
import { planSharedScaffold } from '../shared.js';
import { JavaAdapter } from '../adapters/language/java.js';
import { GradleAdapter } from '../adapters/tool/gradle.js';

export class JavaPlaywrightGradleGenerator implements TargetGenerator {
  readonly language = 'java';
  readonly automationTool = 'playwright-gradle';

  private readonly langAdapter: LanguageAdapter = new JavaAdapter();
  private readonly toolAdapter: ToolAdapter = new GradleAdapter();

  plan(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    return [
      ...planSharedScaffold({ ...opts, language: 'java', automationTool: 'playwright-gradle' }),
      ...this.langAdapter.planFiles(profile, opts),
      ...this.toolAdapter.planFiles(profile, opts),
    ];
  }
}
