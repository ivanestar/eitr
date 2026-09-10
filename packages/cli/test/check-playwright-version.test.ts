import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STACKS,
  readPin,
  readRenderedImageTags,
  compareVersions,
} from '../../../scripts/check-playwright-version.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const scriptPath = path.resolve(repoRoot, 'scripts/check-playwright-version.mjs');

describe('compareVersions', () => {
  it('orders releases by major, minor and patch', () => {
    expect(compareVersions('1.62.0', '1.63.0')).toBe(-1);
    expect(compareVersions('1.63.0', '1.62.0')).toBe(1);
    expect(compareVersions('1.63.0', '1.63.0')).toBe(0);
    expect(compareVersions('1.62.1', '1.62.0')).toBe(1);
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('treats an absent patch component as zero rather than NaN', () => {
    expect(compareVersions('1.63', '1.63.0')).toBe(0);
    expect(compareVersions('1.63', '1.63.1')).toBe(-1);
  });
});

// The real drift risk. Every pin is read out of the template that renders it, by regex - so
// reformatting one of those templates can silently stop the match, and the checker would report
// "unknown" forever while quietly checking nothing. That failure is invisible in its own output,
// which is exactly why it is asserted here instead.
describe('reading the pins out of the real templates', () => {
  it.each(STACKS.map((s) => [s.id, s] as const))('finds a pinned version for %s', (_id, stack) => {
    const pinned = readPin(stack.pin);
    expect(pinned, `no version matched in ${stack.pin.file}`).not.toBeNull();
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // One stack, because one stack is generated. The frozen languages keep their pins in the
  // templates; nothing checks them for staleness, because nothing produces a project from them.
  it('covers the stack this release generates', () => {
    expect(STACKS.map((s) => s.id)).toEqual(['typescript']);
  });
});

describe('reading the image tags the templates render', () => {
  const tags = readRenderedImageTags();

  it('finds every Playwright image reference and attributes it to a real file', () => {
    expect(tags.length).toBeGreaterThan(0);
    for (const entry of tags) {
      expect(entry.tag).toMatch(/^v\d+\.\d+\.\d+(-[a-z0-9-]+)?$/);
      expect(entry.repo).toMatch(/^playwright(\/(python|java|dotnet))?$/);
      expect([...entry.files].length).toBeGreaterThan(0);
    }
  });

  it('covers the per-language images as well as the base one', () => {
    const repos = new Set(tags.map((entry) => entry.repo));
    expect(repos.has('playwright')).toBe(true);
    expect(repos.has('playwright/python')).toBe(true);
    expect(repos.has('playwright/java')).toBe(true);
    expect(repos.has('playwright/dotnet')).toBe(true);
  });

  // playwright/dotnet publishes noble and resolute variants only - it has never had a jammy tag,
  // and the C# Dockerfile pointed at one until this checker resolved it against the registry.
  it('does not ask playwright/dotnet for a distro variant it never publishes', () => {
    const dotnet = tags.filter((entry) => entry.repo === 'playwright/dotnet');
    expect(dotnet.length).toBeGreaterThan(0);
    for (const entry of dotnet) expect(entry.tag).not.toContain('jammy');
  });
});

describe('the script as a CLI', () => {
  it('emits a machine-readable report and exits 0 when nothing is wrong', () => {
    const res = spawnSync(process.execPath, [scriptPath, '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const report = JSON.parse(res.stdout);

    expect(report.stacks).toHaveLength(1);
    expect(report.renderedImages.length).toBeGreaterThan(0);
    // A rendered tag that does not resolve is a defect in what this repository ships, so it fails
    // regardless of flags. Being behind a release is only news, and never fails on its own.
    expect(report.missingImages).toEqual([]);
    expect(res.status).toBe(0);

    for (const stack of report.stacks) {
      expect(stack.pinned).toMatch(/^\d+\.\d+\.\d+$/);
    }
  }, 60000);
});
