import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Enforces the component-method safety contract as CI-red instead of reviewer memory:
//  - "Never reimplement waiting" -- no manual timers/sleeps; Playwright already auto-waits.
//  - "Avoid non-retrying snapshot booleans" -- no isVisible()/isChecked()/... in shipped components;
//    boolean state is asserted with the retrying expect(locator).toBeVisible()/toBeChecked()/..., and
//    the rare one-shot need reaches x.locator.isVisible() directly (kept visible in review).
// Point-in-time STRING reads (textContent/getAttribute/inputValue) stay legal, but only inside a
// ...Now()-suffixed method. This one convention IS mechanically checked below (unlike the general
// case for arbitrary user code, this file set is closed and known, so a naming check is reliable
// here) - it caught real gaps (Checkbox/RadioButton missing isCheckedNow()) that doc+review missed.
const componentsRoot = fileURLToPath(new URL('../assets/runtime/components/', import.meta.url));

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

// Known Playwright/DOM built-ins matching the (is|has|get)[A-Z]... shape that are never
// themselves a point-in-time state read needing a Now() suffix (mirrors the same exemption set in
// packages/engine/src/plan/templates/cpom-linter.ts's Rule 2, kept in sync by hand).
const STRUCTURAL_GETTER_EXEMPTIONS = new Set([
  'getAttribute',
  'getByRole',
  'getByTestId',
  'getByLabel',
  'getByText',
  'getByAltText',
  'getByPlaceholder',
  'getByTitle',
  'getByDisplayValue',
  'getAnimations',
  'getOwnPropertyDescriptor',
  'getPrototypeOf',
  // Playwright's own Locator boolean predicates - always a call target (e.g. inside a Now()
  // wrapper's body), never a locally-defined method missing its own Now() suffix.
  'isChecked',
  'isVisible',
  'isHidden',
  'isEnabled',
  'isEditable',
  'isDisabled',
]);

const STATE_GETTER_RE = /(?:async\s+)?\b(is|has|get)[A-Z][a-zA-Z0-9_]*\s*\([^)]*\)/;

const COMPONENT_EXTENSIONS = ['.ts', '.js', '.py', '.java', '.cs'];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && COMPONENT_EXTENSIONS.some((ext) => e.name.endsWith(ext)))
    .map((e) => `${(e as unknown as { parentPath: string }).parentPath}/${e.name}`);
}

// The one legitimate way a raw boolean/string snapshot call may appear: as the sole body of a
// method whose own signature already carries the Now() suffix (i.e. the escape hatch IS the
// Now()-suffixed wrapper itself, discoverable by name - not a raw reach-through hidden elsewhere).
// Line-based, so this looks a few lines back for a method signature containing "Now(" before
// hitting the end of a prior block; short methods (the norm in this codebase) fit easily.
function isInsideNowSuffixedMethod(lines: string[], index: number): boolean {
  for (let j = index - 1; j >= 0 && j >= index - 6; j--) {
    const l = lines[j].trim();
    if (
      /\w+Now\s*\(/.test(l) &&
      (l.includes('async') || l.includes('function') || l.includes('def '))
    ) {
      return true;
    }
    if (l === '}' || l === '};' || /^\}\s*$/.test(l)) break;
  }
  return false;
}

describe('component-method safety contract', () => {
  it('no shipped component reimplements waiting or reads a non-retrying boolean snapshot', () => {
    const offenders: string[] = [];
    const allFiles = sourceFiles(componentsRoot);
    for (const file of allFiles) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const { label, re } of FORBIDDEN) {
          if (!re.test(line)) continue;
          if (
            label.startsWith('non-retrying boolean snapshot') &&
            isInsideNowSuffixedMethod(lines, i)
          ) {
            continue; // legitimate one-shot escape hatch, wrapped in a discoverable Now() method
          }
          offenders.push(`${file}:${i + 1} -- ${label}\n    ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('every is*/has*/get* state reader in a shipped TS component ends in Now()', () => {
    const offenders: string[] = [];
    const allFiles = sourceFiles(componentsRoot).filter((f) => f.endsWith('.ts'));
    for (const file of allFiles) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        const match = trimmed.match(STATE_GETTER_RE);
        if (!match || trimmed.includes('Now(') || trimmed.includes('constructor')) return;
        const methodName = match[0]
          .split('(')[0]
          .replace(/^(?:async\s+)/, '')
          .trim();
        const isStateGetter =
          methodName.startsWith('is') ||
          methodName.startsWith('has') ||
          methodName.startsWith('get');
        if (
          isStateGetter &&
          !methodName.endsWith('Now') &&
          !methodName.startsWith('isAttached') &&
          !STRUCTURAL_GETTER_EXEMPTIONS.has(methodName)
        ) {
          offenders.push(
            `${file}:${i + 1} -- "${methodName}" needs a Now() suffix\n    ${trimmed}`,
          );
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
