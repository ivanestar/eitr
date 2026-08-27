import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const srcDir = path.join(root, 'assets/runtime');
const outDir = path.join(root, 'assets/runtime-js');

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}

const files = walk(srcDir);
for (const file of files) {
  const relPath = path.relative(srcDir, file);

  if (!file.endsWith('.ts')) {
    // Copy non-TS files (like README.md) directly
    const destPath = path.join(outDir, relPath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(file, destPath);
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');
  // Transpile TS to JS (stripping types)
  const transpiled = ts.transpileModule(content, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
    },
  });

  let transpiledText = transpiled.outputText;
  // Rewrite relative imports/exports without .js extension (e.g. from './component' -> from './component.js')
  transpiledText = transpiledText.replace(
    /(from|import)\s+(['"])(\.[^'"]+)\2/g,
    (match, p1, p2, relImport) => {
      if (relImport.endsWith('.js')) return match;
      const currentFileDir = path.dirname(file);
      const resolvedPath = path.resolve(currentFileDir, relImport);
      if (fs.existsSync(resolvedPath + '.ts')) {
        return `${p1} ${p2}${relImport}.js${p2}`;
      } else if (fs.existsSync(path.join(resolvedPath, 'index.ts'))) {
        return `${p1} ${p2}${relImport}/index.js${p2}`;
      }
      return match;
    },
  );

  // Format with Prettier
  let formattedText = transpiledText;
  try {
    formattedText = await prettier.format(transpiledText, {
      parser: 'babel',
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
    });
  } catch {
    // fallback if formatting fails
  }

  // Change extension from .ts to .js
  const destPath = path.join(outDir, relPath.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, formattedText, 'utf8');
}

console.log('Successfully compiled TS runtime assets to JS.');
