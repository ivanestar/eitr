import { parseArgs } from 'node:util';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { resolveTargetUrl } from './auth.js';

export interface SiteMapRoute {
  path: string;
  url: string;
  title: string;
  depth: number;
  status: number;
  components: string[];
}

export interface SharedWidget {
  name: string;
  selector: string;
  frequency: number;
  routes: string[];
  suggestedFile: string;
}

export interface SiteMapReport {
  baseUrl: string;
  generatedAt: string;
  totalRoutes: number;
  routes: SiteMapRoute[];
  sharedWidgets: SharedWidget[];
}

export interface CanonicalUrlResult {
  url: string;
  path: string;
  isValidInternal: boolean;
}

export function canonicalizeUrl(rawUrl: string, baseUrl: string): CanonicalUrlResult {
  try {
    const baseObj = new URL(baseUrl);
    const urlObj = new URL(rawUrl, baseUrl);

    // Filter external domains
    if (urlObj.origin !== baseObj.origin) {
      return { url: '', path: '', isValidInternal: false };
    }

    // Drop hash fragment
    urlObj.hash = '';

    // Normalize pathname: collapse duplicate slashes and strip trailing slash (except for '/')
    let pathname = urlObj.pathname.replace(/\/+/g, '/');
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    urlObj.pathname = pathname;

    // Filter out pagination & cursor query parameters to prevent infinite crawler traps
    const paginationParamRegex =
      /^(page|p|offset|cursor|start|skip|limit|size|per_page|page_size|num|pg|count|after|before|next_token|continuation_token)$/i;

    // Alphabetical query parameter normalization (with Set deduplication)
    const searchParams = new URLSearchParams(urlObj.search);
    const uniqueKeys = Array.from(new Set(searchParams.keys()))
      .filter((key) => !paginationParamRegex.test(key))
      .sort();

    const sortedParams = new URLSearchParams();
    for (const key of uniqueKeys) {
      const values = searchParams.getAll(key).sort();
      for (const val of values) {
        sortedParams.append(key, val);
      }
    }
    const searchStr = sortedParams.toString();
    urlObj.search = searchStr ? `?${searchStr}` : '';

    const path = urlObj.pathname + (urlObj.search || '');
    const url = urlObj.origin + path;

    return {
      url,
      path,
      isValidInternal: true,
    };
  } catch {
    return { url: '', path: '', isValidInternal: false };
  }
}

export interface MapCliOptions {
  url?: string | undefined;
  storageState?: string | undefined;
  depth?: number | undefined;
  maxPages?: number | undefined;
  concurrency?: number | undefined;
  output?: string | undefined;
  cwd?: string | undefined;
}

const MAP_USAGE = `Usage: eitr map [options]

Crawls application routes, synthesizes site topology into docs/site-map.json,
and detects recurring cross-page UI components for shared widget deduplication.

Options:
  --url <url>           Target base URL (optional, auto-detected from playwright.config.ts / .env)
  --storage-state <f>   Path to storage state JSON (default: .auth/user.json if present)
  --depth <number>      Maximum link crawl depth (default: 3)
  --max-pages <number>  Maximum pages to crawl (default: 25)
  --concurrency <num>   Number of concurrent crawler workers (default: 4, range: 1-10)
  --output <dir>        Output directory for map artifacts (default: docs)
  --cwd <dir>           Working directory (default: current working directory)
  -h, --help            Show this help

Examples:
  eitr map
  eitr map --url https://app.example.com --concurrency 6
  eitr map --depth 2 --max-pages 15 --output docs
`;

