import type { StackProfile } from '../../types/stack-profile.js';
import type { FileDescriptor } from '../../types/generation-plan.js';
import type { TargetGenerator, LanguageAdapter, ToolAdapter, PlanOptions } from '../types.js';
import { planSharedScaffold } from '../shared.js';
import { TypeScriptAdapter } from '../adapters/language/typescript.js';
import { CypressAdapter } from '../adapters/tool/cypress.js';

export class CypressTsGenerator implements TargetGenerator {
  readonly language = 'typescript';
  readonly automationTool = 'cypress';

  private readonly langAdapter: LanguageAdapter = new TypeScriptAdapter();
  private readonly toolAdapter: ToolAdapter = new CypressAdapter();

  plan(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    return [
      ...planSharedScaffold(opts),
      ...this.langAdapter.planFiles(profile, opts),
      ...this.toolAdapter.planFiles(profile, opts),
    ];
  }
}
