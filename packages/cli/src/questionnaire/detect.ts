import { get as httpsGet } from 'node:https';
import { get as httpGet } from 'node:http';

// Result of stack auto-detection from the live app URL.
export interface DetectionResult {
  framework?: string; // 'react' | 'vue' | 'angular' | 'svelte'
  uiLibrary?: string; // 'mui' | 'antd' | 'chakra' | 'radix' | 'tailwind'
}

interface FetchResult {
  html: string;
  headers: Record<string, string>;
  /** All script src= values found in the page */
  scripts: string[];
  /** All link href= values found in the page */
  links: string[];
}

/** Fetch raw HTML with a timeout. Returns null on any error. */
function fetchHtml(url: string, timeoutMs: number): Promise<FetchResult | null> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const getter = parsed.protocol === 'https:' ? httpsGet : httpGet;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        req.destroy();
        resolve(null);
      }
    }, timeoutMs);

    const req = getter(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; eitr-detect/1.0)' } },
      (res) => {
        if (settled) return;

        // Follow one redirect (resolve relative location against original base)
        if (
          (res.statusCode === 301 ||
            res.statusCode === 302 ||
            res.statusCode === 307 ||
            res.statusCode === 308) &&
          res.headers.location
        ) {
          settled = true;
          clearTimeout(timer);
          res.resume();
          let nextUrl: string;
          try {
            nextUrl = new URL(res.headers.location, url).toString();
          } catch {
            resolve(null);
            return;
          }
          fetchHtml(nextUrl, timeoutMs).then(resolve);
          return;
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          totalSize += chunk.length;
          // Stop reading after 512 KB — enough for <head> + early <body>
          if (totalSize > 512 * 1024) res.destroy();
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);

          const html = Buffer.concat(chunks).toString('utf8');
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') headers[k.toLowerCase()] = v;
            else if (Array.isArray(v)) headers[k.toLowerCase()] = v[0] ?? '';
          }

          // Extract all script src values
          const scripts: string[] = [];
          const scriptRe = /<script[^>]+src=["']([^"']+)["']/gi;
          let m: RegExpExecArray | null;
          while ((m = scriptRe.exec(html)) !== null) scripts.push(m[1]);

          // Extract all link href values
          const links: string[] = [];
          const linkRe = /<link[^>]+href=["']([^"']+)["']/gi;
          while ((m = linkRe.exec(html)) !== null) links.push(m[1]);

          resolve({ html, headers, scripts, links });
        });
        res.on('error', () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

// ─── Framework detection ─────────────────────────────────────────────────────

function detectFramework(r: FetchResult): string | undefined {
  const { html, headers, scripts, links } = r;
  const allSrcs = [...scripts, ...links].join('\n');

  // ── Next.js / React ──────────────────────────────────────────────────────
  // HTTP header set by Next.js
  if (/next\.js/i.test(headers['x-powered-by'] ?? '')) return 'react';
  // Next.js script chunk paths
  if (/\/_next\/static\//.test(allSrcs)) return 'react';
  // Next.js data island
  if (/__NEXT_DATA__/.test(html)) return 'react';
  // React SSR hydration comment markers (React 18)
  if (/<!--\$-->|<!--\$!-->/.test(html)) return 'react';
  // Typical CRA / Vite-React build artifacts
  if (/\/static\/js\/(?:main|bundle|app)\.[a-f0-9]+\.(?:chunk\.)?js/.test(allSrcs)) return 'react';
  // data-reactroot or data-reactid (older React)
  if (/data-react(?:root|id)/.test(html)) return 'react';
  // react-dom explicitly in script names
  if (scripts.some((s) => /react-dom/.test(s))) return 'react';
  // Generic: any script with 'react' in src (CDN / unpkg / esm.sh)
  if (scripts.some((s) => /(?:^|\/)react(?:@|\.min|\/umd|\/)/.test(s))) return 'react';

  // ── Vue / Nuxt ────────────────────────────────────────────────────────────
  if (/__NUXT__|__nuxt/.test(html)) return 'vue';
  if (/data-server-rendered="true"/.test(html)) return 'vue'; // Vue 2 SSR
  if (/__vue_app__/.test(html)) return 'vue'; // Vue 3 hydration
  if (/data-v-[0-9a-f]{7,}/.test(html)) return 'vue'; // scoped style attr
  if (scripts.some((s) => /(?:^|\/)vue(?:@|\.global|\.esm|\.min|\/)/.test(s))) return 'vue';
  if (scripts.some((s) => /nuxt/.test(s))) return 'vue';
  // Nuxt 3 / Vue 3 build artifacts path
  if (/\/_nuxt\//.test(allSrcs)) return 'vue';

  // ── Angular ───────────────────────────────────────────────────────────────
  if (/ng-version="/.test(html)) return 'angular';
  if (/platformBrowserDynamic|zone\.js/.test(allSrcs)) return 'angular';
  if (scripts.some((s) => /angular(?:\.min)?\.js|@angular\//.test(s))) return 'angular';
  // Angular Universal SSR marker
  if (/ng-server-context/.test(html)) return 'angular';
  // Typical Angular CLI chunk naming
  if (scripts.some((s) => /(?:main|polyfills|runtime)\.[a-f0-9]{8,}\.js/.test(s))) {
    if (/zone\.js/.test(allSrcs)) return 'angular'; // zone.js is almost exclusively Angular
  }

  // ── Svelte / SvelteKit ────────────────────────────────────────────────────
  if (/\/_app\/immutable\//.test(allSrcs)) return 'svelte'; // SvelteKit build
  if (/__sveltekit|window\.__sk/.test(html)) return 'svelte';
  if (scripts.some((s) => /svelte/.test(s))) return 'svelte';
  if (/svelte-[a-z0-9]+/.test(html)) return 'svelte';

  return undefined;
}

// ─── UI library detection ────────────────────────────────────────────────────

function detectUiLibrary(r: FetchResult): string | undefined {
  const { html, scripts, links } = r;
  const allSrcs = [...scripts, ...links].join('\n');

  // ── Material UI (MUI) ────────────────────────────────────────────────────
  if (/class="[^"]*Mui[A-Z]/.test(html)) return 'mui';
  if (/MuiButton-root|MuiTypography|MuiGrid-/.test(html)) return 'mui';
  if (allSrcs.includes('@mui/') || allSrcs.includes('material-ui')) return 'mui';

  // ── Ant Design ────────────────────────────────────────────────────────────
  if (/class="[^"]*ant-(?:btn|table|input|menu|form|modal|card|col|row)/.test(html)) return 'antd';
  if (allSrcs.includes('antd') || allSrcs.includes('ant-design')) return 'antd';

  // ── Chakra UI ─────────────────────────────────────────────────────────────
  if (/class="[^"]*chakra-|data-theme="chakra"/.test(html)) return 'chakra';
  if (allSrcs.includes('@chakra-ui') || allSrcs.includes('chakra-ui')) return 'chakra';

  // ── Radix UI ─────────────────────────────────────────────────────────────
  if (/data-radix-|class="[^"]*radix-/.test(html)) return 'radix';
  if (allSrcs.includes('@radix-ui')) return 'radix';

  // ── Tailwind ─────────────────────────────────────────────────────────────
  if (/cdn\.tailwindcss\.com|tailwindcss@|tailwind\.config/.test(allSrcs)) return 'tailwind';
  // Tailwind via CDN link tag
  if (links.some((l) => /tailwind/.test(l))) return 'tailwind';
  // Heuristic: Tailwind typically produces many short utility class combos in class attributes.
  // Count class attributes that look like utility stacks (3+ space-separated tokens with typical prefixes).
  const tailwindPrefixes =
    /(?:flex|grid|gap-|p[xy]?-\d|m[xy]?-\d|text-(?:sm|base|lg|xl)|bg-|rounded|border|shadow|font-|w-|h-|items-|justify-)/g;
  const classBlocks = html.match(/class="([^"]{10,})"/g) ?? [];
  let tailwindHits = 0;
  for (const block of classBlocks.slice(0, 200)) {
    const tokens = block.split(/\s+/).length;
    const matches = (block.match(tailwindPrefixes) ?? []).length;
    if (tokens >= 3 && matches >= 2) tailwindHits++;
  }
  if (tailwindHits >= 5) return 'tailwind';

  return undefined;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attempt to detect the frontend stack by fetching the app URL.
 * Always resolves — returns an empty object on timeout or network error.
 */
export async function detectStack(url: string, timeoutMs = 7000): Promise<DetectionResult> {
  try {
    const result = await fetchHtml(url, timeoutMs);
    if (!result) return {};
    const out: DetectionResult = {};
    const fw = detectFramework(result);
    const ui = detectUiLibrary(result);
    if (fw) out.framework = fw;
    if (ui) out.uiLibrary = ui;
    return out;
  } catch {
    return {};
  }
}
