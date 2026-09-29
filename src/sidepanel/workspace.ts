/**
 * The workspace: the scrolling middle zone of the panel, showing one mode
 * at a time. Symbols is the default (search, the Insert… controls, the
 * category strip and the symbol well); Drawing, My library, Custom
 * shortcuts, Save to library, Settings and Keyboard shortcuts each replace it while open and
 * hand back to it on Close.
 *
 * Every non-default mode shares one header – its name as an `h2`, a
 * one-line status, and a slim Close button – so the panel always reads the
 * same way: what am I looking at, how is it going, how do I get back.
 *
 * Keyboard contract: inside a mode, the Tab stop after the equation field
 * is the mode's first control and Close is the last stop before the
 * actions bar – the Close button is therefore DOM-last in each mode and
 * only *drawn* top-right (CSS grid). Escape anywhere in a mode closes it
 * and returns to the equation field; closing with the Close button returns
 * focus to whatever opened the mode (an Insert… item, More ▾, the Save
 * button) when that is still on screen, otherwise to the field.
 *
 * Switching the symbol palette off does not disturb an open mode. The palette
 * hides and reappears through its own binding (see palette.ts), underneath
 * whatever mode is showing, so a user ticking boxes in Settings is never
 * thrown out of the form they are working in; the change is announced when it
 * happens (see part-visibility.ts) and on screen as soon as the mode closes.
 */
import type { EditorController } from './editor';
import { createPalette } from './palette';
import { createDrawToFind } from './draw-find';
import { buildLibraryPanel } from './library-view';
import { getLibraryEntries, onLibraryChange } from './library';
import { createLibraryCapture } from './library-capture';
import type { LibraryCapture } from './library-capture';
import { createSettingsView } from './settings-view';
import { buildShortcutHints } from './shortcuts-view';
import { buildCustomShortcutsPanel } from './custom-shortcuts-view';

export type WorkspaceMode =
  | 'symbols'
  | 'drawing'
  | 'library'
  | 'customShortcuts'
  | 'save'
  | 'settings'
  | 'shortcuts';
export type OpenableMode = Exclude<WorkspaceMode, 'symbols'>;

/** Where focus goes when a mode closes. */
export type CloseFocus = 'opener' | 'field' | 'none';

export interface Workspace {
  /** The workspace section (the skip link's target). */
  root: HTMLElement;
  /** The Save-to-library capture (its button lives in the actions bar). */
  capture: LibraryCapture;
  /** Show a mode; `opener` is where Close returns focus to. */
  open: (mode: OpenableMode, opener?: HTMLElement | null) => void;
  /** Return to Symbols (no-op when already there). */
  close: (focus?: CloseFocus) => void;
  current: () => WorkspaceMode;
}

const MODE_TITLES: Record<OpenableMode, string> = {
  drawing: 'Drawing',
  library: 'My library',
  customShortcuts: 'Custom shortcuts',
  save: 'Save to library',
  settings: 'Settings',
  shortcuts: 'Keyboard shortcuts',
};

/** A built mode: its content plus the hooks the shell drives. */
interface ModeView {
  body: HTMLElement;
  /** The status element under the title; a plain line is created if absent. */
  status?: HTMLElement;
  /** Land focus on the mode's first control. */
  focus: () => void;
  onOpen?: () => void;
  onClose?: () => void;
}

interface ModeSection {
  section: HTMLElement;
  title: HTMLHeadingElement;
  view: ModeView;
}

/** Is the element rendered (not display:none or detached)? */
function isShown(el: HTMLElement | null | undefined): el is HTMLElement {
  if (!el || !el.isConnected) return false;
  if (typeof el.checkVisibility === 'function') return el.checkVisibility();
  return !el.hidden;
}

export interface WorkspaceHooks {
  /** Open the quick search under the field (Drawing's Search instead). */
  onSearch: () => void;
}

