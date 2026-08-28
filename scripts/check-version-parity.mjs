import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const sources = [
  { label: 'packages/engine/src/version.ts', file: 'packages/engine/src/version.ts', kind: 'version-ts' },
  { label: 'package.json', file: 'package.json', kind: 'package-json' },
  { label: 'packages/cli/package.json', file: 'packages/cli/package.json', kind: 'package-json' },
  { label: 'packages/engine/package.json', file: 'packages/engine/package.json', kind: 'package-json' },
  { label: 'packages/evals/package.json', file: 'packages/evals/package.json', kind: 'package-json' },
  { label: 'CHANGELOG.md (head entry)', file: 'CHANGELOG.md', kind: 'changelog' },
];

function extractVersion(source) {
  const fullPath = path.join(repoRoot, source.file);
  let content;
  try {
    content = readFileSync(fullPath, 'utf8');
  } catch {
    return { ...source, version: null, error: 'MISSING FILE' };
  }

  if (source.kind === 'version-ts') {
    const match = content.match(/ENGINE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return { ...source, version: match ? match[1] : null, error: match ? null : 'PATTERN NOT FOUND' };
  }

  if (source.kind === 'package-json') {
    try {
      const json = JSON.parse(content);
      return { ...source, version: json.version ?? null, error: json.version ? null : 'NO "version" FIELD' };
    } catch {
      return { ...source, version: null, error: 'INVALID JSON' };
    }
  }

  if (source.kind === 'changelog') {
    const match = content.match(/##\s*\[([^\]]+)\]/);
    return { ...source, version: match ? match[1] : null, error: match ? null : 'NO [X.Y.Z] HEADER FOUND' };
  }

  return { ...source, version: null, error: 'UNKNOWN SOURCE KIND' };
}

const results = sources.map(extractVersion);

const versions = results.map((r) => r.version).filter((v) => v !== null);
const counts = new Map();
for (const v of versions) {
  counts.set(v, (counts.get(v) ?? 0) + 1);
}
let expected = null;
let expectedCount = -1;
for (const [v, count] of counts) {
  if (count > expectedCount) {
    expected = v;
    expectedCount = count;
  }
}

const mismatches = results.filter((r) => r.error || r.version !== expected);

function printTable() {
  const rows = results.map((r) => ({
    Source: r.label,
    Version: r.version ?? '(missing)',
    Status: r.error ? `ERROR: ${r.error}` : r.version === expected ? 'OK' : 'MISMATCH',
  }));
  const cols = ['Source', 'Version', 'Status'];
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (vals) => vals.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  console.log(line(cols));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(line(cols.map((c) => row[c])));
  }
}

if (mismatches.length > 0) {
  console.error(`[check-version-parity] Version mismatch detected (expected "${expected}"):`);
  printTable();
  process.exit(1);
} else {
  console.log(`[check-version-parity] OK - all ${results.length} sources agree on version "${expected}".`);
  process.exit(0);
}
