#!/usr/bin/env node

/**
 * Reports whether this repository's pinned Playwright versions have fallen behind their registries,
 * and whether a matching container image actually exists for each candidate upgrade.
 *
 * The generated projects pin Playwright to an exact version on purpose. Playwright ships browser
 * binaries matched to the exact library release, and its own documentation is explicit that a
 * container image whose version differs from the project's leaves it "unable to locate browser
 * executables" - so a floating range would break the pipelines this generator writes on the day any
 * minor lands. The cost of that correctness is that an exact pin silently ages, which is what this
 * script exists to make visible.
 *
 * The one rule worth stating up front, because getting it wrong is how a pin bump breaks a stack
 * that was working: a version is only safe to move to when BOTH its language registry AND its
 * container image publish it. Playwright releases JavaScript first and the other bindings follow
 * separately - live-observed at 1.63.0, which existed on npm and as mcr.microsoft.com/playwright
 * while PyPI, Maven Central, NuGet and the per-language images all still stopped at 1.62.0. Deriving
 * a Python image tag from the npm version there would have written a Dockerfile pointing at an image
 * that does not exist.
 *
 * Usage:
 *   node scripts/check-playwright-version.mjs
 *   node scripts/check-playwright-version.mjs --json
 *   node scripts/check-playwright-version.mjs --fail-on-stale
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEMPLATES = path.join(REPO_ROOT, 'packages', 'engine', 'src', 'plan', 'templates');

// Every pin is read out of the file that actually renders it, never restated here - a checker
// carrying its own copy of the numbers it checks is one edit away from validating a fiction.
//
// One stack, because one stack is generated. The Python, Java and C# entries were removed with the
// freeze: their pins are still in the templates and still valid, but nothing produces a project
// from them, so reporting them as behind would be asking for maintenance on something explicitly
// unmaintained. Unfreezing a stack means restoring its entry here alongside the questionnaire
// choice - and the image-tag check below still covers every rendered playwright image, frozen ones
// included, since a template that renders an unresolvable tag is a broken template either way.
export const STACKS = [
  {
    id: 'typescript',
    label: 'TypeScript (npm)',
    pin: { file: path.join(TEMPLATES, 'package-json.ts'), re: /'@playwright\/test': '([^']+)'/ },
    image: 'playwright',
    latest: async () => await npmLatest('@playwright/test'),
  },
];

// Where each rendered image tag lives, so a pin that was bumped in one file and missed in another
// is reported rather than discovered by whoever runs the pipeline.
const IMAGE_SOURCES = [path.join(TEMPLATES, 'docker.ts'), path.join(TEMPLATES, 'cicd.ts')];

async function getText(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'playwright-pin-check' } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function getJson(url) {
  const text = await getText(url);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function npmLatest(pkg) {
  const data = await getJson('https://registry.npmjs.org/' + encodeURIComponent(pkg) + '/latest');
  return data?.version ?? null;
}

const mcrTagCache = new Map();
async function mcrTags(repo) {
  if (mcrTagCache.has(repo)) return mcrTagCache.get(repo);
  const data = await getJson('https://mcr.microsoft.com/v2/' + repo + '/tags/list');
  const tags = data?.tags ?? null;
  mcrTagCache.set(repo, tags);
  return tags;
}

// "Does an image exist for this version" means any tag naming it, across the distro variants the
// registry publishes - the templates use -jammy today, but a bump that only shipped -noble is still
// a real answer to report rather than a silent "no".
async function imageTagsFor(repo, version) {
  const tags = await mcrTags(repo);
  if (tags === null) return null;
  return tags.filter((tag) => tag === 'v' + version || tag.startsWith('v' + version + '-')).sort();
}

export function readPin(pin) {
  let text;
  try {
    text = fs.readFileSync(pin.file, 'utf8');
  } catch {
    return null;
  }
  return text.match(pin.re)?.[1] ?? null;
}

export function readRenderedImageTags() {
  const found = new Map();
  for (const file of IMAGE_SOURCES) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(/mcr\.microsoft\.com\/(playwright(?:\/[a-z]+)?):(v[\w.-]+)/g)) {
      const key = m[1] + ':' + m[2];
      const entry = found.get(key) || { repo: m[1], tag: m[2], files: new Set() };
      entry.files.add(path.relative(REPO_ROOT, file).replace(/\\/g, '/'));
      found.set(key, entry);
    }
  }
  return [...found.values()];
}

export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

async function checkStack(stack) {
  const pinned = readPin(stack.pin);
  const latest = await stack.latest();
  const result = {
    stack: stack.id,
    label: stack.label,
    pinned,
    latest,
    behind: null,
    upgradeImageTags: null,
    safeToBump: null,
    note: null,
  };

  if (pinned === null) {
    result.note =
      'could not read the pinned version from ' + path.relative(REPO_ROOT, stack.pin.file);
    return result;
  }
  if (latest === null) {
    result.note = 'registry unreachable - no conclusion drawn';
    return result;
  }

  result.behind = compareVersions(pinned, latest) < 0;
  if (!result.behind) return result;

  const tags = await imageTagsFor(stack.image, latest);
  if (tags === null) {
    result.note = 'could not list mcr.microsoft.com/' + stack.image + ' tags - no conclusion drawn';
    return result;
  }
  result.upgradeImageTags = tags;
  result.safeToBump = tags.length > 0;
  result.note = result.safeToBump
    ? null
    : 'mcr.microsoft.com/' +
      stack.image +
      ' has no image for ' +
      latest +
      ' yet - bumping this stack now would point its Dockerfile and pipeline at an image that does not exist';
  return result;
}

async function checkRenderedImages() {
  const out = [];
  for (const entry of readRenderedImageTags()) {
    const tags = await mcrTags(entry.repo);
    out.push({
      image: 'mcr.microsoft.com/' + entry.repo + ':' + entry.tag,
      files: [...entry.files].sort(),
      exists: tags === null ? null : tags.includes(entry.tag),
    });
  }
  return out;
}

function render(report) {
  const lines = [];
  lines.push('Playwright pins');
  lines.push('');
  for (const s of report.stacks) {
    let state;
    if (s.pinned === null || s.latest === null) state = 'unknown';
    else if (!s.behind) state = 'current';
    else if (s.safeToBump) state = 'BEHIND, upgrade available';
    else state = 'behind, but blocked';
    lines.push('  ' + s.label);
    lines.push(
      '    pinned ' + (s.pinned ?? '?') + '   latest ' + (s.latest ?? '?') + '   ' + state,
    );
    if (s.upgradeImageTags && s.upgradeImageTags.length > 0) {
      lines.push('    image  ' + s.upgradeImageTags.join(', '));
    }
    if (s.note) lines.push('    note   ' + s.note);
    lines.push('');
  }

  const broken = report.renderedImages.filter((i) => i.exists === false);
  lines.push('Image tags written into the templates');
  if (broken.length === 0) {
    lines.push('  all ' + report.renderedImages.length + ' resolve on the registry');
  } else {
    for (const image of broken) {
      lines.push('  MISSING ' + image.image + '  (' + image.files.join(', ') + ')');
    }
  }
  lines.push('');
  lines.push(
    report.staleStacks.length === 0
      ? "Nothing to do: every stack is on its registry's latest."
      : 'Behind: ' + report.staleStacks.join(', ') + '.',
  );
  if (report.staleStacks.length > 0) {
    lines.push(
      'Bump a stack only when its own registry AND its own image both publish the version - they ' +
        'do not release together.',
    );
  }
  return lines.join('\n');
}

async function main() {
  const json = process.argv.includes('--json');
  const failOnStale = process.argv.includes('--fail-on-stale');

  const stacks = [];
  for (const stack of STACKS) stacks.push(await checkStack(stack));
  const renderedImages = await checkRenderedImages();

  const report = {
    checkedAt: new Date().toISOString(),
    stacks,
    renderedImages,
    staleStacks: stacks.filter((s) => s.behind === true).map((s) => s.stack),
    missingImages: renderedImages.filter((i) => i.exists === false).map((i) => i.image),
  };

  process.stdout.write(json ? JSON.stringify(report, null, 2) + '\n' : render(report) + '\n');

  // A missing image tag is a real defect in what this repository ships and always fails. A stack
  // being behind is news, not a defect - a Playwright release is not a broken build - so it only
  // fails when someone explicitly asks for that gate.
  if (report.missingImages.length > 0) process.exit(1);
  if (failOnStale && report.staleStacks.length > 0) process.exit(1);
}

// Only runs as a CLI, so the pure helpers above can be imported and tested without hitting the
// network.
if (process.argv[1] && process.argv[1].endsWith('check-playwright-version.mjs')) {
  main();
}
