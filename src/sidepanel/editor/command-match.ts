/**
 * Ranking for the `\` finder: which commands a partly-typed `\`-command
 * should offer, and in what order.
 *
 * Kept separate from the finder itself so the ordering can be tested
 * directly – it is the part users feel, and the part most likely to be
 * tuned. Command names come first, then the descriptions: someone who does
 * not know that ∀ is `\forall` can type `\all` and still find it.
 */

/** A command the finder can offer, joined from the two bundled indexes. */
export interface CommandCandidate {
  /** The command name, without its leading backslash. */
  name: string;
  /** What is actually inserted (`\sqrt{#?}`, so the caret lands in the slot). */
  latex: string;
  /** Prose name for the row and the announcement ("Square root"). */
  label: string;
  /** A character for the glyph slot; empty when the index has no symbol. */
  glyph: string;
  /**
   * The words of the symbol index's descriptions and aliases, lower-cased –
   * what `\all` matches in "for all". Empty for a command the index does
   * not describe.
   */
  terms: string[];
  /**
   * Set when the candidate is one of the user's own `\`-triggers (a custom
   * shortcut or a library formula) rather than a MathLive command: the id
   * to record a use against.
   */
  triggerId?: string;
}

/**
 * Description matching needs at least this many letters. One letter starts a
 * word in almost every description, which would bury the command names the
 * user is part-way through typing.
 */
const MIN_DESCRIPTION_QUERY = 2;

/**
 * How many suggestions the finder shows. Six rows fit under the field
 * without the list ever needing to scroll, which keeps it reachable: focus
 * stays in the equation field while it is open, so a scrollable list would
 * have content no keyboard user could reach (WCAG 2.1.1).
 */
export const MAX_SUGGESTIONS = 6;

/** Where in a candidate's terms the query first appears, or -1. */
function termRank(candidate: CommandCandidate, query: string): number {
  return candidate.terms.findIndex((term) => term.startsWith(query));
}

/**
 * Order two commands that matched in the same way: the user's own triggers
 * come first – they were made to be typed – then a command the symbol
 * index describes outranks a bare name (it has a glyph and a colloquial
 * name, so it is both more recognisable and more likely what was meant),
 * then the shortest, then alphabetical order, which is the order MathLive's
 * own suggestions came in (its command table carries no frequency data).
 */
function byUsefulness(a: CommandCandidate, b: CommandCandidate): number {
  const own = Number(b.triggerId !== undefined) - Number(a.triggerId !== undefined);
  if (own !== 0) return own;
  const described = Number(b.glyph !== '') - Number(a.glyph !== '');
  if (described !== 0) return described;
  if (a.name.length !== b.name.length) return a.name.length - b.name.length;
  return a.name < b.name ? -1 : 1;
}

/**
 * Rank `candidates` against the letters typed after the `\`.
 *
 * An exact name comes first (`\pi` must offer π before `\piecewise`; a
 * trigger typed in full before a command of the same name), then
 * the other commands whose name starts with the letters, then the commands
 * a *description* word starts with them – `\all` finds "For all", `\root`
 * finds "Square root". A command that matches both ways is listed once, in
 * the higher place.
 *
 * Name matching is case-sensitive: `\delta` and `\Delta` are different
 * symbols, and a case-insensitive list would bury the one being typed.
 * Descriptions are prose, so they match case-insensitively.
 */
export function matchCommands(
  query: string,
  candidates: readonly CommandCandidate[],
  limit: number = MAX_SUGGESTIONS,
): CommandCandidate[] {
  if (query === '') return [];
  const named = candidates.filter((candidate) => candidate.name.startsWith(query));
  named.sort((a, b) => {
    const exact = Number(b.name === query) - Number(a.name === query);
    return exact !== 0 ? exact : byUsefulness(a, b);
  });
  if (named.length >= limit || query.length < MIN_DESCRIPTION_QUERY) {
    return named.slice(0, limit);
  }

  // Description matches fill what is left of the list. A word early in the
  // description is the symbol's own name ("for all"); a later one is an
  // alias or a gloss, so it ranks below.
  const inserted = new Set(named.map((candidate) => candidate.latex));
  const lower = query.toLowerCase();
  const described = candidates
    .filter((candidate) => !inserted.has(candidate.latex) && termRank(candidate, lower) !== -1)
    .sort((a, b) => {
      const rank = termRank(a, lower) - termRank(b, lower);
      return rank !== 0 ? rank : byUsefulness(a, b);
    });
  return [...named, ...described].slice(0, limit);
}
