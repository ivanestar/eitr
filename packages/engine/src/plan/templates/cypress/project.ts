/**
 * Cypress template render functions for TypeScript & JavaScript target generators.
 */
import type { StackProfile } from '../../../types/stack-profile.js';

export interface CypressProjectOpts {
  baseUrl: string;
  projectName: string;
  isTs: boolean;
}

/** eitr.config.ts / eitr.config.js for Cypress */
export function renderCypressEitrConfig(
  profile: StackProfile,
  isTs: boolean,
  _ciCd?: string,
): string {
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

  const exportStmt = 'export const eitrConfig =';

  return `${exportStmt} {
  e2e: {
    specPattern: 'cypress/e2e/**/*.cy.${isTs ? 'ts' : 'js'}',
    supportFile: false${isTs ? ' as const' : ''},
  },
  retries: {
    runMode: 2,
    openMode: 0,
  },
  // webServer: {
  //   command: '${serverCmd}',
  //   url: 'http://localhost:${serverPort}',
  // },
};
`;
}

/** cypress.config.ts / cypress.config.js */
export function renderCypressConfig(baseUrl: string, isTs = true): string {
  const importExt = isTs ? '' : '.js';
  return `import { defineConfig } from 'cypress';
import { eitrConfig } from './eitr.config${importExt}';

export default defineConfig({
  ...eitrConfig,
  e2e: {
    ...eitrConfig.e2e,
    baseUrl: '${baseUrl.replace(/'/g, "\\'")}',
  },
});
`;
}

/** package.json for Cypress */
export function renderCypressPackageJson(projectName: string, isTs: boolean): string {
  const devDeps = isTs
    ? `    "cypress": "^13.13.0",
    "typescript": "^5.4.0"`
    : `    "cypress": "^13.13.0"`;

  return `{
  "name": "${projectName}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "cypress run",
    "test:open": "cypress open"${isTs ? ',\n    "typecheck": "tsc --noEmit"' : ''}
  },
  "devDependencies": {
${devDeps}
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
  "include": ["cypress/**/*.ts", "components/**/*.ts", "shared/**/*.ts", "eitr.config.ts", "cypress.config.ts"]
}
`;
}

