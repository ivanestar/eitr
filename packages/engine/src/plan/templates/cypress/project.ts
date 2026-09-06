/**
 * Cypress template render functions for the TypeScript target generator.
 */
import type { StackProfile } from '../../../types/stack-profile.js';

export interface CypressProjectOpts {
  baseUrl: string;
  projectName: string;
}

/** cypress.config.ts — generated once (create-if-absent) and never touched again by the engine. */
export function renderCypressConfig(baseUrl: string, profile: StackProfile): string {
  const framework = profile.framework.value;
  let serverCmd = 'npm run start';
  let serverPort = 3000;
  if (framework === 'react' || framework === 'vue' || framework === 'svelte') {
    serverCmd = 'npm run dev';
    serverPort = 5173;
  } else if (framework === 'angular') {
    serverCmd = 'npm run start';
    serverPort = 4200;
  }

  return `import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: false as const,
    baseUrl: process.env.E2E_BASE_URL ?? '${baseUrl.replace(/'/g, "\\'")}',
  },
  retries: {
    runMode: 2,
    openMode: 0,
  },
  // webServer: {
  //   command: '${serverCmd}',
  //   url: 'http://localhost:${serverPort}',
  // },
});
`;
}

/** package.json for Cypress */
export function renderCypressPackageJson(projectName: string): string {
  return `{
  "name": "${projectName}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "cypress run",
    "test:open": "cypress open",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "cypress": "^13.13.0",
    "typescript": "^5.4.0"
  }
}
`;
}

/** tsconfig.json for Cypress TypeScript projects */
export function renderCypressTsConfig(): string {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["cypress", "node"],
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["cypress/**/*.ts", "components/**/*.ts", "shared/**/*.ts", "cypress.config.ts"]
}
`;
}

/** components/base/component.ts for Cypress */
export function renderCypressComponentBase(): string {
  return `export class Component {
  constructor(
    public readonly selector: string,
    public readonly parent?: Component
  ) {}

  locator(): Cypress.Chainable<JQuery<HTMLElement>> {
    if (this.parent) {
      return this.parent.locator().find(this.selector);
    }
    return cy.get(this.selector);
  }

  click(): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().click();
  }

  isVisibleNow(): Cypress.Chainable<boolean> {
    return this.locator().then<boolean>(($el) => $el.is(':visible'));
  }

  isEnabledNow(): Cypress.Chainable<boolean> {
    return this.locator().then<boolean>(($el) => $el.is(':enabled'));
  }
}
`;
}

/** components/base/base-page.ts for Cypress */
export function renderCypressBasePage(): string {
  return `import { Component } from './component';

export abstract class BasePage {
  abstract readonly path: string;

  navigate(): void {
    cy.visit(this.path);
  }

  protected _child<T extends Component>(
    ComponentClass: new (selector: string, parent?: Component) => T,
    selector: string
  ): T {
    return new ComponentClass(selector);
  }
}
`;
}

/** components/primitives/button.ts */
export function renderCypressButton(): string {
  return `import { Component } from '../base/component';

export class Button extends Component {
  textNow(): Cypress.Chainable<string> {
    return this.locator().invoke('text');
  }

  getText(): Cypress.Chainable<string> {
    return this.textNow();
  }
}
`;
}

/** components/primitives/text-input.ts */
export function renderCypressTextInput(): string {
  return `import { Component } from '../base/component';

export class TextInput extends Component {
  fill(value: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().clear().type(value);
  }

  clear(): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().clear();
  }

  valueNow(): Cypress.Chainable<string> {
    return this.locator().invoke('val') as Cypress.Chainable<string>;
  }
}
`;
}

/** components/primitives/checkbox.ts */
export function renderCypressCheckbox(): string {
  return `import { Component } from '../base/component';

export class Checkbox extends Component {
  check(): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().check();
  }

  uncheck(): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().uncheck();
  }

  isCheckedNow(): Cypress.Chainable<boolean> {
    return this.locator().invoke('is', ':checked') as Cypress.Chainable<boolean>;
  }
}
`;
}

/** components/primitives/native-select.ts */
export function renderCypressNativeSelect(): string {
  return `import { Component } from '../base/component';

export class NativeSelect extends Component {
  selectOption(value: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().select(value);
  }

  valueNow(): Cypress.Chainable<string> {
    return this.locator().invoke('val');
  }

