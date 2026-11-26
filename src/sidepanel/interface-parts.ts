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
 * stop would be worse than either state. The "Equation" heading instead stays
 * in the accessibility tree, visually hidden: it is the field's accessible
 * name (WCAG 4.1.2), so removing it would leave the field unnamed.
 */
import type { InterfacePart } from '../types';

export interface InterfacePartSpec {
  part: InterfacePart;
  /** Checkbox label in Settings: the piece, named as the user sees it. */
  label: string;
  /**
   * One line under the label, only where it says something the label cannot:
   * what still works with the piece switched off.
   */
  hint?: string;
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
    hint: 'Screen readers still announce it.',
    mode: 'hide-visually',
  },
  {
    part: 'copy',
    label: 'Copy buttons',
    mode: 'remove',
  },
  {
    part: 'speak',
    label: 'Read aloud button',
    mode: 'remove',
  },
  {
    part: 'symbols',
    label: 'Tabs below the field',
    mode: 'remove',
  },
  {
    part: 'symbolSearch',
    label: 'Symbol search box',
    mode: 'remove',
  },
  {
    part: 'symbolCategories',
    label: 'Symbol categories and keys',
    mode: 'remove',
  },
  {
    part: 'saveToLibrary',
    label: 'Save to library button',
    mode: 'remove',
  },
  {
    part: 'source',
    label: 'Equation source',
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
