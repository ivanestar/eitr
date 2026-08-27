import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Enforces the component-method safety contract as CI-red instead of reviewer memory:
//  - "Never reimplement waiting" -- no manual timers/sleeps; Playwright already auto-waits.
//  - "Avoid non-retrying snapshot booleans" -- no isVisible()/isChecked()/... in shipped components;
//    boolean state is asserted with the retrying expect(locator).toBeVisible()/toBeChecked()/..., and
//    the rare one-shot need reaches x.locator.isVisible() directly (kept visible in review).
// Point-in-time STRING reads (textContent/getAttribute/inputValue) stay legal, but only inside a
// ...Now()-suffixed method -- that convention is doc+review enforced (naming can't be grepped reliably).
const componentsRoot = fileURLToPath(new URL('../assets/runtime/components/', import.meta.url));
const jsComponentsRoot = fileURLToPath(
  new URL('../assets/runtime-js/components/', import.meta.url),
);

const FORBIDDEN: { label: string; re: RegExp }[] = [
  {
    label: 'manual timer / sleep (reimplements waiting)',
    re: /\b(waitForTimeout|setTimeout|setInterval|sleep|time\.sleep|Thread\.sleep|Task\.Delay)\s*\(/i,
  },
  {
    label: 'non-retrying boolean snapshot (use expect(locator).toBe...)',
    re: /\.(isVisible|isHidden|isChecked|isEnabled|isEditable|isDisabled|is_visible|is_hidden|is_checked|is_enabled|is_editable|is_disabled|IsVisibleAsync|IsHiddenAsync|IsCheckedAsync|IsEnabledAsync|IsEditableAsync|IsDisabledAsync)\s*\(/i,
  },
];

const COMPONENT_EXTENSIONS = ['.ts', '.js', '.py', '.java', '.cs'];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && COMPONENT_EXTENSIONS.some((ext) => e.name.endsWith(ext)))
    .map((e) => `${(e as unknown as { parentPath: string }).parentPath}/${e.name}`);
}

describe('component-method safety contract', () => {
  it('no shipped component reimplements waiting or reads a non-retrying boolean snapshot', () => {
    const offenders: string[] = [];
    const allFiles = [...sourceFiles(componentsRoot), ...sourceFiles(jsComponentsRoot)];
    for (const file of allFiles) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const { label, re } of FORBIDDEN) {
          if (re.test(line)) offenders.push(`${file}:${i + 1} -- ${label}\n    ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
