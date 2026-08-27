import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { LanguageAdapter, PlanOptions } from '../../types.js';
import {
  renderPythonComponentsInit,
  renderPythonBaseInit,
  renderPythonScope,
  renderPythonComponent,
  renderPythonContainer,
  renderPythonCollection,
  renderPythonBasePage,
  renderPythonPrimitivesInit,
  renderPythonButton,
  renderPythonTextInput,
  renderPythonCheckbox,
  renderPythonSelect,
  renderPythonNativeSelect,
  renderPythonLink,
  renderPythonFileInput,
  renderPythonRadio,
  renderPythonWidgetsInit,
  renderPythonDialog,
  renderPythonTable,
} from '../../templates/python/components.js';
import {
  renderPythonReactHelpers,
  renderPythonVueHelpers,
  renderPythonSvelteHelpers,
  renderPythonAngularHelpers,
} from '../../templates/python/project.js';

export class PythonAdapter implements LanguageAdapter {
  readonly id = 'python';

  planFiles(profile: StackProfile, _opts: PlanOptions): FileDescriptor[] {
    const regen = (path: string, text: string): FileDescriptor => ({
      path,
      writePolicy: 'regenerate',
      provenance: { origin: 'base' },
      source: { kind: 'inline', text },
    });
    const prim = (path: string, text: string): FileDescriptor => ({
      path,
      writePolicy: 'regenerate',
      provenance: { origin: 'primitive' },
      source: { kind: 'inline', text },
    });

    const files = [
      // ── Base layer ──────────────────────────────────────────────────────
      regen('components/__init__.py', renderPythonComponentsInit()),
      regen('components/base/__init__.py', renderPythonBaseInit()),
      regen('components/base/scope.py', renderPythonScope()),
      regen('components/base/component.py', renderPythonComponent()),
      regen('components/base/container.py', renderPythonContainer()),
      regen('components/base/collection.py', renderPythonCollection()),
      regen('components/base/base_page.py', renderPythonBasePage()),
      // ── Primitives ──────────────────────────────────────────────────────
      prim('components/primitives/__init__.py', renderPythonPrimitivesInit()),
      prim('components/primitives/button.py', renderPythonButton()),
      prim('components/primitives/text_input.py', renderPythonTextInput()),
      prim('components/primitives/checkbox.py', renderPythonCheckbox()),
      prim('components/primitives/select.py', renderPythonSelect()),
      prim('components/primitives/native_select.py', renderPythonNativeSelect()),
      prim('components/primitives/link.py', renderPythonLink()),
      prim('components/primitives/file_input.py', renderPythonFileInput()),
      prim('components/primitives/radio.py', renderPythonRadio()),
      // ── Widgets ─────────────────────────────────────────────────────────
      regen('components/widgets/__init__.py', renderPythonWidgetsInit()),
      regen('components/widgets/dialog.py', renderPythonDialog()),
      regen('components/widgets/table.py', renderPythonTable()),
    ];

    if (profile.framework.value === 'react') {
      files.push({
        path: 'shared/utils/react.py',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderPythonReactHelpers() },
      });
    } else if (profile.framework.value === 'vue') {
      files.push({
        path: 'shared/utils/vue.py',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderPythonVueHelpers() },
      });
    } else if (profile.framework.value === 'svelte') {
      files.push({
        path: 'shared/utils/svelte.py',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderPythonSvelteHelpers() },
      });
    } else if (profile.framework.value === 'angular') {
      files.push({
        path: 'shared/utils/angular.py',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderPythonAngularHelpers() },
      });
    }

    return files;
  }
}
