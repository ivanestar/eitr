import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { applyManual, loadProfileFile } from '../src/detect/manual.js';
import type { StackProfile } from '../src/types/stack-profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function baseProfile(): StackProfile {
  return {
    schemaVersion: 1,
    framework: {
      value: 'react',
      confidence: 'high',
      source: 'package.json',
      evidence: [{ file: 'package.json', matchedPattern: 'react' }],
    },
    uiLibraries: [],
    packageManager: {
      value: 'npm',
      confidence: 'high',
      source: 'lockfile',
      evidence: [{ file: 'package-lock.json', matchedPattern: 'package-lock.json' }],
    },
    playwrightVersion: {
      value: '1.51.1',
      confidence: 'high',
      source: 'package.json',
      evidence: [{ file: 'package.json', matchedPattern: '@playwright/test' }],
    },
    moduleSystem: { value: 'CJS', confidence: 'high', source: 'default', evidence: [] },
    testIdAttribute: { value: 'data-testid', confidence: 'high', source: 'default', evidence: [] },
    selectorStrategy: { value: 'role-first', confidence: 'high', source: 'default', evidence: [] },
    target: { kind: 'single', root: '/fake/cwd' },
  };
}

describe('applyManual', () => {
  it('unknown keys throw', () => {
    expect(() => applyManual(baseProfile(), { nope: 'x' })).toThrow(/unknown --manual key/);
  });

  it('overrides framework, packageManager, moduleSystem, testIdAttribute, selectorStrategy, playwrightVersion with source manual', () => {
    const next = applyManual(baseProfile(), {
      framework: 'react',
      packageManager: 'pnpm',
      moduleSystem: 'ESM',
      testIdAttribute: 'data-qa',
      selectorStrategy: 'testid-first',
      playwrightVersion: '1.52.0',
    });

    expect(next.framework).toEqual({
      value: 'react',
      confidence: 'high',
      source: 'manual',
      evidence: [{ file: '--manual', matchedPattern: 'framework' }],
    });
    expect(next.packageManager.value).toBe('pnpm');
    expect(next.packageManager.source).toBe('manual');
    expect(next.moduleSystem.value).toBe('ESM');
    expect(next.moduleSystem.source).toBe('manual');
    expect(next.testIdAttribute.value).toBe('data-qa');
    expect(next.testIdAttribute.source).toBe('manual');
    expect(next.selectorStrategy.value).toBe('testid-first');
    expect(next.selectorStrategy.source).toBe('manual');
    expect(next.playwrightVersion.value).toBe('1.52.0');
    expect(next.playwrightVersion.source).toBe('manual');
  });

  it('creates a mui UiLibrary entry via mui.version when none was detected', () => {
    const next = applyManual(baseProfile(), { 'mui.version': '5.16.0' });
    const mui = next.uiLibraries.find((u) => u.id === 'mui');
    expect(mui).toEqual({
      id: 'mui',
      version: '5.16.0',
      dependencyKind: 'direct',
      confidence: 'high',
      source: 'manual',
      evidence: [{ file: '--manual', matchedPattern: 'mui.version' }],
    });
  });

  it('overwrites an existing mui UiLibrary entry via mui.version', () => {
    const profile = baseProfile();
    profile.uiLibraries.push({
      id: 'mui',
      version: '5.14.0',
      dependencyKind: 'direct',
      confidence: 'medium',
      source: 'package.json',
      evidence: [{ file: 'package.json', matchedPattern: '@mui/material' }],
    });
    const next = applyManual(profile, { 'mui.version': '5.16.0' });
    expect(next.uiLibraries).toHaveLength(1);
    expect(next.uiLibraries[0]?.version).toBe('5.16.0');
    expect(next.uiLibraries[0]?.source).toBe('manual');
  });

  it('rejects an invalid enum value for a closed-set field', () => {
    expect(() => applyManual(baseProfile(), { packageManager: 'bower' })).toThrow(/packageManager/);
    expect(() => applyManual(baseProfile(), { moduleSystem: 'UMD' })).toThrow(/moduleSystem/);
    expect(() => applyManual(baseProfile(), { selectorStrategy: 'nonsense' })).toThrow(
      /selectorStrategy/,
    );
    expect(() => applyManual(baseProfile(), { framework: 'ember' })).toThrow(/framework/);
  });

  it('does not mutate the input profile', () => {
    const profile = baseProfile();
    const next = applyManual(profile, { testIdAttribute: 'data-qa' });
    expect(profile.testIdAttribute.value).toBe('data-testid');
    expect(next.testIdAttribute.value).toBe('data-qa');
  });

  it('tags evidence with a custom evidence file (e.g. a --profile path)', () => {
    const next = applyManual(baseProfile(), { testIdAttribute: 'data-qa' }, '/fake/profile.json');
    expect(next.testIdAttribute.evidence).toEqual([
      { file: '/fake/profile.json', matchedPattern: 'testIdAttribute' },
    ]);
  });
});

describe('loadProfileFile', () => {
  it('reads a flat JSON object of string keys', () => {
    const path = resolve(__dirname, 'fixtures', 'manual-profile.json');
    expect(loadProfileFile(path)).toEqual({ testIdAttribute: 'data-test-id-custom' });
  });
});
