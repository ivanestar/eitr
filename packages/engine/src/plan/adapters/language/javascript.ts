import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { LanguageAdapter, PlanOptions } from '../../types.js';
import { BASE_ASSET_FILES } from '../../assets.js';
import { renderPrettierrc } from '../../templates/prettierrc.js';
import {
  renderJsReactHelpers,
  renderJsVueHelpers,
  renderJsSvelteHelpers,
  renderJsAngularHelpers,
} from '../../templates/javascript/project.js';

export class JavaScriptAdapter implements LanguageAdapter {
  readonly id = 'javascript';

  planFiles(profile: StackProfile, _opts: PlanOptions): FileDescriptor[] {
    const files: FileDescriptor[] = [];

    if (_opts.automationTool !== 'cypress') {
      files.push(
        // ── Compiled JS runtime assets (base classes, primitives, widgets) ────
        ...Object.entries(BASE_ASSET_FILES).map(([assetId, relPath]): FileDescriptor => {
          const jsAssetId = assetId.replace(/\.ts$/, '.js');
          const jsRelPath = relPath.replace(/\.ts$/, '.js');
          return {
            path: jsRelPath,
            writePolicy: 'regenerate',
            provenance: {
              origin: jsAssetId.startsWith('components/primitives/') ? 'primitive' : 'base',
            },
            source: { kind: 'asset', assetId: jsAssetId },
          };
        }),
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
        path: 'shared/utils/react.js',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJsReactHelpers() },
      });
    } else if (profile.framework.value === 'vue') {
      files.push({
        path: 'shared/utils/vue.js',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJsVueHelpers() },
      });
    } else if (profile.framework.value === 'svelte') {
      files.push({
        path: 'shared/utils/svelte.js',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJsSvelteHelpers() },
      });
    } else if (profile.framework.value === 'angular') {
      files.push({
        path: 'shared/utils/angular.js',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJsAngularHelpers() },
      });
    }

    return files;
  }
}
