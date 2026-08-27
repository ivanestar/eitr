import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// PER-FILE staging into cwd/.eitr-tmp (same volume) + fs.rename onto the final path
// (rename-over-existing-FILE works on Windows via MoveFileEx REPLACE_EXISTING) — each file is
// all-or-nothing. This per-file atomic rename + path-authority regenerate IS the no-wedge
// crash-safety guarantee (ARCHITECTURE §8); no two-phase journal is needed in Slice 1.
export async function stageAndRename(
  cwd: string,
  relPath: string,
  contents: string,
): Promise<void> {
  const finalPath = path.join(cwd, relPath);
  const tmpDir = path.join(cwd, '.eitr-tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  const unique = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const tmpPath = path.join(tmpDir, `${path.basename(finalPath)}.${unique}.tmp`);
  await fs.writeFile(tmpPath, contents, 'utf8');
  await fs.rename(tmpPath, finalPath);
}

// Single-file atomic writer — used by apply() to write .eitr/manifest.json without touching
// the rest of the tree. Same underlying primitive as stageAndRename (apply's per-file loop).
export async function writeFileAtomic(
  cwd: string,
  relPath: string,
  contents: string,
): Promise<void> {
  await stageAndRename(cwd, relPath, contents);
}

// One-line clobber warning (D4's warn-only intent) — no unified-diff body/`diff` dependency in
// Slice 1.
export function warnClobbered(relPath: string): void {
  console.warn(`eitr: overwriting hand-edited owned file (regenerate policy): ${relPath}`);
}
