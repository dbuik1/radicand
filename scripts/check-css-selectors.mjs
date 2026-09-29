/**
 * Guard: every class and id selector in src/ui/styles.css must be one the
 * panel actually renders – a name that appears in a non-test source file
 * under src/ or in an HTML entry. A rule whose selector nothing emits is
 * dead weight that still ships, and it tells the next reader the element
 * exists.
 *
 * MathLive's own class names (`ML__…`) are rendered inside the field by the
 * library, so they are exempt.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stylesheet = join(root, 'src', 'ui', 'styles.css');

/** Every referent file: non-test TypeScript and HTML under src/. */
function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'assets') yield* sourceFiles(path);
    } else if (/\.(ts|html)$/.test(entry) && !/\.(test|d)\.ts$/.test(entry)) {
      yield path;
    }
  }
}

const source = [...sourceFiles(join(root, 'src'))]
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

/** The selector text before each `{`, comments removed, at-rule preludes skipped. */
function selectors(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{};]*)\{/g;
  let match;
  while ((match = re.exec(stripped)) !== null) {
    const text = match[1].trim();
    if (text === '' || text.startsWith('@')) continue;
    out.push({ text, line: stripped.slice(0, match.index).split('\n').length });
  }
  return out;
}

const orphans = [];
const seen = new Set();
for (const { text, line } of selectors(readFileSync(stylesheet, 'utf8'))) {
  // `::part(name)` names shadow parts, not classes; drop them before scanning.
  const plain = text.replace(/::part\([^)]*\)/g, '');
  for (const [, kind, name] of plain.matchAll(/([.#])([a-zA-Z_][\w-]*)/g)) {
    const key = kind + name;
    if (seen.has(key)) continue;
    seen.add(key);
    if (name.startsWith('ML__')) continue;
    const referenced = new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`).test(source);
    if (!referenced) orphans.push(`  - styles.css:${line}  ${key}`);
  }
}

if (orphans.length > 0) {
  console.error('✗ stylesheet check failed: selector(s) that nothing in src/ renders:');
  for (const orphan of orphans) console.error(orphan);
  console.error('\nDelete the rule, or name the element that carries the class or id.');
  process.exit(1);
}
console.log(`✓ stylesheet check passed: all ${seen.size} class and id selectors are rendered.`);
