/**
 * Editor: a thin, accessible wrapper around MathLive's `<math-field>`.
 *
 * Responsibilities:
 * - Configure MathLive for **offline** operation (fonts/sounds served from the
 *   bundled extension package, never a CDN – the no-network invariant the
 *   build enforces via scripts/check-no-network.mjs).
 * - Create and mount the math field with sensible, accessible defaults.
 * - Expose the current value in the formats we export (MathML / LaTeX /
 *   spoken) and notify listeners on change.
 *
 * Anything format/clipboard or speech specific lives in output.ts / speech.ts;
 * this module only knows about the field itself. The expression library and
 * the recent-symbols list are not imported here: the host passes them in
 * through {@link EditorOptions}, so the field mounts without them.
 */
import { MathfieldElement } from 'mathlive';
import type { OutputFormat } from '../../types';
import { assetUrl } from '../runtime';
import { getSettings, onSettingsChange } from '../settings';
import { announce } from '../a11y';
import { stripRedundantFences } from '../latex-clean';
import { bareStructureTemplate, trailingStructure } from './templates';
import {
  applyStyleCommand,
  installStyleShortcuts,
  trailingStyleCommand,
} from './styling';
import { installCommandAutoAccept } from './autocomplete';
import { installStructureBackspace } from './deletion';
import { installAccentClickRedirect, installLimitArrowKeys } from './navigation';
import { installMatrixKeys } from './matrix';
import { depthAtOffset } from './offsets';
import { createCommandFinder } from './finder';
import { installSelectionCapture, wrapIntoFirstSlot } from './selection-wrap';
import type { FinderInsertListener } from './finder';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * MathLive's `math-ml` export is a **rootless fragment** (e.g. `<mrow>…</mrow>`).
 * That is not valid standalone MathML: paste targets expect a `<math>` root and
 * strict consumers reject a bare fragment. Wrap it in a proper `<math>`
 * document so every consumer – the clipboard and speech – receives valid
 * MathML.
 */
export function toMathMlDocument(fragment: string): string {
  const trimmed = fragment.trim();
  if (trimmed === '') return '';
  if (/^<math[\s>]/i.test(trimmed)) return trimmed; // already a full document
  return `<math xmlns="${MATHML_NS}" display="block">${trimmed}</math>`;
}

let configured = false;

/**
 * Point MathLive at the locally-bundled fonts and sounds. Must run before the
 * first `<math-field>` is rendered. Idempotent.
 */
function configureMathLiveOffline(): void {
  if (configured) return;
  configured = true;

  // `assetUrl` resolves to the packaged extension resources, so no network
  // request is ever made for fonts or sounds.
  MathfieldElement.fontsDirectory = assetUrl('fonts');
  MathfieldElement.soundsDirectory = assetUrl('sounds');
}

export interface EditorController {
  /** The underlying custom element (already mounted). */
  readonly element: MathfieldElement;
  /** Current value in a requested export format. */
  getValue(format: OutputFormat): string;
  /** Raw LaTeX, convenient for round-tripping. */
  getLatex(): string;
  /** MathLive's spoken-text string (used as a speech fallback source). */
  getSpokenText(): string;
  /** Replace the equation (e.g. when the LaTeX source textarea is edited). */
  setLatex(latex: string): void;
  /**
   * Insert a LaTeX fragment at the caret (used by the palette). Supports
   * MathLive placeholder tokens (e.g. `#?`) for tab-navigable empty slots.
   * By default focus moves into the field so authoring can continue;
   * `focus: false` inserts at the caret WITHOUT relocating focus – the
   * palette's keyboard path uses this so consecutive inserts from the symbol
   * grid cost one keypress each (Pearson AEE / MathType convention).
   */
  insert(latex: string, options?: { focus?: boolean }): void;
  /** Whether the field currently holds an equation. */
  isEmpty(): boolean;
  /** Move keyboard focus into the field. */
  focus(): void;
  /** Subscribe to content changes. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
  /**
   * Enable/disable the automatic boxing of bare structure commands into their
   * placeholder templates. Disabled while the LaTeX source textarea is being
   * edited, so a half-typed `\frac` there is not rewritten mid-edit.
   */
  setAutoBoxEnabled(enabled: boolean): void;
}

