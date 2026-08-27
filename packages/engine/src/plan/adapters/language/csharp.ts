import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { LanguageAdapter, PlanOptions } from '../../types.js';
import {
  renderCsharpScope,
  renderCsharpComponent,
  renderCsharpCollection,
  renderCsharpContainer,
  renderCsharpBasePage,
  renderCsharpButton,
  renderCsharpTextInput,
  renderCsharpCheckbox,
  renderCsharpNativeSelect,
  renderCsharpLink,
  renderCsharpFileInput,
  renderCsharpRadio,
  renderCsharpDialog,
  renderCsharpTable,
  renderCsharpReactHelpers,
  renderCsharpVueHelpers,
  renderCsharpSvelteHelpers,
  renderCsharpAngularHelpers,
} from '../../templates/csharp/project.js';

export class CsharpAdapter implements LanguageAdapter {
  readonly id = 'csharp';

  planFiles(profile: StackProfile, _opts: PlanOptions): FileDescriptor[] {
    const files: FileDescriptor[] = [
      {
        path: 'components/Scope.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderCsharpScope() },
      },
      {
        path: 'components/Component.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderCsharpComponent() },
      },
      {
        path: 'components/Collection.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderCsharpCollection() },
      },
      {
        path: 'components/Container.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderCsharpContainer() },
      },
      {
        path: 'components/BasePage.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderCsharpBasePage() },
      },
      {
        path: 'components/primitives/Button.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCsharpButton() },
      },
      {
        path: 'components/primitives/TextInput.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCsharpTextInput() },
      },
      {
        path: 'components/primitives/Checkbox.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCsharpCheckbox() },
      },
      {
        path: 'components/primitives/NativeSelect.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCsharpNativeSelect() },
      },
      {
        path: 'components/primitives/Link.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCsharpLink() },
      },
      {
        path: 'components/primitives/FileInput.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCsharpFileInput() },
      },
      {
        path: 'components/primitives/Radio.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCsharpRadio() },
      },
      {
        path: 'components/widgets/Dialog.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCsharpDialog() },
      },
      {
        path: 'components/widgets/Table.cs',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderCsharpTable() },
      },
    ];

    if (profile.framework.value === 'react') {
      files.push({
        path: 'shared/utils/ReactHelpers.cs',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderCsharpReactHelpers() },
      });
    } else if (profile.framework.value === 'vue') {
      files.push({
        path: 'shared/utils/VueHelpers.cs',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderCsharpVueHelpers() },
      });
    } else if (profile.framework.value === 'svelte') {
      files.push({
        path: 'shared/utils/SvelteHelpers.cs',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderCsharpSvelteHelpers() },
      });
    } else if (profile.framework.value === 'angular') {
      files.push({
        path: 'shared/utils/AngularHelpers.cs',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderCsharpAngularHelpers() },
      });
    }

    return files;
  }
}
