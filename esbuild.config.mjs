import esbuild from 'esbuild';
import { cp } from 'node:fs/promises';
import { chmodSync } from 'node:fs';

console.log('Bundling EITR CLI for distribution...');

try {
  await esbuild.build({
    entryPoints: ['packages/cli/src/index.ts'],
    bundle: true,
    outfile: 'dist/bin/eitr.js',
    platform: 'node',
    format: 'esm',
    target: 'node18',
    minify: true,
    sourcemap: true,
    define: {
      // Tells the bundled CLI where assets live relative to dist/bin/eitr.js.
      // In compiled dev mode the identifier is absent; apply.ts falls back to '../../assets'.
      EITR_ASSETS_RELPATH: JSON.stringify('../assets'),
    },
  });
  console.log('[OK] CLI bundled to dist/bin/eitr.js');

  // Copy assets over so the CLI can resolve them at runtime
  await cp('packages/engine/assets', 'dist/assets', { recursive: true });
  console.log('[OK] Runtime assets copied to dist/assets');

  // Ensure the binary is executable
  chmodSync('dist/bin/eitr.js', 0o755);
  console.log('[OK] Executable permissions granted');
} catch (err) {
  console.error('Build failed', err);
  process.exit(1);
}
