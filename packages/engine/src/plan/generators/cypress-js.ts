import type { StackProfile } from '../../types/stack-profile.js';
import type { FileDescriptor } from '../../types/generation-plan.js';
import type { TargetGenerator, LanguageAdapter, ToolAdapter, PlanOptions } from '../types.js';
import { planSharedScaffold } from '../shared.js';
import { JavaScriptAdapter } from '../adapters/language/javascript.js';
import { CypressAdapter } from '../adapters/tool/cypress.js';

export class CypressJsGenerator implements TargetGenerator {
  readonly language = 'javascript';
  readonly automationTool = 'cypress';

  private readonly langAdapter: LanguageAdapter = new JavaScriptAdapter();
  private readonly toolAdapter: ToolAdapter = new CypressAdapter(false);

  plan(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    return [
      ...planSharedScaffold(opts),
      ...this.langAdapter.planFiles(profile, opts),
      ...this.toolAdapter.planFiles(profile, opts),
    ];
  }
}
