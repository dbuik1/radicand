/**
 * The `\` finder: the suggestion list for a typed `\`-command.
 *
 * MathLive's own popover is switched off (`popoverPolicy = 'off'`): it
 * rebuilt its entire DOM on every arrow press – flashing for sighted users,
 * churning the accessibility tree for screen-reader users – was
 * `aria-hidden`, listed LaTeX names only, and clipped in a narrow panel.
 * This list sits in document flow directly under the equation field, is
 * built once per result set and never rebuilt per keypress, and is the same
 * list the Symbols search box uses (src/sidepanel/symbol-list.ts).
 *
 * Focus stays inside MathLive's shadow root while the user types, so
 * `aria-activedescendant` cannot reach these options: the highlight and the
 * insertion are spoken through the panel's polite live region instead, the
 * one place this project echoes a selection by hand.
 */
import type { MathfieldElement } from 'mathlive';
import { announce } from '../a11y';
import { SEARCH_SHORTCUT_LABEL } from '../shortcut-labels';
import { createOption, setActiveOption } from '../symbol-list';
import { loadCommandCandidates } from './command-index';
import { matchCommands } from './command-match';
import { readTypedCommand } from './typed-command';
import type { CommandCandidate } from './command-match';
import type { EditorTriggers, TriggerEntry } from './index';

/**
 * The empty state, seen and heard. It points at the way in that does not
 * need the command's name: the search box takes a description ("for all",
 * "square root").
 */
const NO_MATCH = `No matching command – ${SEARCH_SHORTCUT_LABEL} searches by description.`;

/** How long the list must sit still before its size is announced. */
const ANNOUNCE_DELAY_MS = 400;

/** A symbol the finder has just inserted; the host keeps the recent list. */
export type FinderInsertListener = (symbol: { glyph: string; label: string; latex: string }) => void;

/**
 * The user's own trigger as a finder row: the trigger where the command
 * name goes, the saved LaTeX to insert, the name (or `\trigger`) as the
 * label, and the name's and keywords' words for description matching.
 */
