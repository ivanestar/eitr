import type { StackProfile } from '../../types/stack-profile.js';
import type { FileDescriptor } from '../../types/generation-plan.js';
import type { TargetGenerator, LanguageAdapter, ToolAdapter, PlanOptions } from '../types.js';
import { planSharedScaffold } from '../shared.js';
import { JavaAdapter } from '../adapters/language/java.js';
import { MavenAdapter } from '../adapters/tool/maven.js';

export class JavaPlaywrightMavenGenerator implements TargetGenerator {
  readonly language = 'java';
  readonly automationTool: string;

  constructor(tool: string = 'playwright') {
    this.automationTool = tool;
  }

  private readonly langAdapter: LanguageAdapter = new JavaAdapter();
  private readonly toolAdapter: ToolAdapter = new MavenAdapter();

  plan(profile: StackProfile, opts: PlanOptions): FileDescriptor[] {
    return [
      ...planSharedScaffold({ ...opts, language: 'java', automationTool: this.automationTool }),
      ...this.langAdapter.planFiles(profile, opts),
      ...this.toolAdapter.planFiles(profile, opts),
    ];
  }
}