  getSelectedValue(): Cypress.Chainable<string> {
    return this.valueNow();
  }
}
`;
}

/** components/primitives/select.ts */
export function renderCypressSelect(): string {
  return `import { Component } from '../base/component';

/**
 * A custom select / combobox whose options render in an overlay (portal) at the
 * page root rather than inside the trigger's DOM subtree — so the listbox is
 * resolved from the document root, not from the trigger.
 *
 * For a native <select> element, use NativeSelect instead.
 */
export class Select extends Component {
  constructor(
    selector: string,
    private readonly listboxSelector: string,
    private readonly optionSelector: string,
    private readonly reveal: 'none' | 'click' | 'hover' = 'click',
    parent?: Component
  ) {
    super(selector, parent);
  }

  open(): Cypress.Chainable<JQuery<HTMLElement>> {
    if (this.reveal === 'none') {
      return this.locator();
    }
    if (this.reveal === 'hover') {
      return this.locator().trigger('mouseover');
    }
    return this.locator().click();
  }

  listbox(): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.get(this.listboxSelector).last();
  }

  options(): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.listbox().find(this.optionSelector);
  }

  choose(name: string): Cypress.Chainable<JQuery<HTMLElement>> {
    this.open();
    return this.options().contains(name).click();
  }
}
`;
}

/** components/primitives/element.ts */
export function renderCypressElement(): string {
  return `import { Component } from '../base/component';

/**
 * A generic UI element (e.g. heading, block, container, image, or paragraph).
 */
export class Element extends Component {}
`;
}

/** components/primitives/heading.ts */
export function renderCypressHeading(): string {
  return `import { Component } from '../base/component';

/**
 * A semantic heading element (\`<h1>\`-\`<h6>\` or role="heading").
 */
export class Heading extends Component {}
`;
}

/** components/primitives/link.ts */
export function renderCypressLink(): string {
  return `import { Component } from '../base/component';

export class Link extends Component {
  hrefNow(): Cypress.Chainable<string> {
    return this.locator().invoke('attr', 'href');
  }

  getHref(): Cypress.Chainable<string> {
    return this.hrefNow();
  }
}
`;
}

/** components/primitives/file-input.ts */
export function renderCypressFileInput(): string {
  return `import { Component } from '../base/component';

export class FileInput extends Component {
  selectFile(filePath: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().selectFile(filePath);
  }
}
`;
}

/** components/primitives/index.ts */
export function renderCypressPrimitivesIndex(): string {
  return `export * from './button';
export * from './text-input';
export * from './checkbox';
export * from './radio';
export * from './native-select';
export * from './select';
export * from './element';
export * from './heading';
export * from './link';
export * from './file-input';
`;
}

export function renderCypressRadio(): string {
  return `import { Component } from '../base/component';

export class RadioButton extends Component {
  check(): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().check();
  }
}