function triggerCandidate(entry: TriggerEntry): CommandCandidate {
  const words = `${entry.name}; ${entry.keywords ?? ''}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
  return {
    name: entry.trigger,
    latex: entry.body,
    label: entry.name,
    glyph: '',
    terms: [...new Set(words)],
    triggerId: entry.id,
  };
}

/**
 * Build the finder and wire it to the field. Returns the element to mount
 * directly under the field (createEditor does this); it is empty and hidden
 * until a `\`-command is typed. `onInserted` hears every insertion that has
 * a glyph to show in a recent list. `triggers` supplies the user's own
 * `\`-triggers, listed among the commands and read afresh on every query so
 * a shortcut saved a moment ago is offered at once.
 */
export function createCommandFinder(
  mf: MathfieldElement,
  onInserted?: FinderInsertListener,
  triggers?: EditorTriggers,
): HTMLElement {
  // The popover this list replaces. With it off, MathLive computes no
  // suggestions at all and leaves ArrowUp/ArrowDown in LaTeX mode inert,
  // which is what lets the handlers below own them.
  mf.popoverPolicy = 'off';

  const root = document.createElement('div');
  root.className = 'command-finder';

  const listbox = document.createElement('ul');
  listbox.id = 'command-finder-listbox';
  listbox.className = 'symbol-list command-finder__list';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', 'Matching commands');
  listbox.hidden = true;

  const empty = document.createElement('p');
  empty.className = 'command-finder__empty';
  empty.textContent = NO_MATCH;
  empty.hidden = true;

  root.append(listbox, empty);

  let candidates: CommandCandidate[] | null = null;
  let results: CommandCandidate[] = [];
  let activeIndex = 0;
  let renderedFor = ' '; // a query no keystroke can produce
  let dismissedQuery: string | null = null;
  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  // A confirm key pressed before the command list first loaded: held back
  // so MathLive cannot commit the letters as raw LaTeX, and carried out
  // once the list is in.
  let heldConfirm = false;

  const close = (): void => {
    clearTimeout(announceTimer);
    results = [];
    activeIndex = 0;
    renderedFor = ' ';
    listbox.hidden = true;
    listbox.replaceChildren();
    empty.hidden = true;
  };

  const insert = (candidate: CommandCandidate): void => {
    // MathLive's own commit path: drop the typed LaTeX text, then insert –
    // one undoable step, placeholders selected and Tab-navigable.
    mf.executeCommand(['complete', 'reject']);
    mf.insert(candidate.latex, { focus: true, selectionMode: 'placeholder' });
    mf.executeCommand('scrollIntoView');
    if (candidate.triggerId !== undefined) {
      triggers?.recordUse(candidate.triggerId);
    } else if (candidate.glyph !== '' && onInserted) {
      onInserted({ glyph: candidate.glyph, label: candidate.label, latex: candidate.latex });
    }
    clearTimeout(announceTimer);
    announce(`Inserted ${candidate.label}`);
    close();
  };

  const setActive = (index: number): void => {
    if (results.length === 0) return;
    activeIndex = ((index % results.length) + results.length) % results.length;
    setActiveOption(listbox, activeIndex);
  };

  const render = (query: string): void => {
    const names = results.map((result) => result.name).join(' ');
    if (names === renderedFor) {
      // Same suggestions as the last keystroke produced: leave the nodes
      // alone. Replacing nodes under a held arrow key flashes the list and
      // churns the accessibility tree.
      setActive(activeIndex);
      return;
    }
    renderedFor = names;
    listbox.replaceChildren();
    if (results.length === 0) {
      listbox.hidden = true;
      empty.hidden = query === '';
      return;
    }
    empty.hidden = true;
    results.forEach((candidate, index) => {
      // A command the symbol index describes reads "∀ For all \forall";
      // one it does not has no prose name, so the command is written once,
      // in the name's place, rather than twice across the row.
      const command = `\\${candidate.name}`;
      const described = candidate.label !== command;
      const option = createOption({
        id: `command-finder-option-${index}`,
        label: candidate.label,
        glyph: candidate.glyph,
        ...(described ? { command } : { labelIsCommand: true }),
      });
      // Keep the caret in the field: a click must not move focus first.
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => insert(candidate));
      option.addEventListener('mouseenter', () => setActive(index));
      listbox.appendChild(option);
    });
    listbox.hidden = false;
    setActive(0);
  };

  const update = (): void => {
    const query = readTypedCommand(mf);
    if (query === null) {
      dismissedQuery = null;
      if (!listbox.hidden || !empty.hidden) close();
      return;
    }
    // Escape dismisses exactly the query it was pressed on: typing on, or
    // deleting back, brings the list straight back.
    if (query !== dismissedQuery) dismissedQuery = null;
    else return;
    if (candidates === null) {
      void loadCommandCandidates().then((loaded) => {
        candidates = loaded;
        update(); // the query may have grown while the indexes loaded
        if (!heldConfirm) return;
        heldConfirm = false;
        const top = results[0];
        if (top) insert(top);
        else if (mf.mode === 'latex') mf.executeCommand(['complete', 'accept-all']);
      });
      return;
    }
    const own = triggers ? triggers.list().map(triggerCandidate) : [];
    results = matchCommands(query, own.length === 0 ? candidates : [...own, ...candidates]);
    render(query);
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      if (readTypedCommand(mf) !== query) return;
      announce(
        results.length === 0
          ? NO_MATCH
          : `${results.length} suggestion${results.length === 1 ? '' : 's'}`,
      );
    }, ANNOUNCE_DELAY_MS);
  };

  // The query changes on typing (input), on a caret move inside the run
  // (keyup, which no input event follows) and when the field leaves LaTeX
  // mode – all cheap: a shadow-DOM read and a prefix scan of the names.
  mf.addEventListener('input', update);
  mf.addEventListener('keyup', update);
  mf.addEventListener('mode-change', update);
  mf.addEventListener('blur', close);

  mf.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      // A library trigger was accepted on this key (autocomplete.ts, which
      // runs first in the same phase): its insertion wins.
      if (event.defaultPrevented) return;
      if (
        candidates === null &&
        (event.key === 'Enter' || event.key === 'Tab' || event.key === ' ') &&
        (readTypedCommand(mf) ?? '') !== ''
      ) {
        event.preventDefault();
        event.stopPropagation();
        heldConfirm = true;
        update(); // starts the load if no keystroke has yet
        return;
      }
      if (listbox.hidden) return;
      const active = results[activeIndex];
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          event.preventDefault();
          setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
          const moved = results[activeIndex];
          if (moved) {
            clearTimeout(announceTimer);
            announce(`${moved.label}, ${activeIndex + 1} of ${results.length}`);
          }
          return;
        }
        case 'Enter':
        case 'Tab':
        case ' ': {
          if (!active) return;
          event.preventDefault();
          event.stopPropagation();
          insert(active);
          return;
        }
        case 'Escape': {
          // Progressive, like the search box: this closes the list, and a
          // second Escape leaves LaTeX mode (MathLive's own handling).
          event.preventDefault();
          event.stopPropagation();
          dismissedQuery = readTypedCommand(mf);
          close();
          return;
        }
        default:
          return;
      }
    },
    { capture: true },
  );

  return root;
}