/** components/base/component.ts or .js for Cypress */
export function renderCypressComponentBase(isTs: boolean): string {
  if (isTs) {
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

  return `export class Component {
  constructor(selector, parent) {
    this.selector = selector;
    this.parent = parent;
  }

  locator() {
    if (this.parent) {
      return this.parent.locator().find(this.selector);
    }
    return cy.get(this.selector);
  }

  click() {
    return this.locator().click();
  }

  isVisibleNow() {
    return this.locator().then(($el) => $el.is(':visible'));
  }

  isEnabledNow() {
    return this.locator().then(($el) => $el.is(':enabled'));
  }
}
`;
}

/** components/base/base-page.ts or .js for Cypress */
export function renderCypressBasePage(isTs: boolean): string {
  const compImport = isTs ? './component' : './component.js';
  if (isTs) {
    return `import { Component } from '${compImport}';

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

  return `export class BasePage {
  constructor(path = '/') {
    this.path = path;
  }

  navigate() {
    cy.visit(this.path);
  }

  _child(ComponentClass, selector) {
    return new ComponentClass(selector);
  }
}
`;
}

/** components/primitives/button.ts or .js */
export function renderCypressButton(isTs: boolean): string {
  const compImport = isTs ? '../base/component' : '../base/component.js';
  if (isTs) {
    return `import { Component } from '${compImport}';

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
  return `import { Component } from '${compImport}';

export class Button extends Component {
  textNow() {
    return this.locator().invoke('text');
  }

  getText() {
    return this.textNow();
  }
}
`;
}

/** components/primitives/text-input.ts or .js */
export function renderCypressTextInput(isTs: boolean): string {
  const compImport = isTs ? '../base/component' : '../base/component.js';
  if (isTs) {
    return `import { Component } from '${compImport}';

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
  return `import { Component } from '${compImport}';

export class TextInput extends Component {
  fill(value) {
    return this.locator().clear().type(value);
  }

  clear() {
    return this.locator().clear();
  }

  valueNow() {
    return this.locator().invoke('val');
  }
}
`;
}

/** components/primitives/checkbox.ts or .js */
export function renderCypressCheckbox(isTs: boolean): string {
  const compImport = isTs ? '../base/component' : '../base/component.js';
  if (isTs) {
    return `import { Component } from '${compImport}';

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
  return `import { Component } from '${compImport}';

export class Checkbox extends Component {
  check() {
    return this.locator().check();
  }

  uncheck() {
    return this.locator().uncheck();
  }

  isCheckedNow() {
    return this.locator().invoke('is', ':checked');
  }
}
`;
}

/** components/primitives/native-select.ts or .js */
export function renderCypressNativeSelect(isTs: boolean): string {
  const compImport = isTs ? '../base/component' : '../base/component.js';
  if (isTs) {
    return `import { Component } from '${compImport}';

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
  return `import { Component } from '${compImport}';

export class NativeSelect extends Component {
  selectOption(value) {
    return this.locator().select(value);
  }

  valueNow() {
    return this.locator().invoke('val');
  }

  getSelectedValue() {
    return this.valueNow();
  }
}
`;
}

/** components/primitives/link.ts or .js */
export function renderCypressLink(isTs: boolean): string {
  const compImport = isTs ? '../base/component' : '../base/component.js';
  if (isTs) {
    return `import { Component } from '${compImport}';

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
  return `import { Component } from '${compImport}';

export class Link extends Component {
  hrefNow() {
    return this.locator().invoke('attr', 'href');
  }

  getHref() {
    return this.hrefNow();
  }
}
`;
}

/** components/primitives/file-input.ts or .js */
export function renderCypressFileInput(isTs: boolean): string {
  const compImport = isTs ? '../base/component' : '../base/component.js';
  if (isTs) {
    return `import { Component } from '${compImport}';

export class FileInput extends Component {
  selectFile(filePath: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return this.locator().selectFile(filePath);
  }
}
`;
  }
  return `import { Component } from '${compImport}';

export class FileInput extends Component {
  selectFile(filePath) {
    return this.locator().selectFile(filePath);
  }
}
`;
}

/** components/primitives/index.ts or .js */
export function renderCypressPrimitivesIndex(isTs = true): string {
  const ext = isTs ? '' : '.js';
  return `export * from './button${ext}';
export * from './text-input${ext}';
export * from './checkbox${ext}';
export * from './radio${ext}';
export * from './native-select${ext}';
export * from './link${ext}';
export * from './file-input${ext}';
`;
}

export function renderCypressRadio(isTs: boolean): string {
  const compImport = isTs ? '../base/component' : '../base/component.js';
  if (isTs) {
    return `import { Component } from '${compImport}';

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
  return `import { Component } from '${compImport}';

export class RadioButton extends Component {
  check() {
    return this.locator().check();
  }
}

export class RadioGroup extends Component {
  radio(name) {
    return this.locator().find(\`input[type="radio"][value="\${name}"]\`);
  }

  select(name) {
    return this.radio(name).check();
  }
}
`;
}

/** components/widgets/dialog.ts or .js */
export function renderCypressDialog(isTs: boolean): string {
  const compImport = isTs ? '../base/component' : '../base/component.js';
  if (isTs) {
    return `import { Component } from '${compImport}';

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
  return `import { Component } from '${compImport}';

export class Dialog extends Component {
  title() {
    return this.locator().find('h1, h2, h3, [role="heading"]');
  }

  close() {
    return this.locator().find('button[aria-label="Close"], button:contains("Close"), .close').click();
  }
}
`;
}

/** components/widgets/table.ts or .js */
export function renderCypressTable(isTs: boolean): string {
  const compImport = isTs ? '../base/component' : '../base/component.js';
  if (isTs) {
    return `import { Component } from '${compImport}';

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
  return `import { Component } from '${compImport}';

export class Table extends Component {
  rows() {
    return this.locator().find('tbody tr');
  }

  cell(rowIdx, colIdx) {
    return this.rows().eq(rowIdx).find('td').eq(colIdx);
  }

  rowByColumn(colIdx, text) {
    return this.rows().filter((_idx, el) => Cypress.$(el).find('td').eq(colIdx).text().includes(text)).first();
  }

  rowCountNow() {
    return this.rows().its('length');
  }

  rowCount() {
    return this.rowCountNow();
  }
}
`;
}

/** components/widgets/index.ts or .js */
export function renderCypressWidgetsIndex(isTs = true): string {
  const ext = isTs ? '' : '.js';
  return `export * from './dialog${ext}';
export * from './table${ext}';
`;
}

/** shared/utils/api-client.ts or .js */
export function renderCypressApiClient(isTs: boolean): string {
  if (isTs) {
    return `export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  body?: any;
  headers?: Record<string, string>;
}

export class ApiClient {
  request<T = unknown>(options: ApiRequestOptions): Cypress.Chainable<Cypress.Response<T>> {
    return cy.request<T>({
      method: options.method ?? 'GET',
      url: options.url,
      body: options.body,
      headers: options.headers,
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

  return `export class ApiClient {
  createUniqueId(prefix = 'id') {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  createTestEmail(prefix = 'user') {
    return 'test-' + prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '@example.com';
  }

  createTestPhone() {
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    return '+1' + randomDigits;
  }

  createTestPassword(length = 14) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pwd = 'Aa1!';
    for (let i = 4; i < length; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  createTestUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  createTestName(prefix = 'User') {
    const names = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Sam', 'Chris'];
    const selected = names[Math.floor(Math.random() * names.length)];
    return prefix + ' ' + selected + ' ' + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  createTestAmount(min = 10, max = 1000) {
    const val = Math.random() * (max - min) + min;
    return Number(val.toFixed(2));
  }

  createTestDate(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString();
  }

  request(options) {
    return cy.request({
      method: options.method || 'GET',
      url: options.url,
      body: options.body,
      headers: options.headers,
    });
  }

  get(url, headers) {
    return this.request({ method: 'GET', url, headers });
  }

  post(url, body, headers) {
    return this.request({ method: 'POST', url, body, headers });
  }

  put(url, body, headers) {
    return this.request({ method: 'PUT', url, body, headers });
  }

  delete(url, headers) {
    return this.request({ method: 'DELETE', url, headers });
  }

  graphql(url, query, variables, headers) {
    return this.request({ method: 'POST', url, body: { query, variables }, headers });
  }
}
`;
}

/** cypress/e2e/example.cy.ts or .js */
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
export function renderCypressProjectReadme(opts: {
  projectName: string;
  baseUrl: string;
  isTs: boolean;
}): string {
  return `# ${opts.projectName}

A Cypress + ${opts.isTs ? 'TypeScript' : 'JavaScript'} UI-test framework core. It contains a component
library (\`components/\`) you build Page Objects on top of, a Cypress config, and example tests.

## Run

\`\`\`bash
npm install                      # install dependencies (Cypress)
npm test                         # run tests in headless mode
\`\`\`

### Useful Commands

- **\`npm test\`** — runs all Cypress tests in headless mode.
- **\`npm run test:open\`** — opens the interactive Cypress Test Runner.
${opts.isTs ? '- **`npm run typecheck`** — runs strict TypeScript compiler checks.\n' : ''}
## Configure

- **\`cypress.config.${opts.isTs ? 'ts' : 'js'}\`** — Cypress configuration file.
- **\`eitr.config.${opts.isTs ? 'ts' : 'js'}\`** — Framework configuration (spec patterns, webServer settings).
`;
}
