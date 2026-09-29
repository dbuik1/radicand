/**
 * The one list behind both symbol lists: the Symbols search box and the `\`
 * finder under the equation field.
 *
 * Both show the same row – glyph, name, command – and both move a highlight
 * over a list that is built once per result set and never rebuilt per
 * keypress (the flaw in MathLive's own suggestion popover, which this
 * project replaced). Keeping the row and the highlight here means there is
 * one accessible list to maintain, not two: options are named by their
 * description, and the glyph and the LaTeX are decorative and hidden from
 * assistive technology.
 */

/** The shape both lists share; the search adds library fields of its own. */
export interface ListEntry {
  /** LaTeX inserted on activation; `#?` marks tab-navigable placeholders. */
  c: string;
  /** The symbol's character, or a display glyph for structural templates. */
  u: string;
  /** Search prose: colloquial names and synonyms, `; `-separated. */
  d: string;
  /** Extra alias terms (entity names, formal Unicode descriptions). */
  a?: string;
}

/**
 * Human name for an entry: its first description phrase, capitalised. A few
 * entries have aliases only – there the longest phrase is the most readable
 * (the short ones are entity abbreviations like "mumap").
 */
export function displayName(entry: ListEntry): string {
  const phrase =
    entry.d.split(';')[0]?.trim() ||
    (entry.a ?? '')
      .split(';')
      .map((part) => part.trim())
      .reduce((best, part) => (part.length > best.length ? part : best), '') ||
    entry.c;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export interface OptionSpec {
  /** DOM id, so the owning combobox can point `aria-activedescendant` at it. */
  id: string;
  /** The accessible name and the visible label – always prose, never a glyph. */
  label: string;
  /** A character to show in the glyph slot. */
  glyph?: string;
  /** LaTeX to render into the glyph slot instead (a saved library entry). */
  glyphLatex?: string;
  /** The command shown, muted, on the right. */
  command?: string;
  /**
   * The label IS a command, not prose – a `\` finder row for a command the
   * symbol index does not describe. It is then set in the command's own
   * monospace, and nothing is repeated on the right.
   */
  labelIsCommand?: boolean;
}

/** Render LaTeX into a row's glyph slot, best effort (never throws). */
function renderLatexInto(target: HTMLElement, latex: string): void {
  void import('mathlive')
    .then(({ convertLatexToMarkup }) => {
      target.innerHTML = convertLatexToMarkup(latex);
    })
    .catch(() => {
      target.textContent = '';
    });
}

/** One option row, ready to append to a `role="listbox"`. */
export function createOption(spec: OptionSpec): HTMLLIElement {
  const option = document.createElement('li');
  option.id = spec.id;
  option.className = 'symbol-list__option';
  option.setAttribute('role', 'option');
  option.setAttribute('aria-selected', 'false');
  // Named by the description, not the glyph or the LaTeX (both are
  // decorative here and hidden from assistive tech).
  option.setAttribute('aria-label', spec.label);

  const glyph = document.createElement('span');
  glyph.className = 'symbol-list__glyph';
  glyph.setAttribute('aria-hidden', 'true');
  if (spec.glyphLatex !== undefined) {
    glyph.classList.add('symbol-list__glyph--rendered');
    renderLatexInto(glyph, spec.glyphLatex);
  } else {
    glyph.textContent = spec.glyph ?? '';
  }

  const name = document.createElement('span');
  name.className = 'symbol-list__name';
  if (spec.labelIsCommand === true) name.classList.add('symbol-list__name--command');
  name.textContent = spec.label;

  const command = document.createElement('span');
  command.className = 'symbol-list__cmd';
  command.setAttribute('aria-hidden', 'true');
  command.textContent = spec.command ?? '';

  option.append(glyph, name, command);
  return option;
}

/**
 * Move the highlight to `index`, scrolling it into view. Only `aria-selected`
 * and a class change – the option nodes themselves are left alone, which is
 * what keeps the list stable under held arrow keys.
 */
export function setActiveOption(listbox: HTMLElement, index: number): void {
  listbox.querySelectorAll('[role="option"]').forEach((option, i) => {
    option.setAttribute('aria-selected', String(i === index));
    option.classList.toggle('symbol-list__option--active', i === index);
    if (i === index) option.scrollIntoView({ block: 'nearest' });
  });
}