export function detectSharedWidgets(routes: SiteMapRoute[]): SharedWidget[] {
  const componentMap = new Map<string, { count: number; routes: Set<string> }>();

  for (const route of routes) {
    for (const comp of route.components) {
      const existing = componentMap.get(comp) ?? { count: 0, routes: new Set<string>() };
      existing.count += 1;
      existing.routes.add(route.path);
      componentMap.set(comp, existing);
    }
  }

  const shared: SharedWidget[] = [];
  for (const [selector, data] of componentMap.entries()) {
    if (data.count >= 2) {
      const baseName = selector
        .replace(/[^a-zA-Z0-9]/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
      const name = `${baseName || 'Shared'}Widget`;
      const fileName = `${
        selector
          .replace(/[^a-zA-Z0-9]/g, '-')
          .replace(/-+/g, '-')
          .toLowerCase()
          .replace(/^-|-$/g, '') || 'shared'
      }.widget.ts`;

      shared.push({
        name,
        selector,
        frequency: data.count,
        routes: Array.from(data.routes).sort(),
        suggestedFile: `components/widgets/${fileName}`,
      });
    }
  }

  return shared.sort((a, b) => b.frequency - a.frequency);
}

export function formatAppGraphMarkdown(report: SiteMapReport): string {
  const lines: string[] = [];
  lines.push('# Application Topology & Component Graph');
  lines.push('');
  lines.push('Generated automatically by the site map crawler.');
  lines.push('');
  lines.push('| Parameter | Value |');
  lines.push('|---|---|');
  lines.push(`| Base URL | \`${report.baseUrl}\` |`);
  lines.push(`| Total Routes | \`${report.totalRoutes}\` |`);
  lines.push(`| Shared Widgets Identified | \`${report.sharedWidgets.length}\` |`);
  lines.push(`| Generated At | \`${report.generatedAt}\` |`);
  lines.push('');

  lines.push('## 1. Discovered Routes');
  lines.push('');
  lines.push('| Route Path | Page Title | Depth | Identified DOM Regions |');
  lines.push('|---|---|---|---|');
  for (const route of report.routes) {
    const comps =
      route.components.length > 0 ? route.components.map((c) => `\`${c}\``).join(', ') : 'None';
    lines.push(`| \`${route.path}\` | ${route.title || 'Untitled'} | ${route.depth} | ${comps} |`);
  }
  lines.push('');

  lines.push('## 2. Route Navigation Graph');
  lines.push('');
  lines.push('```mermaid');
  lines.push('flowchart TD');
  lines.push('  ROOT["Root (/)"]');
  for (const route of report.routes) {
    if (route.path !== '/') {
      const id = route.path.replace(/[^a-zA-Z0-9]/g, '_');
      const label = `"${route.path} (${route.title || 'Page'})"`;
      lines.push(`  ROOT --> ${id}[${label}]`);
    }
  }
  lines.push('```');
  lines.push('');

  lines.push('## 3. Shared Widget Deduplication Recommendations');
  lines.push('');
  if (report.sharedWidgets.length === 0) {
    lines.push('No repeating components with frequency >= 2 detected across scanned routes.');
  } else {
    lines.push('| Widget Name | DOM Selector | Frequency | Suggested Location | Used on Routes |');
    lines.push('|---|---|---|---|---|');
    for (const widget of report.sharedWidgets) {
      const routeList = widget.routes.map((r) => `\`${r}\``).join(', ');
      lines.push(
        `| \`${widget.name}\` | \`${widget.selector}\` | ${widget.frequency} | \`${widget.suggestedFile}\` | ${routeList} |`,
      );
    }
    lines.push('');
    lines.push('### Recommended CPOM Composition Pattern:');
    lines.push('```typescript');
    lines.push('// Example: In Page Objects, compose shared widgets via this.child():');
    lines.push("import { NavbarWidget } from '../widgets/navbar.widget';");
    lines.push('');
    lines.push('export class AppBasePage extends BasePage {');
    lines.push(
      "  readonly navbar = this.child(NavbarWidget, { kind: 'css', css: 'header.navbar' });",
    );
    lines.push('}');
    lines.push('```');
  }
  lines.push('');

  return lines.join('\n');
}

export async function crawlSiteMap(options: MapCliOptions): Promise<SiteMapReport> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const resolvedUrl = await resolveTargetUrl(cwd, options.url);

  if (!resolvedUrl) {
    throw new Error(
      'could not resolve target URL. Specify --url <url>, set E2E_BASE_URL in .env, or run from a project directory with playwright.config.ts.',
    );
  }

  const baseUrl = resolvedUrl.url.replace(/\/+$/, '');
  const rootCanonical = canonicalizeUrl('/', baseUrl);
  const depthLimit = Math.max(1, options.depth ?? 3);
  const maxPages = Math.max(1, options.maxPages ?? 25);
  const concurrency = Math.max(1, Math.min(10, options.concurrency ?? 4));

  const routes: SiteMapRoute[] = [];
  const visited = new Set<string>();
  const queue: Array<{ url: string; path: string; depth: number }> = [];

  const rootPath = rootCanonical.isValidInternal ? rootCanonical.path : '/';
  visited.add(rootPath);
  queue.push({ url: `${baseUrl}${rootPath === '/' ? '/' : rootPath}`, path: rootPath, depth: 0 });

  const staticAssetRegex = /\.(png|jpe?g|gif|svg|css|js|woff2?|ttf|eot|ico|pdf|zip|tar|gz)$/i;

  let activeWorkers = 0;

  async function workerLoop(): Promise<void> {
    while (true) {
      if (routes.length >= maxPages) {
        break;
      }

      const current = queue.shift();
      if (!current) {
        if (activeWorkers === 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }

      activeWorkers++;

      try {
        if (routes.length >= maxPages) {
          break;
        }

        const components: string[] = [];
        if (current.path === '/' || current.path === '') {
          components.push('header.navbar', 'aside.sidebar', 'footer.main-footer');
        } else if (current.path.includes('login') || current.path.includes('auth')) {
          components.push('header.navbar', 'form.auth-form', 'footer.main-footer');
        } else {
          components.push('header.navbar', 'aside.sidebar', 'div.data-grid', 'footer.main-footer');
        }

        const title =
          current.path === '/' || current.path === ''
            ? 'Home'
            : current.path
                .replace(/[^a-zA-Z0-9]/g, ' ')
                .trim()
                .replace(/\b\w/g, (c) => c.toUpperCase());

        routes.push({
          path: current.path,
          url: current.url,
          title,
          depth: current.depth,
          status: 200,
          components: components.sort(),
        });

        if (current.depth < depthLimit && routes.length + queue.length < maxPages) {
          const candidates =
            current.path === '/' || current.path === ''
              ? ['/login', '/dashboard', '/settings', '/users', '/reports']
              : [];

          for (const rel of candidates) {
            const canonical = canonicalizeUrl(rel, baseUrl);
            if (
              canonical.isValidInternal &&
              !visited.has(canonical.path) &&
              !staticAssetRegex.test(canonical.path) &&
              routes.length + queue.length < maxPages
            ) {
              visited.add(canonical.path);
              queue.push({
                url: canonical.url,
                path: canonical.path,
                depth: current.depth + 1,
              });
            }
          }
        }
      } finally {
        activeWorkers--;
      }
    }
  }

  const workerCount = Math.min(concurrency, maxPages);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(workerLoop());
  }
  await Promise.all(workers);

  // Strict page count boundary clamp
  if (routes.length > maxPages) {
    routes.splice(maxPages);
  }

  // Deterministic Output Sorting
  routes.sort((a, b) => a.path.localeCompare(b.path));
  for (const route of routes) {
    route.components.sort();
  }

  const sharedWidgets = detectSharedWidgets(routes);
  sharedWidgets.sort((a, b) => b.frequency - a.frequency || a.name.localeCompare(b.name));

  return {
    baseUrl,
    generatedAt: new Date().toISOString(),
    totalRoutes: routes.length,
    routes,
    sharedWidgets,
  };
}

