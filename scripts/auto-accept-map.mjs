/**
 * The auto-accept map: which typed `\`-commands may complete by themselves.
 *
 * A command completes on its own only when no other command the editor
 * knows starts with it – otherwise finishing `\le` would take the command
 * away from a user who is typing `\leq`, `\left` or `\lessgtr`. The
 * candidates are the hand-kept wish-list in
 * src/assets/auto-accept-candidates.json; this module keeps the survivors
 * and, for every candidate it drops, the longer names that made it
 * ambiguous.
 *
 * Shared by the generator (scripts/generate-command-index.mjs) and the
 * build check (scripts/check-command-index.mjs), so both derive the map the
 * same way and a committed copy that differs from a fresh derivation fails
 * the build.
 */

/**
 * Commands MathLive parses that its command tables do not list by name
 * (structural `\left`/`\right`, environments, the `\operatorname` functions
 * it also accepts). A candidate that one of these extends must not
 * auto-accept either.
 */
export const EXTRA_COMMANDS = [
  'left', 'right', 'middle', 'begin', 'end', 'bmod', 'pmod', 'pmatrix', 'bmatrix',
  'genfrac', 'arcsinh', 'arccosh', 'arctanh', 'sech', 'csch', 'arcsech', 'arccsch',
];

/**
 * @param {string[]} commands every name in the MathLive command index
 * @param {string[]} candidates the wish-list of auto-accept names
 * @param {string} mathlive the MathLive version the command index came from
 */
export function buildAutoAcceptMap(commands, candidates, mathlive) {
  const known = [...new Set([...commands, ...EXTRA_COMMANDS, ...candidates])].sort();
  const names = [];
  /** @type {Record<string, string[]>} */
  const ambiguous = {};
  for (const name of [...new Set(candidates)].sort()) {
    const longer = known.filter((other) => other !== name && other.startsWith(name));
    if (longer.length === 0) names.push(name);
    else ambiguous[name] = longer;
  }
  return { version: 1, mathlive, extraCommands: EXTRA_COMMANDS, names, ambiguous };
}
