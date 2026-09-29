/**
 * Generate the `\`-finder's command index (src/assets/command-index.json).
 *
 * The finder in src/sidepanel/editor/finder.ts replaces MathLive's own
 * suggestion popover, so it needs MathLive's list of command names. MathLive
 * does not export it: `suggest()` reads the module-private LATEX_COMMANDS and
 * MATH_SYMBOLS tables. This script reads the same names out of the installed
 * bundle's source instead, so the finder offers exactly what this MathLive
 * version can parse.
 *
 * Run with `npm run commands:generate` after a MathLive upgrade. The output is
 * committed and stamped with the MathLive version it came from; the build
 * refuses a stamp that no longer matches the installed dependency
 * (scripts/check-command-index.mjs), so the list cannot go stale unnoticed.
 * Everything here is offline – it only reads node_modules and the symbol
 * index beside it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAutoAcceptMap } from './auto-accept-map.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SOURCE = path.join(ROOT, 'node_modules', 'mathlive', 'mathlive.mjs');
const SYMBOLS = path.join(ROOT, 'src', 'assets', 'symbol-index.json');
const OUT = path.join(ROOT, 'src', 'assets', 'command-index.json');
const CANDIDATES = path.join(ROOT, 'src', 'assets', 'auto-accept-candidates.json');
const AUTO_ACCEPT_OUT = path.join(ROOT, 'src', 'assets', 'auto-accept-index.json');

const source = readFileSync(SOURCE, 'utf8');
const names = new Set();

/** A finder candidate: typed as `\` + letters, so letters only. */
const add = (name) => {
  if (typeof name !== 'string') return;
  if (!/^[a-zA-Z]{2,}$/.test(name)) return;
  names.add(name);
};

// 1. defineFunction("name", …) and defineFunction(["a", "b"], …) – the
//    commands that take arguments (\frac, \sqrt, \operatorname, styles…).
for (const match of source.matchAll(/defineFunction\(\s*"((?:[^"\\]|\\.)*)"/g)) {
  add(match[1]);
}
for (const match of source.matchAll(/defineFunction\(\s*\[([^\]]*)\]/g)) {
  for (const part of match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) add(part[1]);
}

// 2. defineFunction(Object.keys(TABLE), …) – two calls name their commands
//    through a table (the accents, and the extensible symbols \int lives in),
//    each a plain object literal earlier in the bundle.
for (const call of source.matchAll(/defineFunction\(\s*Object\.keys\((\w+)\)/g)) {
  const table = new RegExp(`var ${call[1]} = \\{([^}]*)\\}`).exec(source);
  if (!table) {
    console.warn(`table ${call[1]} not found – its commands are missing`);
    continue;
  }
  for (const part of table[1].matchAll(/(?:^|,)\s*"?([a-zA-Z]+)"?\s*:/g)) add(part[1]);
}

// 3. defineSymbol("\\name", …) and defineSymbols([["\\name", …], …]) – the
//    symbols and their variants (\forall, \nabla, the Greek letters…).
for (const match of source.matchAll(/defineSymbols?\(\s*(\[[\s\S]*?\n\]|"(?:[^"\\]|\\.)*")/g)) {
  for (const part of match[1].matchAll(/"\\\\([a-zA-Z]+)"/g)) add(part[1]);
}

// 4. DEFAULT_MACROS – \iff, \differentialD and friends parse like commands.
const macros = /var DEFAULT_MACROS = \{([\s\S]*?)\n\};/.exec(source);
if (macros) {
  for (const part of macros[1].matchAll(/^ {2}"?([a-zA-Z]+)"?\s*:/gm)) add(part[1]);
} else {
  console.warn('DEFAULT_MACROS table not found – macro commands are missing');
}

// The symbol index already knows how each command is best inserted (\sqrt as
// `\sqrt{#?}`, so the caret lands in the radicand) and what to call it in
// prose. The finder joins the two at runtime; this is only a sanity report.
const indexed = new Set();
for (const entry of JSON.parse(readFileSync(SYMBOLS, 'utf8')).entries) {
  const name = /^\\([a-zA-Z]+)/.exec(entry.c);
  if (name) indexed.add(name[1]);
}

const commands = [...names].sort();
const output = {
  // Bump when the shape changes; the loader checks it.
  version: 1,
  source: "Command names read from the installed MathLive's LATEX_COMMANDS, MATH_SYMBOLS and macro tables.",
  mathlive: JSON.parse(readFileSync(path.join(ROOT, 'node_modules/mathlive/package.json'), 'utf8'))
    .version,
  commands,
};

writeFileSync(OUT, JSON.stringify(output));

// The auto-accept map is derived from the command list just written, so the
// two can never disagree (scripts/auto-accept-map.mjs holds the rule).
const candidates = JSON.parse(readFileSync(CANDIDATES, 'utf8')).candidates;
const autoAccept = buildAutoAcceptMap(commands, candidates, output.mathlive);
writeFileSync(AUTO_ACCEPT_OUT, JSON.stringify(autoAccept, null, 1) + '\n');
console.log(
  `wrote ${path.relative(ROOT, AUTO_ACCEPT_OUT)}: ${autoAccept.names.length} of ` +
    `${candidates.length} candidates auto-accept, ` +
    `${Object.keys(autoAccept.ambiguous).length} need confirming`,
);
const described = commands.filter((name) => indexed.has(name)).length;
console.log(
  `wrote ${commands.length} command names to ${path.relative(ROOT, OUT)} ` +
    `(${described} also described in the symbol index) – ` +
    `${(JSON.stringify(output).length / 1024).toFixed(1)} KB`,
);
