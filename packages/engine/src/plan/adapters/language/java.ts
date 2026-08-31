import type { StackProfile } from '../../../types/stack-profile.js';
import type { FileDescriptor } from '../../../types/generation-plan.js';
import type { LanguageAdapter, PlanOptions } from '../../types.js';
import {
  renderJavaScope,
  renderJavaComponent,
  renderJavaContainer,
  renderJavaCollection,
  renderJavaBasePage,
  renderJavaButton,
  renderJavaTextInput,
  renderJavaCheckbox,
  renderJavaNativeSelect,
  renderJavaSelect,
  renderJavaElement,
  renderJavaHeading,
  renderJavaFrameContainer,
  renderJavaLink,
  renderJavaFileInput,
  renderJavaRadioButton,
  renderJavaRadioGroup,
  renderJavaDialog,
  renderJavaTable,
  renderJavaReactHelpers,
  renderJavaVueHelpers,
  renderJavaSvelteHelpers,
  renderJavaAngularHelpers,
} from '../../templates/java/project.js';

export class JavaAdapter implements LanguageAdapter {
  readonly id = 'java';

  planFiles(profile: StackProfile, _opts: PlanOptions): FileDescriptor[] {
    const files: FileDescriptor[] = [
      {
        path: 'src/main/java/components/Scope.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderJavaScope() },
      },
      {
        path: 'src/main/java/components/Component.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderJavaComponent() },
      },
      {
        path: 'src/main/java/components/Container.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderJavaContainer() },
      },
      {
        path: 'src/main/java/components/Collection.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderJavaCollection() },
      },
      {
        path: 'src/main/java/components/BasePage.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderJavaBasePage() },
      },
      {
        path: 'src/main/java/components/FrameContainer.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'base' },
        source: { kind: 'inline', text: renderJavaFrameContainer() },
      },
      {
        path: 'src/main/java/components/primitives/Button.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaButton() },
      },
      {
        path: 'src/main/java/components/primitives/TextInput.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaTextInput() },
      },
      {
        path: 'src/main/java/components/primitives/Checkbox.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaCheckbox() },
      },
      {
        path: 'src/main/java/components/primitives/NativeSelect.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaNativeSelect() },
      },
      {
        path: 'src/main/java/components/primitives/Select.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaSelect() },
      },
      {
        path: 'src/main/java/components/primitives/Element.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaElement() },
      },
      {
        path: 'src/main/java/components/primitives/Heading.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaHeading() },
      },
      {
        path: 'src/main/java/components/primitives/Link.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaLink() },
      },
      {
        path: 'src/main/java/components/primitives/FileInput.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaFileInput() },
      },
      {
        path: 'src/main/java/components/primitives/RadioButton.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaRadioButton() },
      },
      {
        path: 'src/main/java/components/primitives/RadioGroup.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaRadioGroup() },
      },
      {
        path: 'src/main/java/components/widgets/Dialog.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaDialog() },
      },
      {
        path: 'src/main/java/components/widgets/Table.java',
        writePolicy: 'regenerate',
        provenance: { origin: 'primitive' },
        source: { kind: 'inline', text: renderJavaTable() },
      },
    ];

    if (profile.framework.value === 'react') {
      files.push({
        path: 'src/main/java/shared/utils/ReactHelpers.java',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJavaReactHelpers() },
      });
    } else if (profile.framework.value === 'vue') {
      files.push({
        path: 'src/main/java/shared/utils/VueHelpers.java',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJavaVueHelpers() },
      });
    } else if (profile.framework.value === 'svelte') {
      files.push({
        path: 'src/main/java/shared/utils/SvelteHelpers.java',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJavaSvelteHelpers() },
      });
    } else if (profile.framework.value === 'angular') {
      files.push({
        path: 'src/main/java/shared/utils/AngularHelpers.java',
        writePolicy: 'create-if-absent',
        provenance: { origin: 'seed' },
        source: { kind: 'inline', text: renderJavaAngularHelpers() },
      });
    }

    return files;
  }
}
