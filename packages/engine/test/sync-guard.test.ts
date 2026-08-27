import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const START_MARKER = '// #region';
const END_MARKER = '// #endregion';

// Extracts the text strictly BETWEEN the marker lines (markers themselves excluded), after
// normalizing CRLF -> LF so the comparison is platform-stable (see .gitattributes).
function extractSharedRegion(filePath: string): string {
  const text = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const start = text.indexOf(START_MARKER);
  const end = text.indexOf(END_MARKER);
  if (start === -1) throw new Error(`start marker "${START_MARKER}" not found in ${filePath}`);
  if (end === -1) throw new Error(`end marker "${END_MARKER}" not found in ${filePath}`);
  if (end < start) throw new Error(`end marker precedes start marker in ${filePath}`);
  const afterStartLine = text.indexOf('\n', start) + 1;
  return text.slice(afterStartLine, end);
}

describe('sync-guard: marked shared regions stay byte-identical (after LF normalization)', () => {
  it('locator-spec.ts <-> assets/runtime/components/base/scope.ts', () => {
    const canonical = extractSharedRegion(resolve(__dirname, '../src/types/locator-spec.ts'));
    const mirror = extractSharedRegion(
      resolve(__dirname, '../assets/runtime/components/base/scope.ts'),
    );
    expect(mirror).toBe(canonical);
  });

  it('descriptor.ts <-> assets/runtime/components/base/descriptor.ts', () => {
    const canonical = extractSharedRegion(resolve(__dirname, '../src/types/descriptor.ts'));
    const mirror = extractSharedRegion(
      resolve(__dirname, '../assets/runtime/components/base/descriptor.ts'),
    );
    expect(mirror).toBe(canonical);
  });
});