/** A shortcut or library formula reached by typing its `\`-trigger. */
export interface TriggerEntry {
  id: string;
  /** The letters typed after the `\`. */
  trigger: string;
  /** Announced as "Inserted <name>"; the finder's row label. */
  name: string;
  /** The LaTeX to insert, placeholders selected. */
  body: string;
  /** '; '-separated synonyms the finder matches by description. */
  keywords?: string;
}

/** The host's `\`-trigger store, resolved by name as the user types. */
export interface EditorTriggers {
  /** Is `prefix` the start of at least one trigger? Keeps the buffer alive. */
  isPrefix(prefix: string): boolean;
  /** The entry for a fully typed trigger, or null when none matches. */
  lookup(name: string): TriggerEntry | null;
  /** Every trigger, for the finder's suggestions. */
  list(): readonly TriggerEntry[];
  /** Called once an entry has been inserted. */
  recordUse(id: string): void;
}

export interface EditorOptions {
  /** `\`-triggers (shortcuts, library formulae) confirmed in the field; none when omitted. */
  triggers?: EditorTriggers;
  /** Called when the `\` finder inserts a symbol that has a glyph. */
  onFinderInsert?: FinderInsertListener;
}

/**
 * Create the math field, mount it into `host`, and return a controller.
 */
export function createEditor(host: HTMLElement, options: EditorOptions = {}): EditorController {
  configureMathLiveOffline();

  const mf = new MathfieldElement();

  // Accessible labelling: the field is a custom control, so give it an
  // explicit name (WCAG 4.1.2). The panel overrides this with
  // `aria-labelledby` pointing at the visible "Equation" label (main.ts);
  // this attribute is the fallback for the field mounted on its own (the
  // e2e harness). One consistent name everywhere.
  mf.setAttribute('aria-label', 'Equation');
  mf.setAttribute('role', 'math');

  // Keep the in-extension experience focused and accessible: MathLive's
  // built-in virtual keyboard and menu toggle are not fully keyboard-operable
  // and have contrast issues, and the keyboard panel can obscure focusable UI
  // (WCAG 1.4.3, 2.1.1, 2.4.11). We disable/hide both (see styles.css); the
  // curated palette is the accessible on-screen keyboard and insert menu.
  mf.mathVirtualKeyboardPolicy = 'manual';

  // Make the spacebar insert a natural-width space in math mode (MathLive
  // ignores it by default). A normal interword space feels less abrupt than a
  // thick `\;`.
  mf.mathModeSpace = '\\ ';

  // Ctrl+C in the field puts the same LaTeX on the clipboard as Copy in
  // LaTeX: MathLive's default wraps it in `$$ … $$`, which pastes as stray
  // dollar signs everywhere but a TeX document.
  mf.onExport = (_mf, latex) => (getSettings().tidyBrackets ? stripRedundantFences(latex) : latex);

  // The rendered maths size is set by the `.math-field` font-size in CSS
  // (which scales with the user's font-size setting). We must NOT set an inline
  // font-size here – an inline `inherit` would override the stylesheet and
  // render the maths at the small inherited UI size.
  mf.classList.add('math-field');

  host.appendChild(mf);

  // MathLive's internal keyboard sink (its hidden key-capture surface) ships
  // without an accessible name, which fails axe's aria-input-field-name.
  // Label it to match the host field. The sink is created during mounting and
  // MathLive may replace it mid-initialisation, so the label is re-applied on
  // a short poll rather than set once.
  let sinkLabelAttempts = 0;
  const labelKeyboardSink = (): void => {
    sinkLabelAttempts++;
    const sink = mf.shadowRoot?.querySelector('.ML__keyboard-sink');
    if (sink && sink.getAttribute('aria-label') !== 'Equation') {
      sink.setAttribute('aria-label', 'Equation');
    }
    // Keep polling for a few more attempts to ensure the label persists through
    // MathLive's full initialisation cycle (DOM mutations, reflows, etc.)
    if (sinkLabelAttempts < 20) {
      setTimeout(labelKeyboardSink, 50);
    }
  };
  labelKeyboardSink();

  // Disable ALL of MathLive's bare-word inline shortcuts (e.g. "sqrt" -> radical,
  // "pi" -> π). They auto-expand letter sequences as you type, which prevents
  // typing those letters literally. Commands are only created via an explicit
  // leading `\` (or the palette). `inlineShortcuts` throws if the field is not
  // yet mounted, so guard it.
  try {
    mf.inlineShortcuts = {};
  } catch (error) {
    console.error('Could not clear inline shortcuts:', error);
  }

  // Remove MathLive's Shift+Tab binding, which moves the caret to the previous
  // group (resetting it toward the start) instead of letting focus leave the
  // field. Removing it lets Shift+Tab move focus to the palette while the caret
  // stays put, so a keyboard user can insert symbols at their actual position.
  try {
    mf.keybindings = mf.keybindings.filter(
      (kb) => !(kb.key === 'shift+[Tab]' && kb.command === 'moveToPreviousGroup'),
    );
  } catch (error) {
    console.error('Could not adjust keybindings:', error);
  }

  // Snapshot the keybinding table (Shift+Tab already removed above) so the
  // slash fraction preference below can filter it, and restore it unfiltered
  // when the preference is turned back on.
  let baseKeybindings: typeof mf.keybindings;
  try {
    baseKeybindings = mf.keybindings;
  } catch (error) {
    console.error('Could not capture base keybindings:', error);
    baseKeybindings = [];
  }

  /**
   * Apply the user's slash fraction preference. When `slashFraction` is false,
   * removes the two `/`-to-fraction bindings so `/` falls through to typing
   * a literal slash instead of auto-building a fraction. Rebuilding the
   * keybinding table is not free, and this runs on EVERY settings change (the
   * equation-size slider fires one per step of a drag), so it bails out
   * unless the preference actually changed.
   */
  let appliedSlashFraction: boolean | undefined;
  const applySlashPreference = (): void => {
    const settings = getSettings();
    if (settings.slashFraction === appliedSlashFraction) return;
    appliedSlashFraction = settings.slashFraction;
    try {
      if (settings.slashFraction) {
        mf.keybindings = baseKeybindings;
      } else {
        // Remove the `/` and `[NumpadDivide]` fraction bindings
        mf.keybindings = baseKeybindings.filter(
          (kb) =>
            !(
              Array.isArray(kb.command) &&
              kb.command[0] === 'insert' &&
              kb.command[1] === '\\frac{#@}{#?}'
            ),
        );
      }
    } catch (error) {
      console.error('Could not apply slash preference:', error);
    }
  };

  applySlashPreference();
  onSettingsChange(() => applySlashPreference());
  // The subscription lives for the panel's lifetime, so no unsubscribe is needed.

  // Structure commands (\int, \frac, \sqrt, …) commit as a bare command with no
  // usable placeholder and the caret misplaced. Box any of them into their
  // placeholder template using the same clean `insert` the palette uses.
  //
  // Only act when the value **grew** (a character was just typed) – never on
  // deletion. Otherwise deleting a generated `\int_{▢}^{▢}` back down to `\int`
  // would immediately regenerate the placeholders, trapping the user.
  let autoBoxing = false;
  let autoBoxEnabled = true;
  let prevLength = 0;
  // Declared before boxTrailingStructure so it can cancel a still-pending
  // input-debounce timer (see below) as soon as boxing happens; assigned later,
  // once the `input` listener that schedules it is installed.
  let autoBoxTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * The offset range of the whole command atom ending at `end` – walking back
   * through any of the atom's own argument groups (offsets deeper than the
   * atom itself, e.g. a frac's numerator/denominator or a sqrt's radicand) to
   * the atom's start. Siblings sit at the atom's own depth, so the walk never
   * crosses them.
   *
   * This matters because MathLive's OWN completion path (Enter, or our
   * `accept-all`) can already have built (some of) the command's argument
   * groups even where the document- or atom-level LaTeX still (mis)reports
   * the command as bare: a mandatory-multi-argument command gets every group
   * filled with a real `\placeholder{}` atom (which `getValue('latex')`
   * collapses back to the bare name for a trailing atom), and a single-brace
   * command committed in a nested context (e.g. `\sqrt` in a numerator) gets
   * an empty brace group whose interior occupies `end - 1`. A naive
   * `[end - 1, end]` selection therefore cuts into the atom – reaching only
   * its last child atom, or a mid-atom range MathLive resolves by deleting
   * the atom and re-inserting the replacement in the wrong group (the bug
   * where `\sqrt` typed in a numerator landed in the denominator). Selecting
   * the full range computed here always replaces the entire atom in place,
   * which is safe to do even when it was already built – the result is the
   * same shape, freshly inserted via `insert()` (which serialises correctly,
   * unlike the completion path), so boxing is idempotent regardless of how
   * many times or from which path it runs.
   */
  const trailingAtomRange = (end: number): [number, number] => {
    const atomDepth = depthAtOffset(mf, end);
    let start = end - 1;
    while (start > 0 && depthAtOffset(mf, start) > atomDepth) start--;
    return [Math.max(start, 0), end];
  };

  /**
   * A bare STYLE command committed WITHOUT the auto-accept path (the user
   * pressed space/Enter before the delay elapsed) is an offset-less husk:
   * it contributes no atoms, so it cannot be range-selected away like a
   * structure, and left in place it poisons a subsequently armed style.
   * Rewrite the value without it, then apply the style it names. The one
   * `setValue` outside the public setLatex – it trades undo granularity for
   * not leaving the husk, on a path the auto-accept interception
   * (autocomplete.ts) makes rare.
   */
  const consumeTrailingStyleCommand = (): boolean => {
    const latex = mf.getValue('latex');
    const name = trailingStyleCommand(latex);
    if (!name) return false;
    autoBoxing = true;
    if (autoBoxTimer) {
      clearTimeout(autoBoxTimer);
      autoBoxTimer = undefined;
    }
    mf.setValue(latex.replace(new RegExp(`\\\\${name}(?:\\{\\})?\\s*$`), ''));
    mf.position = mf.lastOffset;
    applyStyleCommand(mf, name, announce);
    autoBoxing = false;
    prevLength = mf.getValue('latex').length;
    return true;
  };

  const boxTrailingStructure = (): void => {
    if (!autoBoxEnabled) return;
    if (autoBoxing) return;
    if (consumeTrailingStyleCommand()) return;
    // A bare command at the very end of the field (the common, top-level
    // case) – or, failing that, one committed in a NESTED context (a matrix
    // cell), where the field's LaTeX ends with the environment's `\end{…}`
    // and only the atom to the caret's left reveals the command.
    let template: string | null = null;
    let range: [number, number] | null = null;
    const match = trailingStructure(mf.getValue('latex'));
    if (match) {
      template = match;
      range = trailingAtomRange(mf.lastOffset);
    } else {
      const pos = mf.position;
      const leftAtom = mf.getElementInfo(pos)?.latex?.trim() ?? '';
      template = bareStructureTemplate(leftAtom);
      // Nested only: at top level the trailing check above is authoritative
      // (a bare command mid-field, with content after it, is left alone).
      if (template && depthAtOffset(mf, pos) > 0) range = trailingAtomRange(pos);
      else template = null;
    }
    if (!template || !range) return; // not a bare structure
    autoBoxing = true;
    // A second, independently-scheduled box timer (the `input` debounce below)
    // must never re-fire after this box has already happened.
    if (autoBoxTimer) {
      clearTimeout(autoBoxTimer);
      autoBoxTimer = undefined;
    }
    // Replace the whole trailing command atom (one undoable operation, so
    // Ctrl+Z restores the typed command instead of losing history to
    // setValue) with the placeholder template via insert, keeping undo
    // history intact.
    mf.selection = { ranges: [range] };
    mf.insert(template, { focus: true, selectionMode: 'placeholder' });
    mf.executeCommand('scrollIntoView');
    autoBoxing = false;
    prevLength = mf.getValue('latex').length;
  };

  // Box straight after the command is auto-accepted, so placeholders appear even
  // at a zero autocomplete delay (see installCommandAutoAccept). Library
  // `\`-triggers ride the same buffer: a confirm key on a fully typed
  // trigger rejects the latex-mode text (the style-branch precedent) and
  // inserts the saved body, placeholders selected and Tab-navigable.
  const triggers = options.triggers;
  const selectionWrap = installSelectionCapture(mf);
  // Inserts a trigger's body, wrapping what was selected when the command
  // began into its first empty slot; reports whether it did.
  const insertTrigger = (body: string): boolean => {
    const selected = selectionWrap.take();
    const wrapped = selected === null ? null : wrapIntoFirstSlot(body, selected);
    mf.executeCommand(['complete', 'reject']);
    // The typed backslash already replaced the selection, and undo would stop
    // at that gap. Putting the selection back, selected, lets the wrap
    // replace it in place, so one Ctrl+Z restores the field as it was.
    if (wrapped !== null && selected !== null) {
      mf.insert(selected, { focus: true, selectionMode: 'item' });
    }
    mf.insert(wrapped ?? body, { focus: true, selectionMode: 'placeholder' });
    mf.executeCommand('scrollIntoView');
    return wrapped !== null;
  };
  installCommandAutoAccept(
    mf,
    boxTrailingStructure,
    (name) => applyStyleCommand(mf, name, announce),
    triggers && {
      isPrefix: (prefix) => triggers.isPrefix(prefix),
      accept: (name) => {
        const entry = triggers.lookup(name);
        if (entry === null) return false;
        const wrapped = insertTrigger(entry.body);
        triggers.recordUse(entry.id);
        announce(`Inserted ${entry.name}${wrapped ? ' around the selection' : ''}`);
        return true;
      },
    },
  );
  installStructureBackspace(mf);
  installLimitArrowKeys(mf);
  installAccentClickRedirect(mf);
  installMatrixKeys(mf, announce);
  installStyleShortcuts(mf, announce);
  // The finder replaces MathLive's suggestion popover with a stable list in
  // flow under the field (finder.ts). Its key handling is installed last,
  // after the other capture listeners (arrows in navigation.ts, backspace in
  // deletion.ts, matrix keys, the library triggers in autocomplete.ts), so a
  // trigger accepted on the same key still wins; there is no mode conflict
  // either, since those act in 'math' mode and the finder only in 'latex'.
  host.appendChild(createCommandFinder(mf, options.onFinderInsert, triggers, insertTrigger));

  // Also box structures committed *without* the auto-accept path (e.g. when the
  // user presses space/Tab/Enter themselves), on a debounce anchored to a
  // trailing bare command. Never cancel a pending box on a non-growing input:
  // the auto-accept's `accept-all` emits a synthetic non-growing `input`, so
  // clobbering the box there would break the zero-delay case.
  mf.addEventListener('input', () => {
    const latex = mf.getValue('latex');
    const grew = latex.length > prevLength;
    prevLength = latex.length;
    if (!autoBoxEnabled) return;
    if (autoBoxing) return;
    if (!grew) return; // deletion / no growth → don't (re)enforce placeholders
    if (autoBoxTimer) clearTimeout(autoBoxTimer);
    const leftAtom = mf.getElementInfo(mf.position)?.latex?.trim() ?? '';
    if (
      !trailingStructure(latex) &&
      !bareStructureTemplate(leftAtom) &&
      !trailingStyleCommand(latex)
    ) {
      return;
    }
    autoBoxTimer = setTimeout(boxTrailingStructure, getSettings().commandDelay);
  });

  const getValue = (format: OutputFormat): string => {
    if (format === 'mathml') return toMathMlDocument(mf.getValue('math-ml'));
    return mf.getValue('latex');
  };

  return {
    element: mf,
    getValue,
    getLatex: () => mf.getValue('latex'),
    getSpokenText: () => mf.getValue('spoken'),
    setLatex: (latex: string) => mf.setValue(latex),
    insert: (latex: string, options?: { focus?: boolean }) => {
      const focus = options?.focus ?? true;
      if (focus) mf.focus();
      mf.insert(latex, { focus, selectionMode: 'placeholder' });
      // Keep the caret/inserted structure visible when the field has scrolled
      // (e.g. inserting near the right edge of a long equation).
      mf.executeCommand('scrollIntoView');
    },
    isEmpty: () => mf.getValue('latex').trim().length === 0,
    focus: () => mf.focus(),
    onChange: (listener: () => void) => {
      mf.addEventListener('input', listener);
      return () => mf.removeEventListener('input', listener);
    },
    setAutoBoxEnabled: (enabled: boolean) => {
      autoBoxEnabled = enabled;
      if (!enabled && autoBoxTimer) clearTimeout(autoBoxTimer);
    },
  };
}

