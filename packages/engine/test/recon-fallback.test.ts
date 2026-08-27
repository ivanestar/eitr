import { describe, it, expect, vi } from 'vitest';
import { recon } from '../src/detect/recon.js';
import { buildLocator, type Scope, type LocatorSpec } from '../src/types/locator-spec.js';

describe('Reconnaissance Engine (GET-first enhanced scanning)', () => {
  it('detects Chakra UI, custom web components, portals, and data-automation-id', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Test App</title></head>
        <body>
          <div id="root" data-reactroot=""></div>
          <div class="chakra-button-group"></div>
          <my-custom-element></my-custom-element>
          <div id="modal-root"></div>
          <button data-automation-id="submit-btn">Submit</button>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      text: async () => mockHtml,
    }));

    const result = await recon('https://example.com');
    vi.unstubAllGlobals();

    expect(result.framework).toBe('react');
    expect(result.uiLibraries.some((u) => u.id === 'chakra')).toBe(true);
    expect(result.customWebComponents).toBe(true);
    expect(result.hasPortals).toBe(true);
    expect(result.detectedPortals).toContain('#modal-root');
    expect(result.testIdAttribute).toBe('data-automation-id');
  });

  it('gracefully handles unreachable network or timeout', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('Network error');
    });

    const result = await recon('https://unreachable.local');
    vi.unstubAllGlobals();

    expect(result.uiLibraries).toEqual([]);
    expect(result.framework).toBeUndefined();
  });
});

describe('Resilient Composite Locators (buildLocator fallback strategy)', () => {
  it('builds a composite fallback locator using Playwright .or()', () => {
    const mockLocator = {
      or: vi.fn().mockReturnThis(),
    };
    const mockScope = {
      getByRole: vi.fn().mockReturnValue(mockLocator),
      getByTestId: vi.fn().mockReturnValue(mockLocator),
      getByLabel: vi.fn(),
      getByText: vi.fn(),
      locator: vi.fn(),
    } as unknown as Scope;

    const spec: LocatorSpec = {
      kind: 'fallback',
      specs: [
        { kind: 'role', role: 'button', name: 'Submit' },
        { kind: 'testId', testId: 'submit-btn' },
      ],
    };

    const loc = buildLocator(mockScope, spec);
    expect(mockScope.getByRole).toHaveBeenCalledWith('button', { name: 'Submit' });
    expect(mockScope.getByTestId).toHaveBeenCalledWith('submit-btn');
    expect(mockLocator.or).toHaveBeenCalled();
    expect(loc).toBe(mockLocator);
  });
});
