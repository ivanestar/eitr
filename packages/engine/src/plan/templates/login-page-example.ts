// Template for the pedagogical login-page.example.ts. create-if-absent.

export function renderLoginPageExample(): string {
  return `import { BasePage } from '../base/base-page';
import { TextInput } from '../primitives/text-input';
import { Button } from '../primitives/button';

/**
 * [EXAMPLE] Reference Page Object built using the Component Page Object Model (CPOM) pattern.
 *
 * This file serves as an educational blueprint. You can delete or adapt it as needed.
 *
 * Key Design Principles Demonstrated:
 * 1. Inheritance: Extends BasePage to inherit core navigation, waiting, and page contexts.
 * 2. 3-Tier Locator Priority: Prioritizes getByTestId -> getByRole -> getByLabel over raw CSS selectors.
 * 3. Component Composition: Exposes reusable DOM sub-trees using primitives (TextInput, Button)
 *    defined on the class via 'this.child(ComponentClass, selector)'.
 * 4. High-level Actions: Exposes business-oriented methods (e.g. login) wrapping low-level interactions.
 */
export class LoginPage extends BasePage {
  readonly path = '/login';

  // 1. Declare component locators adhering to 3-Tier Locator Priority
  readonly usernameInput = this.child(TextInput, { kind: 'testId', testId: 'username-input' });
  readonly passwordInput = this.child(TextInput, { kind: 'testId', testId: 'password-input' });
  readonly loginButton = this.child(Button, { kind: 'role', role: 'button', name: 'Submit' });

  // 2. Expose high-level business flows
  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
`;
}
