import { promises as fs } from 'node:fs';
import type { UiLibrary, FrontendFramework } from '../types/stack-profile.js';

export interface ReconResult {
  framework?: FrontendFramework;
  uiLibraries: UiLibrary[];
  testIdAttribute?: string;
  customWebComponents?: boolean;
  hasPortals?: boolean;
  detectedPortals?: string[];
}

export interface ReconOptions {
  storageStatePath?: string | undefined;
}

/**
 * Performs a fast, non-blocking GET request to the start URL and parses the returned HTML
 * to detect the frontend framework, UI libraries, test-id attributes, web components, and portals.
 *
 * If the network is unreachable, or the request times out, it returns an empty result gracefully.
 */
export async function recon(url: string, opts: ReconOptions = {}): Promise<ReconResult> {
  const result: ReconResult = {
    uiLibraries: [],
    detectedPortals: [],
  };

  let html: string;
  try {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    if (opts.storageStatePath) {
      try {
        const raw = await fs.readFile(opts.storageStatePath, 'utf-8');
        const state = JSON.parse(raw);
        if (state && Array.isArray(state.cookies)) {
          headers['Cookie'] = state.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
        }
      } catch (err) {
        // Ignore storage state read errors and proceed
      }
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(id);

    if (!response.ok) {
      return result;
    }

    html = await response.text();
  } catch (err) {
    // Gracefully fallback on any network, DNS, or timeout error
    return result;
  }

  // 1. Framework detection
  if (
    /ng-version|ng-component|<app-root>|ng-app|_ngcontent-|ng-reflect-/i.test(html) ||
    /src="[^"]*angular[^"]*"/i.test(html)
  ) {
    result.framework = 'angular';
  } else if (
    /_reactRootContainer|react-data-attr|data-reactroot|__NEXT_DATA__/i.test(html) ||
    /src="[^"]*react[^"]*"/i.test(html) ||
    /id="root"/i.test(html)
  ) {
    result.framework = 'react';
  } else if (
    /data-v-|__vue_app__|__NUXT__/i.test(html) ||
    /src="[^"]*vue[^"]*"/i.test(html) ||
    /id="app"/i.test(html)
  ) {
    result.framework = 'vue';
  } else if (
    /class="[^"]*\bsvelte-[a-z0-9]+/i.test(html) ||
    /svelte-[a-z0-9]{5,8}/i.test(html) ||
    /__svelte/i.test(html)
  ) {
    result.framework = 'svelte';
  }

  // 2. UI Library detection
  // MUI classes check (e.g. MuiButton-root, MuiInput-input)
  if (/class="[^"]*\bMui[A-Z][a-zA-Z0-9]*-/i.test(html)) {
    result.uiLibraries.push({
      id: 'mui',
      version: 'unknown',
      dependencyKind: 'direct',
      confidence: 'medium',
      source: 'live',
      evidence: [{ file: 'live-dom', matchedPattern: 'Mui*-classes' }],
    });
  }

  // Ant Design classes check (e.g. ant-btn, ant-input)
  if (/class="[^"]*\bant-[a-z]+/i.test(html)) {
    result.uiLibraries.push({
      id: 'antd',
      version: 'unknown',
      dependencyKind: 'direct',
      confidence: 'medium',
      source: 'live',
      evidence: [{ file: 'live-dom', matchedPattern: 'ant-classes' }],
    });
  }

  // Radix UI check
  if (/data-radix-/i.test(html) || /radix-/i.test(html)) {
    result.uiLibraries.push({
      id: 'radix',
      version: 'unknown',
      dependencyKind: 'direct',
      confidence: 'medium',
      source: 'live',
      evidence: [{ file: 'live-dom', matchedPattern: 'radix-attributes' }],
    });
  }

  // Chakra UI check
  if (/class="[^"]*\bchakra-[a-z]+/i.test(html) || /data-chakra-component/i.test(html)) {
    result.uiLibraries.push({
      id: 'chakra',
      version: 'unknown',
      dependencyKind: 'direct',
      confidence: 'medium',
      source: 'live',
      evidence: [{ file: 'live-dom', matchedPattern: 'chakra-classes' }],
    });
  }

  // Tailwind CSS stylesheet or class pattern check
  if (
    /tailwind/i.test(html) ||
    /class="[^"]*\b(flex|grid|block|hidden|relative|absolute)\b[^"]*\b(items-center|justify-between|flex-col)\b[^"]*"/i.test(
      html,
    )
  ) {
    result.uiLibraries.push({
      id: 'tailwind',
      version: 'unknown',
      dependencyKind: 'direct',
      confidence: 'medium',
      source: 'live',
      evidence: [{ file: 'live-dom', matchedPattern: 'tailwind-classes' }],
    });
  }

  // 3. Custom Web Components & Shadow DOM detection
  if (/<[a-z0-9]+-[a-z0-9-]+/i.test(html)) {
    result.customWebComponents = true;
  }

  // 4. Portal & Modal Mount Point detection
  if (
    /id="(modal|portal)-root"/i.test(html) ||
    /role="dialog"/i.test(html) ||
    /MuiPopover-root/i.test(html)
  ) {
    result.hasPortals = true;
    const portals: string[] = [];
    if (/id="modal-root"/i.test(html)) portals.push('#modal-root');
    if (/id="portal-root"/i.test(html)) portals.push('#portal-root');
    if (/role="dialog"/i.test(html)) portals.push('[role="dialog"]');
    result.detectedPortals = portals;
  }

  // 5. Test ID Attribute detection
  if (/data-testid=/i.test(html)) {
    result.testIdAttribute = 'data-testid';
  } else if (/data-test-id=/i.test(html)) {
    result.testIdAttribute = 'data-test-id';
  } else if (/data-qa=/i.test(html)) {
    result.testIdAttribute = 'data-qa';
  } else if (/data-cy=/i.test(html)) {
    result.testIdAttribute = 'data-cy';
  } else if (/data-test=/i.test(html)) {
    result.testIdAttribute = 'data-test';
  } else if (/data-automation-id=/i.test(html)) {
    result.testIdAttribute = 'data-automation-id';
  }

  return result;
}
