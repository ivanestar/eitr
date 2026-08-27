import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { LanguageAdapter, PlanOptions } from '../../types.js';
import { BASE_ASSET_FILES } from '../../assets.js';
import { renderTsconfig } from '../../templates/tsconfig.js';
import { renderPrettierrc } from '../../templates/prettierrc.js';
import { renderReactHelpers } from '../../templates/react-helpers.js';
import { renderVueHelpers } from '../../templates/vue-helpers.js';
import { renderSvelteHelpers } from '../../templates/svelte-helpers.js';
import { renderAngularHelpers } from '../../templates/angular-helpers.js';

export class TypeScriptAdapter implements LanguageAdapter {
  readonly id = 'typescript';

  planFiles(profile: StackProfile, _opts: PlanOptions): FileDescriptor[] {
    const files: FileDescriptor[] = [];

    if (_opts.automationTool !== 'cypress') {
      files.push(
        // ── Compiled TS runtime assets (base classes, primitives, widgets) ────
        ...Object.entries(BASE_ASSET_FILES).map(([assetId, relPath]): FileDescriptor => ({
          path: relPath,
          writePolicy: 'regenerate',
          provenance: {
            origin: assetId.startsWith('components/primitives/') ? 'primitive' : 'base',
          },
          source: { kind: 'asset', assetId },
        })),
        // ── TypeScript config ────────────────────────────────────────────────
        {
          path: 'tsconfig.json',
          writePolicy: 'create-if-absent',
          provenance: { origin: 'project' },
          source: { kind: 'inline', text: renderTsconfig() },
        },
      );
    }

    files.push({
      path: '.prettierrc.json',
      writePolicy: 'create-if-absent',
      provenance: { origin: 'project' },
      source: { kind: 'inline', text: renderPrettierrc() },
    });

    // ── Optional frontend-framework helpers ──────────────────────────────
    if (profile.framework.value === 'react') {
      files.push({
        path: 'shared/utils/react.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderReactHelpers() },
      });
    } else if (profile.framework.value === 'vue') {
      files.push({
        path: 'shared/utils/vue.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderVueHelpers() },
      });
    } else if (profile.framework.value === 'svelte') {
      files.push({
        path: 'shared/utils/svelte.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderSvelteHelpers() },
      });
    } else if (profile.framework.value === 'angular') {
      files.push({
        path: 'shared/utils/angular.ts',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderAngularHelpers() },
      });
    }

    return files;
  }
}
