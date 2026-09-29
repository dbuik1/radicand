/**
 * Guard: every exported value (function, const, let, class) in a non-test
 * source file must be imported somewhere else – another module, a test or a
 * script. `tsc` reports unused locals but never an unused export, so a
 * function that lost its last caller keeps reading as public API. Drop the
 * `export` keyword on a module-private name, or delete the name when nothing
 * in the file uses it either. Exported types are exempt: they cost nothing
 * and describe the module's contract.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIPPED = new Set(['node_modules', 'dist', 'data', 'assets']);

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED.has(entry)) yield* files(path);
    } else if (/\.(ts|mjs|html)$/.test(entry)) {
      yield path;
    }
  }
}

const texts = new Map();
for (const dir of ['src', 'tests', 'scripts']) {
  for (const file of files(join(root, dir))) texts.set(file, readFileSync(file, 'utf8'));
}
for (const file of ['vite.config.ts', 'vitest.config.ts']) {
  texts.set(join(root, file), readFileSync(join(root, file), 'utf8'));
}

/** Exported value names declared in `text`, with their line numbers. */
function exportedValues(text) {
  const names = [];
  const declaration = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of text.matchAll(declaration)) {
    names.push({ name: match[1], line: text.slice(0, match.index).split('\n').length });
  }
  // `export { a, b as c }` lists re-export what the file already declared.
  for (const match of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    const line = text.slice(0, match.index).split('\n').length;
    for (const item of match[1].split(',')) {
      const name = item.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && !name.startsWith('type ')) names.push({ name, line });
    }
  }
  return names;
}

const unused = [];
for (const [file, text] of texts) {
  const inSrc = file.startsWith(join(root, 'src'));
  if (!inSrc || /\.(test|d)\.ts$/.test(file) || !file.endsWith('.ts')) continue;
  for (const { name, line } of exportedValues(text)) {
    const word = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
    let imported = false;
    for (const [other, otherText] of texts) {
      if (other !== file && word.test(otherText)) {
        imported = true;
        break;
      }
    }
    if (!imported) unused.push(`  - ${relative(root, file)}:${line}  ${name}`);
  }
}

if (unused.length > 0) {
  console.error('✗ unused-export check failed: exported value(s) nothing else imports:');
  for (const entry of unused) console.error(entry);
  console.error('\nDrop the `export` keyword, or delete the name if the file does not use it either.');
  process.exit(1);
}
console.log('✓ unused-export check passed: every exported value has an importer.');
