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
  renderPythonFrameContainer,
  renderPythonPrimitivesInit,
  renderPythonButton,
  renderPythonTextInput,
  renderPythonCheckbox,
  renderPythonSelect,
  renderPythonNativeSelect,
  renderPythonElement,
  renderPythonHeading,
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
    const base = (path: string, text: string): FileDescriptor => ({
      path,
      writePolicy: 'create-if-absent',
      provenance: { origin: 'base' },
      source: { kind: 'inline', text },
    });
    const prim = (path: string, text: string): FileDescriptor => ({
      path,
      writePolicy: 'create-if-absent',
      provenance: { origin: 'primitive' },
      source: { kind: 'inline', text },
    });

    const files = [
      // ── Base layer ──────────────────────────────────────────────────────
      base('components/__init__.py', renderPythonComponentsInit()),
      base('components/base/__init__.py', renderPythonBaseInit()),
      base('components/base/scope.py', renderPythonScope()),
      base('components/base/component.py', renderPythonComponent()),
      base('components/base/container.py', renderPythonContainer()),
      base('components/base/collection.py', renderPythonCollection()),
      base('components/base/base_page.py', renderPythonBasePage()),
      base('components/base/frame_container.py', renderPythonFrameContainer()),
      // ── Primitives ──────────────────────────────────────────────────────
      prim('components/primitives/__init__.py', renderPythonPrimitivesInit()),
      prim('components/primitives/button.py', renderPythonButton()),
      prim('components/primitives/text_input.py', renderPythonTextInput()),
      prim('components/primitives/checkbox.py', renderPythonCheckbox()),
      prim('components/primitives/select.py', renderPythonSelect()),
      prim('components/primitives/native_select.py', renderPythonNativeSelect()),
      prim('components/primitives/element.py', renderPythonElement()),
      prim('components/primitives/heading.py', renderPythonHeading()),
      prim('components/primitives/link.py', renderPythonLink()),
      prim('components/primitives/file_input.py', renderPythonFileInput()),
      prim('components/primitives/radio.py', renderPythonRadio()),
      // ── Widgets ─────────────────────────────────────────────────────────
      base('components/widgets/__init__.py', renderPythonWidgetsInit()),
      base('components/widgets/dialog.py', renderPythonDialog()),
      base('components/widgets/table.py', renderPythonTable()),
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
