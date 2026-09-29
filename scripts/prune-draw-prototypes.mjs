/**
 * Transform the COMMITTED draw prototypes (src/assets/draw-prototypes.json)
 * in place – no Detexify dump needed: prune the glyph-twin classes and
 * refresh every class's display name from the committed symbol index, so
 * draw candidates and search results always announce the same names.
 *
 * The twin classes are five pairs of commands that render the very same
 * glyph and mean the same thing (\hbar/\hslash, \emptyset/\varnothing,
 * \triangle/\bigtriangleup, \subsetneq/\varsubsetneq,
 * \trianglelefteq/\unlhd): top-1 between them is a coin toss by
 * construction, and nobody benefits from the two competing for the top
 * slot. The kept command is the conventional one (the search index names
 * the pairs identically); the dropped command stays findable by text
 * search, which carries every symbol.
 *
 * Run manually after regenerating either asset – NEVER as part of the
 * build:
 *
 *   npm run draw:prune            # prune twins + refresh names
 *   npm run draw:prune -- --merge # also fold dropped twins' prototypes
 *                                 # into the kept class (benchmark first)
 *
 * Idempotent without --merge. generate-draw-prototypes.mjs re-creates the
 * dropped classes if it is ever re-run against the dump; re-run this
 * afterwards. The held-out benchmark (bench-draw-recognition.mjs) imports
 * TWIN_CLASSES so fixture drawings of a dropped command count for the
 * kept twin.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dropped command → the byte-identical twin that stays. */
export const TWIN_CLASSES = new Map([
  ['\\hslash', '\\hbar'],
  ['\\varnothing', '\\emptyset'],
  ['\\bigtriangleup', '\\triangle'],
  ['\\varsubsetneq', '\\subsetneq'],
  ['\\unlhd', '\\trianglelefteq'],
]);

/**
 * Human name for a search-index entry – the same rules as the search
 * results (symbol-search.ts displayName) and the prototype generator, so
 * every list announces the same name.
 */
function displayName(entry) {
  const phrase =
    entry.d.split(';')[0]?.trim() ||
    (entry.a ?? '')
      .split(';')
      .map((part) => part.trim())
      .reduce((best, part) => (part.length > best.length ? part : best), '') ||
    entry.c;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function main() {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const ROOT = path.resolve(HERE, '..');
  const PROTO_FILE = path.join(ROOT, 'src', 'assets', 'draw-prototypes.json');
  const merge = process.argv.includes('--merge');
  const outFile = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);

  const data = JSON.parse(readFileSync(PROTO_FILE, 'utf8'));
  const index = JSON.parse(
    readFileSync(path.join(ROOT, 'src', 'assets', 'symbol-index.json'), 'utf8'),
  );
  const byCommand = new Map(index.entries.map((entry) => [entry.c, entry]));

  const dropped = new Map(); // dropped latex → its prototypes
  data.entries = data.entries.filter((entry) => {
    if (!TWIN_CLASSES.has(entry.c)) return true;
    dropped.set(entry.c, entry.p);
    return false;
  });

  let renamed = 0;
  for (const entry of data.entries) {
    if (merge) {
      for (const [droppedLatex, keptLatex] of TWIN_CLASSES) {
        if (entry.c === keptLatex && dropped.has(droppedLatex)) {
          entry.p = [...entry.p, ...dropped.get(droppedLatex)];
        }
      }
    }
    const indexEntry = byCommand.get(entry.c);
    if (!indexEntry) {
      console.warn(`no search-index entry for ${entry.c} – name left as "${entry.n}"`);
      continue;
    }
    const name = displayName(indexEntry);
    if (entry.n !== name) {
      entry.n = name;
      renamed++;
    }
  }

  const target = outFile ? path.resolve(outFile) : PROTO_FILE;
  const serialised = JSON.stringify(data);
  writeFileSync(target, serialised);
  console.log(
    `pruned ${dropped.size} twin classes${merge ? ' (prototypes merged into their twins)' : ''}, ` +
      `renamed ${renamed}; wrote ${data.entries.length} classes to ` +
      `${path.relative(ROOT, target)} – ${(serialised.length / 1024).toFixed(0)} KB`,
  );
}

// Importable for TWIN_CLASSES without side effects (the benchmark does).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
