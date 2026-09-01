import { describe, it, expect } from 'vitest';
import { renderCypressApiClient } from '../../engine/src/plan/templates/cypress/project.js';
import { renderPythonApiClient } from '../../engine/src/plan/templates/python/project.js';
import { renderPythonComponent } from '../../engine/src/plan/templates/python/components.js';
import {
  renderCsharpApiClient,
  renderCsharpComponent,
} from '../../engine/src/plan/templates/csharp/project.js';
import {
  renderJavaApiClient,
  renderJavaComponent,
} from '../../engine/src/plan/templates/java/project.js';

describe('Polyglot Parity: 100% Cross-Language TDM and Animation Sync', () => {
  it('Cypress ApiClient contains full TDM suite', () => {
    const cyClient = renderCypressApiClient();
    expect(cyClient).toContain('createTestPhone');
    expect(cyClient).toContain('createTestPassword');
    expect(cyClient).toContain('createTestUuid');
    expect(cyClient).toContain('createTestName');
    expect(cyClient).toContain('createTestAmount');
    expect(cyClient).toContain('createTestDate');
  });

  it('Python ApiClient and Component contain full TDM and animation sync', () => {
    const pyClient = renderPythonApiClient({ baseUrl: 'http://localhost:3000' });
    expect(pyClient).toContain('create_unique_id');
    expect(pyClient).toContain('create_test_email');
    expect(pyClient).toContain('create_test_phone');
    expect(pyClient).toContain('create_test_password');
    expect(pyClient).toContain('create_test_uuid');
    expect(pyClient).toContain('create_test_name');
    expect(pyClient).toContain('create_test_amount');
    expect(pyClient).toContain('create_test_date');

    const pyComp = renderPythonComponent();
    expect(pyComp).toContain('wait_for_animations');
    expect(pyComp).toContain('getAnimations');
  });

  it('C# ApiClient and Component contain full TDM and animation sync', () => {
    const csClient = renderCsharpApiClient();
    expect(csClient).toContain('CreateUniqueId');
    expect(csClient).toContain('CreateTestEmail');
    expect(csClient).toContain('CreateTestPhone');
    expect(csClient).toContain('CreateTestPassword');
    expect(csClient).toContain('CreateTestUuid');
    expect(csClient).toContain('CreateTestName');
    expect(csClient).toContain('CreateTestAmount');
    expect(csClient).toContain('CreateTestDate');

    const csComp = renderCsharpComponent();
    expect(csComp).toContain('WaitForAnimationsAsync');
    expect(csComp).toContain('getAnimations');
  });

  it('Java ApiClient and Component contain full TDM and animation sync', () => {
    const javaClient = renderJavaApiClient();
    expect(javaClient).toContain('createUniqueId');
    expect(javaClient).toContain('createTestEmail');
    expect(javaClient).toContain('createTestPhone');
    expect(javaClient).toContain('createTestPassword');
    expect(javaClient).toContain('createTestUuid');
    expect(javaClient).toContain('createTestName');
    expect(javaClient).toContain('createTestAmount');
    expect(javaClient).toContain('createTestDate');

    const javaComp = renderJavaComponent();
    expect(javaComp).toContain('waitForAnimations');
    expect(javaComp).toContain('getAnimations');
  });
});
