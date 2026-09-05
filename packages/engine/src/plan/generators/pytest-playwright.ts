import type { StackProfile } from '../../types/stack-profile.js';
import type { FileDescriptor } from '../../types/generation-plan.js';
import type { TargetGenerator, LanguageAdapter, ToolAdapter, PlanOptions } from '../types.js';
import { planSharedScaffold } from '../shared.js';
import { PythonAdapter } from '../adapters/language/python.js';
import { PytestAdapter } from '../adapters/tool/pytest.js';

export class PytestPlaywrightGenerator implements TargetGenerator {
  readonly language = 'python';
  readonly automationTool: string;

  constructor(automationTool = 'playwright') {
    this.automationTool = automationTool;
  }

  private readonly langAdapter: LanguageAdapter = new PythonAdapter();
  private readonly toolAdapter: ToolAdapter = new PytestAdapter();

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