export class RadioGroup extends Component {
  radio(name: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().find(\`input[type="radio"][value="\${name}"]\`);
  }

  select(name: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.radio(name).check();
  }
}
`;
}

/** components/widgets/dialog.ts */
export function renderCypressDialog(): string {
  return `import { Component } from '../base/component';

export class Dialog extends Component {
  title(): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().find('h1, h2, h3, [role="heading"]');
  }

  close(): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().find('button[aria-label="Close"], button:contains("Close"), .close').click();
  }
}
`;
}

/** components/widgets/table.ts */
export function renderCypressTable(): string {
  return `import { Component } from '../base/component';

export class Table extends Component {
  rows(): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().find('tbody tr');
  }

  cell(rowIdx: number, colIdx: number): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.rows().eq(rowIdx).find('td').eq(colIdx);
  }

  rowByColumn(colIdx: number, text: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.rows().filter((_idx, el) => Cypress.$(el).find('td').eq(colIdx).text().includes(text)).first();
  }

  rowCountNow(): Cypress.Chainable<number> {
    return this.rows().its('length');
  }

  rowCount(): Cypress.Chainable<number> {
    return this.rowCountNow();
  }
}
`;
}

/** components/widgets/index.ts */
export function renderCypressWidgetsIndex(): string {
  return `export * from './dialog';
export * from './table';
`;
}

/** shared/utils/api-client.ts */
export function renderCypressApiClient(): string {
  return `export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  body?: any;
  headers?: Record<string, string>;
}

export class ApiClient {
  // Falls back to a CYPRESS_E2E_API_TOKEN / CYPRESS_AUTH_TOKEN environment variable (surfaced via
  // Cypress.env(...)) when not set explicitly - set either to have it picked up automatically.
  private authToken: string | undefined = Cypress.env('E2E_API_TOKEN') ?? Cypress.env('AUTH_TOKEN');

  /**
   * Set (or clear, passing undefined) the bearer token injected into every subsequent request's
   * Authorization header. Call this after an API-based login step returns an access_token, so the
   * rest of that test's API calls (create/modify/delete/read preconditions) authenticate the same
   * way the real application does. cy.request already shares this browser session's cookies
   * automatically, so no separate cookie wiring is needed for cookie-based auth.
   */
  setAuthToken(token: string | undefined): void {
    this.authToken = token;
  }

  request<T = unknown>(options: ApiRequestOptions): Cypress.Chainable<Cypress.Response<T>> {
    return cy.request<T>({
      method: options.method ?? 'GET',
      url: options.url,
      body: options.body,
      headers: {
        ...(this.authToken ? { Authorization: \`Bearer \${this.authToken}\` } : {}),
        ...options.headers,
      },
    });
  }

  get<T = unknown>(url: string, headers?: Record<string, string>): Cypress.Chainable<Cypress.Response<T>> {
    return this.request<T>({ method: 'GET', url, headers });
  }

  post<T = unknown>(url: string, body?: any, headers?: Record<string, string>): Cypress.Chainable<Cypress.Response<T>> {
    return this.request<T>({ method: 'POST', url, body, headers });
  }

  put<T = unknown>(url: string, body?: any, headers?: Record<string, string>): Cypress.Chainable<Cypress.Response<T>> {
    return this.request<T>({ method: 'PUT', url, body, headers });
  }

  delete<T = unknown>(url: string, headers?: Record<string, string>): Cypress.Chainable<Cypress.Response<T>> {
    return this.request<T>({ method: 'DELETE', url, headers });
  }

  graphql<T = unknown>(url: string, query: string, variables?: Record<string, unknown>, headers?: Record<string, string>): Cypress.Chainable<Cypress.Response<T>> {
    return this.request<T>({ method: 'POST', url, body: { query, variables }, headers });
  }

  createUniqueId(prefix: string = 'id'): string {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  createTestEmail(prefix: string = 'user'): string {
    return 'test-' + prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '@example.com';
  }

  createTestPhone(): string {
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    return '+1' + randomDigits;
  }

  createTestPassword(length: number = 14): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pwd = 'Aa1!';
    for (let i = 4; i < length; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  createTestUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  createTestName(prefix: string = 'User'): string {
    const names = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Sam', 'Chris'];
    const selected = names[Math.floor(Math.random() * names.length)];
    return prefix + ' ' + selected + ' ' + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  createTestAmount(min: number = 10, max: number = 1000): number {
    const val = Math.random() * (max - min) + min;
    return Number(val.toFixed(2));
  }

  createTestDate(offsetDays: number = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString();
  }
}
`;
}

/** cypress/e2e/example.cy.ts */
export function renderCypressExampleTest(): string {
  return `describe('Harness Boots', () => {
  it('harness boots', () => {
    cy.document().then((doc) => {
      doc.body.innerHTML = '<h1>ok</h1>';
    });
    cy.get('h1').should('have.text', 'ok');
  });
});
`;
}

/** README.md for Cypress projects */
export function renderCypressProjectReadme(opts: { projectName: string; baseUrl: string }): string {
  return `# ${opts.projectName}

A Cypress + TypeScript UI-test framework core. It contains a component
library (\`components/\`) you build Page Objects on top of, a Cypress config, and example tests.

## Run

\`\`\`bash
npm install                      # install dependencies (Cypress)
npm test                         # run tests in headless mode
\`\`\`

### Useful Commands

- **\`npm test\`** — runs all Cypress tests in headless mode.
- **\`npm run test:open\`** — opens the interactive Cypress Test Runner.
- **\`npm run typecheck\`** — runs strict TypeScript compiler checks.

## Configure

- **\`cypress.config.ts\`** — your config; spec patterns, \`baseUrl\`, retries. This file is
  generated once and never overwritten.
`;
}
