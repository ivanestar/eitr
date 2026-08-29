import { recon } from '@eitr/engine';

// Result of stack auto-detection from the live app URL.
export interface DetectionResult {
  framework?: string; // 'react' | 'vue' | 'angular' | 'svelte'
  uiLibrary?: string; // 'mui' | 'antd' | 'chakra' | 'radix' | 'tailwind'
}

/**
 * Attempt to detect the frontend stack by fetching the app URL.
 * Always resolves — returns an empty object on timeout or network error.
 *
 * Delegates to the engine's recon() so the wizard's pre-fill hint always matches what
 * generation will actually detect for the same URL — see recon.ts for the shared heuristics.
 */
export async function detectStack(url: string): Promise<DetectionResult> {
  try {
    const result = await recon(url);
    const out: DetectionResult = {};
    if (result.framework) out.framework = result.framework;
    if (result.uiLibraries[0]) out.uiLibrary = result.uiLibraries[0].id;
    return out;
  } catch {
    return {};
  }
}
