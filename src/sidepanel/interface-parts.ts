/**
 * The pieces of the interface a user can switch off, and the copy that names
 * them in Settings.
 *
 * The equation field itself is not in this list: it is the product, and there
 * is no state in which the panel does not show it. Everything else around it
 * is optional, so a user who wants nothing but a field and a keyboard can
 * have exactly that, and a user who wants every affordance can have that too.
 *
 * This module is the single place the list lives. Settings renders one
 * checkbox per entry from this table, `part-visibility.ts` applies each
 * entry's flag to the element its owner registers, and the completeness test
 * beside it fails if a part gains a flag with no toggle or no owner. Adding a
 * piece of interface therefore means adding one row here, one `bindPart` call
 * in its owner, and nothing else.
 *
 * `mode` says what "off" means for that piece. Interactive controls are taken
 * out of the page altogether – an invisible button that still takes a Tab
 * stop would be worse than either state. The two headings instead stay in the
 * accessibility tree, visually hidden: the "Equation" heading is the field's
 * accessible name (WCAG 4.1.2), so removing it would leave the field unnamed.
 */
import type { InterfacePart } from '../types';
import {
  COPY_SHORTCUT_LABEL,
  SAVE_SHORTCUT_LABEL,
  SEARCH_SHORTCUT_LABEL,
  SETTINGS_SHORTCUT_LABEL,
  SYMBOLS_SHORTCUT_LABEL,
} from './shortcut-labels';

export interface InterfacePartSpec {
  part: InterfacePart;
  /** Checkbox label in Settings: the piece, named as the user sees it. */
  label: string;
  /** One line under the label: what goes, and what still works without it. */
  hint: string;
  /**
   * How the piece leaves: `remove` takes it out of the page, `hide-visually`
   * keeps it for assistive technology only (headings that name something).
   */
  mode: 'remove' | 'hide-visually';
}

export const INTERFACE_PARTS: readonly InterfacePartSpec[] = [
  {
    part: 'equationHeading',
    label: 'Equation heading',
    hint: 'The word "Equation" above the field. Screen readers still announce it as the field\'s name.',
    mode: 'hide-visually',
  },
  {
    part: 'styleMenu',
    label: 'Style menu',
    hint: 'Bold, italic, colour and text style for the selection.',
    mode: 'remove',
  },
  {
    part: 'moreMenu',
    label: 'More menu',
    hint: `Open in a window or tab, the equation source, keyboard shortcuts and settings. Settings also opens with ${SETTINGS_SHORTCUT_LABEL}.`,
    mode: 'remove',
  },
  {
    part: 'symbols',
    label: 'Symbol palette',
    hint: `The whole area below the field: search, categories and symbol keys. ${SYMBOLS_SHORTCUT_LABEL} shows and hides it too.`,
    mode: 'remove',
  },
  {
    part: 'symbolSearch',
    label: 'Symbol search box',
    hint: `Finds a symbol by name or description. ${SEARCH_SHORTCUT_LABEL} puts the cursor in it and brings it back if it is off.`,
    mode: 'remove',
  },
  {
    part: 'symbolCategories',
    label: 'Symbol categories and keys',
    hint: 'The category strip and the grid of symbols under it.',
    mode: 'remove',
  },
  {
    part: 'symbolSources',
    label: 'Insert from Drawing and My library',
    hint: 'The Insert… control on the search row: Drawing sketches a symbol, My library inserts a whole saved equation. Both stay in the More menu.',
    mode: 'remove',
  },
  {
    part: 'source',
    label: 'Equation source',
    hint: 'The LaTeX or MathML box under the symbols, where the source can be read and edited.',
    mode: 'remove',
  },
  {
    part: 'copy',
    label: 'Copy button',
    hint: `Copy, the format it copies in, and the line that confirms it. ${COPY_SHORTCUT_LABEL} still copies the equation.`,
    mode: 'remove',
  },
  {
    part: 'speak',
    label: 'Speak button',
    hint: 'Reads the equation aloud. The speech settings below still apply to it.',
    mode: 'remove',
  },
  {
    part: 'saveToLibrary',
    label: 'Save to library button',
    hint: `Saves the equation for reuse. ${SAVE_SHORTCUT_LABEL} still saves it.`,
    mode: 'remove',
  },
];

/** Look a part's spec up. Every part in the union has one (see the tests). */
export function interfacePartSpec(part: InterfacePart): InterfacePartSpec {
  const spec = INTERFACE_PARTS.find((entry) => entry.part === part);
  if (!spec) throw new Error(`No interface-part spec for "${part}"`);
  return spec;
}

/** Every piece is shown until the user says otherwise. */
export const DEFAULT_INTERFACE_PARTS: Record<InterfacePart, boolean> = Object.freeze(
  Object.fromEntries(INTERFACE_PARTS.map((spec) => [spec.part, true])),
) as Record<InterfacePart, boolean>;

/**
 * Coerce stored data back into a full set of flags: unknown keys are dropped
 * and missing ones default to shown, so a piece added in a later version
 * appears for a user whose synced settings predate it.
 *
 * `legacySymbolsOpen` is the pre-`parts` key that held the same state as
 * `parts.symbols`; it is honoured when the newer key is absent so a user who
 * had hidden the symbols does not find them back on screen after an update.
 */
export function normaliseInterfaceParts(
  raw: unknown,
  legacySymbolsOpen?: unknown,
): Record<InterfacePart, boolean> {
  const stored = (raw ?? {}) as Record<string, unknown>;
  const parts = { ...DEFAULT_INTERFACE_PARTS };
  for (const spec of INTERFACE_PARTS) {
    const value = stored[spec.part];
    if (typeof value === 'boolean') parts[spec.part] = value;
  }
  if (typeof stored.symbols !== 'boolean' && typeof legacySymbolsOpen === 'boolean') {
    parts.symbols = legacySymbolsOpen;
  }
  return parts;
}
