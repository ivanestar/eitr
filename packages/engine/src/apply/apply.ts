import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { GenerationPlan, FileDescriptor } from '../types/generation-plan.js';
import type { Manifest } from '../types/manifest.js';
import { encodeJson } from '../persist/json-codec.js';
import { stageAndRename, writeFileAtomic } from './fs-atomic.js';

// The public ApplyResult shape (re-exported by the engine index).
export interface ApplyResult {
  cwd: string;
  written: string[];
  skipped: string[];
}

export interface ApplyOptions {
  // Flags the written manifest's profile as a pre-recon placeholder (see Manifest.pendingRecon).
  pendingRecon?: boolean;
}

async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

// Injected by esbuild at bundle-time (dist/bin/eitr.js -> dist/assets/ = '../assets').
// Falls back to '../../assets' in compiled dev mode (packages/engine/dist/apply/apply.js).
declare const EITR_ASSETS_RELPATH: string | undefined;

async function resolveAssetSource(assetId: string): Promise<string> {
  const assetsBase =
    typeof EITR_ASSETS_RELPATH !== 'undefined' ? EITR_ASSETS_RELPATH : '../../assets';
  const url = new URL(`${assetsBase}/runtime/${assetId}`, import.meta.url);
  return fs.readFile(url, 'utf8');
}

async function renderFileContents(file: FileDescriptor): Promise<string> {
  switch (file.source.kind) {
    case 'inline':
      return file.source.text;
    case 'asset':
      return resolveAssetSource(file.source.assetId);
    default: {
      const exhaustive: never = file.source;
      throw new Error(`apply(): unhandled FileSource kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

// IO: per-file stage+rename for every FileDescriptor, enforcing writePolicy, then writes the
// minimal manifest ONCE atomically at the end.
export async function apply(
  genPlan: GenerationPlan,
  cwd: string,
  opts: ApplyOptions = {},
): Promise<ApplyResult> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of genPlan.files) {
    const targetPath = path.join(cwd, file.path);

    if (file.writePolicy === 'merge-fragment') {
      throw new Error('merge-fragment not implemented');
    }

    if (file.writePolicy !== 'create-if-absent') {
      const exhaustive: never = file.writePolicy;
      throw new Error(`apply(): unhandled writePolicy: ${JSON.stringify(exhaustive)}`);
    }

    if (await fileExists(targetPath)) {
      skipped.push(file.path);
      continue;
    }
    const contents = await renderFileContents(file);
    await stageAndRename(cwd, file.path, contents);
    written.push(file.path);
  }

  const manifest: Manifest = {
    manifestSchemaVersion: 1,
    engineVersion: genPlan.engineVersion,
    generatedAt: new Date().toISOString(),
    profile: genPlan.profile,
    files: genPlan.files.map((f) => ({ path: f.path, writePolicy: f.writePolicy })),
    ...(opts.pendingRecon ? { pendingRecon: true } : {}),
  };

  await writeFileAtomic(cwd, '.scaffold/manifest.json', encodeJson(manifest));
  written.push('.scaffold/manifest.json');

  // Remove the now-empty staging dir so the generated project ships clean.
  await fs.rm(path.join(cwd, '.scaffold-tmp'), { recursive: true, force: true });

  return { cwd, written, skipped };
}

async function fileExists(filePath: string): Promise<boolean> {
  return (await readIfExists(filePath)) !== undefined;
}