export function createWorkspace(editor: EditorController, { onSearch }: WorkspaceHooks): Workspace {
  const root = document.createElement('section');
  root.id = 'workspace';
  root.className = 'workspace';
  root.setAttribute('aria-label', 'Workspace');
  root.tabIndex = -1;

  let current: WorkspaceMode = 'symbols';
  let opener: HTMLElement | null = null;
  const built = new Map<OpenableMode, ModeSection>();

  // ------------------------------------------------------------- symbols
  const symbols = document.createElement('section');
  symbols.className = 'mode mode--symbols';
  symbols.dataset.mode = 'symbols';
  symbols.setAttribute('aria-label', 'Symbols');
  const palette = createPalette(editor, {
    openMode: (mode, from) => open(mode, from),
  });
  symbols.appendChild(palette.root);
  root.appendChild(symbols);

  // ---------------------------------------------------------- mode shell
  const buildSection = (mode: OpenableMode, view: ModeView): ModeSection => {
    const section = document.createElement('section');
    section.className = `mode mode--${mode}`;
    section.dataset.mode = mode;
    section.tabIndex = -1;
    section.hidden = true;

    const title = document.createElement('h2');
    title.className = 'mode__title';
    title.id = `mode-${mode}-title`;
    title.textContent = MODE_TITLES[mode];
    section.setAttribute('aria-labelledby', title.id);

    const status = view.status ?? document.createElement('p');
    status.classList.add('mode__status');

    view.body.classList.add('mode__body');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn--secondary btn--slim mode__close';
    closeBtn.textContent = 'Close';
    closeBtn.setAttribute('aria-label', `Close ${MODE_TITLES[mode]}`);
    closeBtn.addEventListener('click', () => close('opener'));

    // DOM order = Tab order: title, status, the body's controls, then Close
    // last; the grid in styles.css draws Close top-right.
    section.append(title, status, view.body, closeBtn);
    root.appendChild(section);
    return { section, title, view };
  };

  const builders: Record<OpenableMode, () => ModeView> = {
    drawing: () => {
      const draw = createDrawToFind(editor, {
        onSearchInstead: onSearch,
      });
      return {
        body: draw.region,
        status: draw.status,
        focus: () => draw.region.querySelector<HTMLElement>('.draw-find__surface')?.focus(),
        onOpen: draw.open,
        onClose: draw.close,
      };
    },
    library: () => {
      const body = document.createElement('div');
      const panel = buildLibraryPanel(editor, { onEscape: () => close('field') });
      body.append(panel.element);
      const status = document.createElement('p');
      const syncStatus = (): void => {
        const count = getLibraryEntries().length;
        status.textContent =
          count === 0 ? 'No formulae saved yet' : `${count} formula${count === 1 ? '' : 'e'}`;
      };
      onLibraryChange(syncStatus);
      syncStatus();
      return {
        body,
        status,
        focus: () => body.querySelector<HTMLElement>('#library-filter')?.focus(),
        onOpen: panel.refresh,
      };
    },
    customShortcuts: () => {
      const body = document.createElement('div');
      const panel = buildCustomShortcutsPanel(editor, { onEscape: () => close('field') });
      body.append(panel.element);
      return {
        body,
        status: panel.status,
        focus: panel.focus,
        // A form left open is abandoned: the mode always reopens on the list.
        onClose: panel.reset,
      };
    },
    save: () => {
      const body = document.createElement('div');
      const status = document.createElement('p');
      status.textContent = 'Name it, then press Enter to save';
      return {
        body,
        status,
        // The form focuses its Name field itself once mounted.
        focus: () => body.querySelector<HTMLElement>('input')?.focus(),
        onClose: () => body.replaceChildren(),
      };
    },
    settings: () => {
      const body = createSettingsView();
      const status = document.createElement('p');
      status.textContent = 'Changes apply straight away and sync with your Chrome profile';
      return {
        body,
        status,
        // The first control in the form, whatever the first group is.
        focus: () => body.querySelector<HTMLElement>('input, select, button')?.focus(),
      };
    },
    shortcuts: () => {
      const body = document.createElement('div');
      // The user's own `\`-triggers are edited in their own mode; this
      // reference is where someone looking for shortcuts arrives first.
      const custom = document.createElement('button');
      custom.type = 'button';
      custom.className = 'btn btn--secondary btn--slim shortcut-list__custom';
      custom.textContent = 'Custom shortcuts…';
      custom.addEventListener('click', () => open('customShortcuts', custom));
      body.append(buildShortcutHints(), custom);
      const status = document.createElement('p');
      status.textContent = 'Panel shortcuts, and where to change the browser ones';
      return {
        body,
        // Nothing to operate here but the Chrome link and Close, so focus
        // the section: its heading is announced and Tab reaches the rest.
        focus: () => {
          built.get('shortcuts')?.section.focus();
        },
      };
    },
  };

  const ensure = (mode: OpenableMode): ModeSection => {
    let entry = built.get(mode);
    if (!entry) {
      entry = buildSection(mode, builders[mode]());
      built.set(mode, entry);
    }
    return entry;
  };

  const show = (mode: WorkspaceMode): void => {
    symbols.hidden = mode !== 'symbols';
    for (const [name, entry] of built) entry.section.hidden = name !== mode;
    current = mode;
  };

  const open = (mode: OpenableMode, from: HTMLElement | null = null): void => {
    const previous = current;
    if (previous !== 'symbols' && previous !== mode) {
      built.get(previous as OpenableMode)?.view.onClose?.();
    }
    opener = from;
    const entry = ensure(mode);
    show(mode);
    if (previous !== mode) entry.view.onOpen?.();
    // A mode always opens at its top: the scroller is the panel body, which
    // the workspace sits inside (see main.ts).
    const scroller = root.closest<HTMLElement>('.panel-body');
    if (scroller) scroller.scrollTop = 0;
    entry.view.focus();
  };

  const close = (focus: CloseFocus = 'field'): void => {
    if (current === 'symbols') return;
    const entry = built.get(current as OpenableMode);
    const from = opener;
    opener = null;
    show('symbols');
    entry?.view.onClose?.();
    if (focus === 'field') {
      editor.focus();
    } else if (focus === 'opener') {
      if (isShown(from)) {
        from.focus();
      } else {
        editor.focus();
      }
    }
  };

  // Escape anywhere in an open mode closes it and returns to the field –
  // unless something inside already used the key (a form's own cancel, a
  // roving list's exit), which it marks with preventDefault.
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || current === 'symbols') return;
    event.preventDefault();
    close('field');
  });

  // ------------------------------------------------------------- capture
  const capture = createLibraryCapture(editor, {
    show: (title, from) => {
      const entry = ensure('save');
      entry.title.textContent = title;
      open('save', from);
      return entry.view.body;
    },
    hide: () => close('none'),
  });

  return {
    root,
    capture,
    open,
    close,
    current: () => current,
  };
}
