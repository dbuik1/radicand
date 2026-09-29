/**
 * Guard the two committed MathLive-derived indexes against a MathLive upgrade.
 *
 * src/assets/command-index.json (the `\`-finder's commands) and
 * src/assets/symbol-index.json (the symbol search) are both read out of the
 * installed MathLive by their generator scripts and committed, so a dependency
 * bump would silently leave the finder and the search offering the previous
 * version's commands. Each file's stamp must match the installed MathLive;
 * if one does not, the build fails here with the command that fixes it. The
 * derived auto-accept map (src/assets/auto-accept-index.json) is re-derived
 * and compared too.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAutoAcceptMap } from './auto-accept-map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installed = JSON.parse(
  readFileSync(path.join(ROOT, 'node_modules/mathlive/package.json'), 'utf8'),
).version;

const INDEXES = [
  {
    file: 'src/assets/command-index.json',
    label: 'command index',
    count: (index) => `${index.commands.length} commands`,
    regenerate: 'npm run commands:generate',
  },
  {
    file: 'src/assets/symbol-index.json',
    label: 'symbol index',
    count: (index) => `${index.entries.length} symbols`,
    // The symbol generator downloads its two source datasets into
    // scripts/.cache/ on first run, so it needs network access at that point.
    regenerate: 'npm run symbols:generate',
  },
];

let stale = false;
for (const { file, label, count, regenerate } of INDEXES) {
  const index = JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
  if (index.mathlive !== installed) {
    stale = true;
    console.error(
      `✗ ${label} is stale: generated from MathLive ${index.mathlive}, ` +
        `but ${installed} is installed.\n  Run: ${regenerate}`,
    );
    continue;
  }
  console.log(`✓ ${label} check passed: ${count(index)} from MathLive ${installed}.`);
}

// The auto-accept map must be exactly what the command index and the
// candidate list derive today: a regenerated command index, an edited
// candidate list or a new MathLive all change it.
const commandIndex = JSON.parse(
  readFileSync(path.join(ROOT, 'src/assets/command-index.json'), 'utf8'),
);
const candidates = JSON.parse(
  readFileSync(path.join(ROOT, 'src/assets/auto-accept-candidates.json'), 'utf8'),
).candidates;
const committed = readFileSync(path.join(ROOT, 'src/assets/auto-accept-index.json'), 'utf8');
const expected =
  JSON.stringify(buildAutoAcceptMap(commandIndex.commands, candidates, commandIndex.mathlive), null, 1) +
  '\n';
if (committed === expected) {
  const map = JSON.parse(committed);
  console.log(`✓ auto-accept map check passed: ${map.names.length} names complete by themselves.`);
} else {
  stale = true;
  console.error('✗ auto-accept map is stale.\n  Run: npm run commands:generate');
}
if (stale) process.exit(1);
