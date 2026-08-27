import { describe, it, expect } from 'vitest';
import { detectPresence } from '../src/detect/package-json.js';
import type { PackageJson } from '../src/detect/package-json.js';

describe('detectPresence (package.json parser)', () => {
  it('detects react and tailwindcss simultaneously', () => {
    const pkg: PackageJson = {
      dependencies: {
        react: '^18.2.0',
        tailwindcss: '^3.3.0',
      },
    };
    const presence = detectPresence(pkg);
    expect(presence.framework).toBe('react');
    expect(presence.frameworkRange).toBe('^18.2.0');
    expect(presence.tailwind).toBe(true);
    expect(presence.tailwindRange).toBe('^3.3.0');
    expect(presence.mui).toBe(false);
  });

  it('detects vue and antd simultaneously', () => {
    const pkg: PackageJson = {
      dependencies: {
        vue: '^3.3.0',
        antd: '^5.8.0',
      },
    };
    const presence = detectPresence(pkg);
    expect(presence.framework).toBe('vue');
    expect(presence.frameworkRange).toBe('^3.3.0');
    expect(presence.antd).toBe(true);
    expect(presence.antdRange).toBe('^5.8.0');
    expect(presence.mui).toBe(false);
  });

  it('detects svelte and radix simultaneously', () => {
    const pkg: PackageJson = {
      devDependencies: {
        svelte: '^4.0.0',
        '@radix-ui/react-select': '^1.0.0',
      },
    };
    const presence = detectPresence(pkg);
    expect(presence.framework).toBe('svelte');
    expect(presence.radix).toBe(true);
    expect(presence.radixDepName).toBe('@radix-ui/react-select');
    expect(presence.radixRange).toBe('^1.0.0');
  });

  it('detects angular and chakra simultaneously', () => {
    const pkg: PackageJson = {
      dependencies: {
        '@angular/core': '^16.0.0',
        '@chakra-ui/react': '^2.8.0',
      },
    };
    const presence = detectPresence(pkg);
    expect(presence.framework).toBe('angular');
    expect(presence.chakra).toBe(true);
    expect(presence.chakraDepName).toBe('@chakra-ui/react');
    expect(presence.chakraRange).toBe('^2.8.0');
  });
});
