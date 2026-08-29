import type { FrontendFramework, UiLibrary } from '../types/stack-profile.js';

// Shared regex heuristics for detecting frontend framework and UI library from a live page's
// HTML plus its script/link src values. Single source of truth for both the engine's recon()
// (drives actual generation decisions) and the CLI questionnaire's pre-fill hint, so the two
// never disagree about what a given URL looks like.

export interface PageAssets {
  html: string;
  poweredByHeader: string;
  scripts: string[];
  links: string[];
}

/** Extracts all <script src=...> and <link href=...> values from raw HTML. */
export function extractPageAssets(html: string, poweredByHeader = ''): PageAssets {
  const scripts: string[] = [];
  const scriptRe = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) scripts.push(m[1]);

  const links: string[] = [];
  const linkRe = /<link[^>]+href=["']([^"']+)["']/gi;
  while ((m = linkRe.exec(html)) !== null) links.push(m[1]);

  return { html, poweredByHeader, scripts, links };
}

export function detectFrameworkHeuristic(assets: PageAssets): FrontendFramework | undefined {
  const { html, poweredByHeader, scripts, links } = assets;
  const allSrcs = [...scripts, ...links].join('\n');

  // ── Next.js / React ────────────────────────────────────────────────────
  if (/next\.js/i.test(poweredByHeader)) return 'react';
  if (/\/_next\/static\//.test(allSrcs)) return 'react';
  if (/__NEXT_DATA__/.test(html)) return 'react';
  if (/<!--\$-->|<!--\$!-->/.test(html)) return 'react';
  if (/\/static\/js\/(?:main|bundle|app)\.[a-f0-9]+\.(?:chunk\.)?js/.test(allSrcs)) return 'react';
  if (/data-react(?:root|id)/.test(html)) return 'react';
  if (scripts.some((s) => /react-dom/.test(s))) return 'react';
  if (scripts.some((s) => /(?:^|\/)react(?:@|\.min|\/umd|\/)/.test(s))) return 'react';

  // ── Vue / Nuxt ──────────────────────────────────────────────────────────
  if (/__NUXT__|__nuxt/.test(html)) return 'vue';
  if (/data-server-rendered="true"/.test(html)) return 'vue';
  if (/__vue_app__/.test(html)) return 'vue';
  if (/data-v-[0-9a-f]{7,}/.test(html)) return 'vue';
  if (scripts.some((s) => /(?:^|\/)vue(?:@|\.global|\.esm|\.min|\/)/.test(s))) return 'vue';
  if (scripts.some((s) => /nuxt/.test(s))) return 'vue';
  if (/\/_nuxt\//.test(allSrcs)) return 'vue';

  // ── Angular ─────────────────────────────────────────────────────────────
  if (/ng-version="/.test(html)) return 'angular';
  if (/platformBrowserDynamic|zone\.js/.test(allSrcs)) return 'angular';
  if (scripts.some((s) => /angular(?:\.min)?\.js|@angular\//.test(s))) return 'angular';
  if (/ng-server-context/.test(html)) return 'angular';
  if (
    scripts.some((s) => /(?:main|polyfills|runtime)\.[a-f0-9]{8,}\.js/.test(s)) &&
    /zone\.js/.test(allSrcs)
  ) {
    return 'angular';
  }

  // ── Svelte / SvelteKit ──────────────────────────────────────────────────
  if (/\/_app\/immutable\//.test(allSrcs)) return 'svelte';
  if (/__sveltekit|window\.__sk/.test(html)) return 'svelte';
  if (scripts.some((s) => /svelte/.test(s))) return 'svelte';
  if (/svelte-[a-z0-9]+/.test(html)) return 'svelte';

  return undefined;
}

export interface UiLibraryMatch {
  id: UiLibrary['id'];
  matchedPattern: string;
}

export function detectUiLibrariesHeuristic(assets: PageAssets): UiLibraryMatch[] {
  const { html, scripts, links } = assets;
  const allSrcs = [...scripts, ...links].join('\n');
  const matches: UiLibraryMatch[] = [];

  // ── Material UI (MUI) ────────────────────────────────────────────────────
  if (/class="[^"]*Mui[A-Z]/.test(html))
    matches.push({ id: 'mui', matchedPattern: 'Mui*-classes' });
  else if (allSrcs.includes('@mui/') || allSrcs.includes('material-ui')) {
    matches.push({ id: 'mui', matchedPattern: '@mui/ or material-ui script src' });
  }

  // ── Ant Design ────────────────────────────────────────────────────────────
  if (/class="[^"]*ant-(?:btn|table|input|menu|form|modal|card|col|row)/.test(html)) {
    matches.push({ id: 'antd', matchedPattern: 'ant-* classes' });
  } else if (allSrcs.includes('antd') || allSrcs.includes('ant-design')) {
    matches.push({ id: 'antd', matchedPattern: 'antd script src' });
  }

  // ── Chakra UI ─────────────────────────────────────────────────────────────
  if (/class="[^"]*chakra-|data-theme="chakra"/.test(html)) {
    matches.push({ id: 'chakra', matchedPattern: 'chakra-* classes' });
  } else if (allSrcs.includes('@chakra-ui') || allSrcs.includes('chakra-ui')) {
    matches.push({ id: 'chakra', matchedPattern: '@chakra-ui script src' });
  }

  // ── Radix UI ─────────────────────────────────────────────────────────────
  if (/data-radix-|class="[^"]*radix-/.test(html)) {
    matches.push({ id: 'radix', matchedPattern: 'radix-* attributes/classes' });
  } else if (allSrcs.includes('@radix-ui')) {
    matches.push({ id: 'radix', matchedPattern: '@radix-ui script src' });
  }

  // ── Tailwind ─────────────────────────────────────────────────────────────
  if (/cdn\.tailwindcss\.com|tailwindcss@|tailwind\.config/.test(allSrcs)) {
    matches.push({ id: 'tailwind', matchedPattern: 'tailwind script/link src' });
  } else if (links.some((l) => /tailwind/.test(l))) {
    matches.push({ id: 'tailwind', matchedPattern: 'tailwind link href' });
  } else {
    // Heuristic: Tailwind typically produces many short utility class combos in class attributes.
    const tailwindPrefixes =
      /(?:flex|grid|gap-|p[xy]?-\d|m[xy]?-\d|text-(?:sm|base|lg|xl)|bg-|rounded|border|shadow|font-|w-|h-|items-|justify-)/g;
    const classBlocks = html.match(/class="([^"]{10,})"/g) ?? [];
    let tailwindHits = 0;
    for (const block of classBlocks.slice(0, 200)) {
      const tokens = block.split(/\s+/).length;
      const patternMatches = (block.match(tailwindPrefixes) ?? []).length;
      if (tokens >= 3 && patternMatches >= 2) tailwindHits++;
    }
    if (tailwindHits >= 5)
      matches.push({ id: 'tailwind', matchedPattern: 'utility-class density' });
  }

  return matches;
}