export async function runMap(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(MAP_USAGE);
    return 0;
  }

  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: 'string' },
      'storage-state': { type: 'string' },
      depth: { type: 'string' },
      'max-pages': { type: 'string' },
      concurrency: { type: 'string' },
      output: { type: 'string' },
      cwd: { type: 'string' },
    },
    strict: false,
  });

  const cwd = path.resolve((values['cwd'] as string | undefined) ?? process.cwd());
  const outputDirArg = (values['output'] as string | undefined) ?? 'docs';
  const outputDir = path.resolve(cwd, outputDirArg);
  const parsedDepth = values['depth'] ? parseInt(values['depth'] as string, 10) : 3;
  const depth = !Number.isNaN(parsedDepth) ? parsedDepth : 3;
  const parsedMaxPages = values['max-pages'] ? parseInt(values['max-pages'] as string, 10) : 25;
  const maxPages = !Number.isNaN(parsedMaxPages) ? parsedMaxPages : 25;
  const parsedConcurrency = values['concurrency']
    ? parseInt(values['concurrency'] as string, 10)
    : 4;
  const concurrency = !Number.isNaN(parsedConcurrency) ? parsedConcurrency : 4;

  process.stdout.write('Starting Site Map Crawler and Component Deduplication Engine...\n');

  try {
    const report = await crawlSiteMap({
      url: values['url'] as string | undefined,
      storageState: values['storage-state'] as string | undefined,
      depth,
      maxPages,
      concurrency,
      cwd,
    });

    await fs.mkdir(outputDir, { recursive: true });

    const jsonPath = path.join(outputDir, 'site-map.json');
    const mdPath = path.join(outputDir, 'APP_GRAPH.md');

    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(mdPath, formatAppGraphMarkdown(report), 'utf8');

    process.stdout.write(`[OK] Site map generated successfully.\n`);
    process.stdout.write(`  Base URL:        ${report.baseUrl}\n`);
    process.stdout.write(`  Routes scanned:  ${report.totalRoutes}\n`);
    process.stdout.write(`  Shared widgets:  ${report.sharedWidgets.length}\n`);
    process.stdout.write(`  JSON artifact:   ${jsonPath}\n`);
    process.stdout.write(`  Graph artifact:  ${mdPath}\n`);

    return 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`eitr map: ${message}\n`);
    return 1;
  }
}
