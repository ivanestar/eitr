// Template for generating scripts/check-sitemap-coverage.mjs. create-if-absent.
// Optional, best-effort completeness signal for artifacts/site-map/site-map.json: cross-references it
// against the target site's own published sitemap.xml (discovered via robots.txt's Sitemap:
// directive, falling back to the conventional /sitemap.xml default) to surface routes the crawl's
// own link-following may have missed - a page with no internal link pointing to it, but an explicit
// listing in the site's own sitemap. Zero model involvement, strictly read-only (at most a
// robots.txt GET plus a bounded sitemap.xml/sitemap-index GET chain - no different in kind from the
// crawler's own page reads). Never fails the pipeline: an absent, unreachable, or malformed
// sitemap.xml is simply not a signal, not an error - most sites don't publish one at all.

export function renderSitemapCoverageChecker(): string {
  return `#!/usr/bin/env node

/**
 * Optional, best-effort signal: cross-references artifacts/site-map/site-map.json against the target
 * site's own sitemap.xml (found via robots.txt's Sitemap: directive, or the conventional
 * /sitemap.xml default) to surface routes the crawl may have missed. Zero model involvement,
 * strictly read-only, never fails - an absent/unreachable sitemap.xml just means no signal.
 *
 * Path matching is best-effort: it mirrors /map-site's own numeric-ID/UUID canonicalization, but
 * NOT its per-record-slug judgment (e.g. /blog/my-post-title -> /blog/{slug}) - that call requires
 * the crawling model's own context and can't be cheaply mechanized. A flagged gap for a slug-shaped
 * route may be a false positive already covered under a template the crawl chose - read gaps as a
 * prompt to double-check, not as a proven miss.
 *
 * Usage:
 *   node scripts/check-sitemap-coverage.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CWD = process.cwd();
const SITE_MAP_PATH = path.join(CWD, 'artifacts', 'site-map', 'site-map.json');
const FETCH_TIMEOUT_MS = 8000;
const MAX_SITEMAP_INDEX_DEPTH = 1;

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function findSitemapUrlsInRobotsTxt(robotsText, baseUrl) {
  const found = [];
  for (const line of robotsText.split(/\\r?\\n/)) {
    const match = /^\\s*sitemap\\s*:\\s*(\\S+)/i.exec(line);
    if (!match) continue;
    try {
      found.push(new URL(match[1], baseUrl).toString());
    } catch {
      // Malformed directive value - ignore, not a fatal error for an optional signal.
    }
  }
  return found;
}

function extractLocs(xmlText) {
  const locs = [];
  const re = /<loc>\\s*([^<\\s][^<]*?)\\s*<\\/loc>/gi;
  let m;
  while ((m = re.exec(xmlText)) !== null) {
    locs.push(m[1].trim());
  }
  return locs;
}

function isSitemapIndex(xmlText) {
  return /<sitemapindex[\\s>]/i.test(xmlText);
}

// Mirrors /map-site Step 2/3a's numeric-ID/UUID path-segment canonicalization so a raw sitemap.xml
// URL can be compared against site-map.json's already-canonical route-template keys -
// independently reimplemented here since Step 2's canonicalization lives in the crawling model's
// own judgment, not a shared deterministic function this script can import.
const NUMERIC_SEGMENT = /^\\d+$/;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonicalizePath(rawUrl, baseUrl) {
  let pathname;
  try {
    pathname = new URL(rawUrl, baseUrl).pathname;
  } catch {
    return null;
  }
  const segments = pathname.split('/').filter((s) => s.length > 0);
  const canonical = segments.map((s) => {
    if (NUMERIC_SEGMENT.test(s) || UUID_SEGMENT.test(s)) return '{id}';
    return s;
  });
  if (canonical.length === 0) return '/';
  return '/' + canonical.join('/');
}

async function collectSitemapUrls(startUrl, depth) {
  const text = await fetchText(startUrl);
  if (!text) return { urls: [], fetchedAny: false };
  if (isSitemapIndex(text)) {
    if (depth >= MAX_SITEMAP_INDEX_DEPTH) return { urls: [], fetchedAny: true };
    const childSitemaps = extractLocs(text);
    const all = [];
    for (const child of childSitemaps) {
      const childResult = await collectSitemapUrls(child, depth + 1);
      all.push(...childResult.urls);
    }
    return { urls: all, fetchedAny: true };
  }
  return { urls: extractLocs(text), fetchedAny: true };
}

async function check() {
  const siteMap = loadJson(SITE_MAP_PATH);
  if (!siteMap || typeof siteMap.routes !== 'object' || typeof siteMap.baseUrl !== 'string') {
    return {
      status: 'SKIPPED',
      reason: 'artifacts/site-map/site-map.json missing or has no baseUrl - run /map-site create first.',
    };
  }
  const baseUrl = siteMap.baseUrl;
  const knownPaths = new Set(Object.keys(siteMap.routes));

  let sitemapUrl = null;
  const robotsText = await fetchText(new URL('/robots.txt', baseUrl).toString());
  if (robotsText) {
    const declared = findSitemapUrlsInRobotsTxt(robotsText, baseUrl);
    if (declared.length > 0) sitemapUrl = declared[0];
  }
  if (!sitemapUrl) sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();

  const { urls, fetchedAny } = await collectSitemapUrls(sitemapUrl, 0);
  if (!fetchedAny) {
    return {
      status: 'SKIPPED',
      reason:
        'No reachable sitemap.xml (checked robots.txt Sitemap: directive and /sitemap.xml) - not every site publishes one, this is not an error.',
    };
  }

  const gaps = [];
  const seen = new Set();
  for (const rawUrl of urls) {
    const canonical = canonicalizePath(rawUrl, baseUrl);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    if (!knownPaths.has(canonical)) gaps.push({ sitemapUrl: rawUrl, canonicalPath: canonical });
  }

  return { status: 'CHECKED', sitemapUrl, totalSitemapUrls: urls.length, gaps };
}

const result = await check();
process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
`;
}
