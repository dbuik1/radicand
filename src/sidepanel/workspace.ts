/**
 * The workspace: the tabbed zone under the equation actions. Four tabs, one
 * shown at a time: Symbols (search, categories and the symbol well), Draw,
 * Library and Shortcuts. Three further views open over a tab and hand back
 * to it when closed: Save to library (over Library), Keyboard shortcuts
 * (over Shortcuts) and Settings (over whichever tab was showing, with the
 * tab bar put away, since Settings belongs to no tab).
 *
 * Keyboard contract: the tab bar is one Tab stop with arrow keys between
 * tabs, and selecting a tab shows its panel without moving focus into it.
 * Escape inside a tab returns to the equation field and leaves the tab
 * showing; Escape inside a view opened over a tab closes that view. A view
 * closed with its own button returns focus to whatever opened it when that
 * is still on screen, otherwise to the field.
 *
 * Switching the tabs off in Settings puts the tab bar and the four tabs
 * away; a view opened over them (Settings itself, or Save to library from
 * its shortcut) still shows, so a user ticking boxes in Settings is never
 * thrown out of the form they are working in.
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
import { bindPart, bindToSettings } from './part-visibility';

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
  /** The workspace section. */
  root: HTMLElement;
  /** The Save-to-library capture (its button lives in the Library tab). */
  capture: LibraryCapture;
  /**
   * Show a mode; `opener` is where closing returns focus to. `focus: false`
   * leaves focus where it is (a tab selected from the tab bar).
   */
  open: (mode: OpenableMode, opener?: HTMLElement | null, focus?: boolean) => void;
  /**
   * Close a view opened over a tab and go back to that tab. On a tab itself
   * nothing closes; only the focus move applies.
   */
  close: (focus?: CloseFocus) => void;
  /** Show the Symbols tab. */
  showSymbols: () => void;
  current: () => WorkspaceMode;
}

const MODE_TITLES: Record<OpenableMode, string> = {
  drawing: 'Draw',
  library: 'Library',
  customShortcuts: 'Shortcuts',
  save: 'Save to library',
  settings: 'Settings',
  shortcuts: 'Keyboard shortcuts',
};

/** The four tabs, in order, and the mode each one shows. */
const TABS: readonly { mode: TabMode; label: string }[] = [
  { mode: 'symbols', label: 'Symbols' },
  { mode: 'drawing', label: 'Draw' },
  { mode: 'library', label: 'Library' },
  { mode: 'customShortcuts', label: 'Shortcuts' },
];
type TabMode = 'symbols' | 'drawing' | 'library' | 'customShortcuts';
const isTabMode = (mode: WorkspaceMode): mode is TabMode =>
  TABS.some((tab) => tab.mode === mode);

/** The label on the button that closes a view opened over a tab. */
const CLOSE_LABELS: Partial<Record<OpenableMode, string>> = {
  settings: 'Close settings',
  shortcuts: 'Close shortcut list',
};

/** A built mode: its content plus the hooks the shell drives. */
interface ModeView {
  body: HTMLElement;
  /** A live status line shown above the body, where the mode has one. */
  status?: HTMLElement;
  /** Land focus on the mode's first control. */
  focus: () => void;
  onOpen?: () => void;
  onClose?: () => void;
}

interface ModeSection {
  section: HTMLElement;
  /** The visible heading of a view opened over a tab; tabs have none. */
  title?: HTMLHeadingElement;
  view: ModeView;
}

/** Is the element rendered (not display:none or detached)? */
function isShown(el: HTMLElement | null | undefined): el is HTMLElement {
  if (!el || !el.isConnected) return false;
  if (typeof el.checkVisibility === 'function') return el.checkVisibility();
  return !el.hidden;
}

export interface WorkspaceHooks {
  /** Open the quick search under the field (Draw's Search instead). */
  onSearch: () => void;
}

export function createWorkspace(editor: EditorController, { onSearch }: WorkspaceHooks): Workspace {
  const root = document.createElement('section');
  root.id = 'workspace';
  root.className = 'workspace';
  root.setAttribute('aria-label', 'Tools');
  root.tabIndex = -1;

  let current: WorkspaceMode = 'symbols';
  /** The tab that is showing, or that the open view sits over. */
  let tab: TabMode = 'symbols';
  let tabsShown = true;
  let opener: HTMLElement | null = null;
  const built = new Map<OpenableMode, ModeSection>();

  // ---------------------------------------------------------------- tabs
  const tablist = document.createElement('div');
  tablist.className = 'tabs';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Tools');
  const tabButtons = new Map<TabMode, HTMLButtonElement>();
  for (const { mode, label } of TABS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `tab-${mode}`;
    button.className = 'tabs__tab';
    button.textContent = label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `panel-${mode}`);
    button.addEventListener('click', () => select(mode));
    tabButtons.set(mode, button);
    tablist.appendChild(button);
  }
  tablist.addEventListener('keydown', (event: KeyboardEvent) => {
    const index = TABS.findIndex(({ mode }) => tabButtons.get(mode) === event.target);
    if (index === -1) return;
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    const mode = TABS[next]!.mode;
    select(mode);
    tabButtons.get(mode)!.focus();
  });
  root.appendChild(tablist);

  // ------------------------------------------------------------- symbols
  const symbols = document.createElement('section');
  symbols.className = 'mode mode--symbols';
  symbols.id = 'panel-symbols';
  symbols.dataset.mode = 'symbols';
  symbols.setAttribute('role', 'tabpanel');
  symbols.setAttribute('aria-labelledby', 'tab-symbols');
  symbols.appendChild(createPalette(editor).root);
  root.appendChild(symbols);

  // ---------------------------------------------------------- mode shell
  const buildSection = (mode: OpenableMode, view: ModeView): ModeSection => {
    const section = document.createElement('section');
    section.className = `mode mode--${mode}`;
    section.dataset.mode = mode;
    section.tabIndex = -1;
    section.hidden = true;

    let title: HTMLHeadingElement | undefined;
    if (isTabMode(mode)) {
      section.id = `panel-${mode}`;
      section.setAttribute('role', 'tabpanel');
      section.setAttribute('aria-labelledby', `tab-${mode}`);
    } else {
      title = document.createElement('h2');
      title.className = 'mode__title';
      title.id = `mode-${mode}-title`;
      title.textContent = MODE_TITLES[mode];
      section.setAttribute('aria-labelledby', title.id);
      section.appendChild(title);
    }

    if (view.status) {
      view.status.classList.add('mode__status');
      section.appendChild(view.status);
    }
    view.body.classList.add('mode__body');
    section.appendChild(view.body);

    // DOM order = Tab order: the body's controls, then the close button
    // last; the grid in styles.css draws it beside the title.
    const closeLabel = CLOSE_LABELS[mode];
    if (closeLabel) {
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn btn--secondary btn--slim mode__close';
      closeBtn.textContent = closeLabel;
      closeBtn.addEventListener('click', () => close('opener'));
      section.appendChild(closeBtn);
    }
    root.appendChild(section);
    return title ? { section, title, view } : { section, view };
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
      // Saving starts here, beside the formulae it adds to.
      capture.button.classList.add('library-save');
      bindPart('saveToLibrary', capture.button);
      body.append(capture.button, panel.element);
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
      // The panel's own keys are a different list from the user's triggers,
      // and this is where someone looking for shortcuts arrives.
      const keys = document.createElement('button');
      keys.type = 'button';
      keys.className = 'btn btn--secondary shortcut-list__open';
      keys.textContent = 'Keyboard shortcuts';
      keys.addEventListener('click', () => open('shortcuts', keys));
      body.append(panel.element, keys);
      return {
        body,
        status: panel.status,
        focus: panel.focus,
        // A form left open is abandoned: the tab always reopens on the list.
        onClose: panel.reset,
      };
    },
    save: () => {
      const body = document.createElement('div');
      return {
        body,
        // The form focuses its Name field itself once mounted.
        focus: () => body.querySelector<HTMLElement>('input')?.focus(),
        onClose: () => body.replaceChildren(),
      };
    },
    settings: () => {
      const body = createSettingsView();
      return {
        body,
        // The first control in the form, whatever the first group is.
        focus: () => body.querySelector<HTMLElement>('input, select, button')?.focus(),
      };
    },
    shortcuts: () => {
      const body = document.createElement('div');
      body.append(buildShortcutHints());
      return {
        body,
        // Nothing to operate here but the Chrome link and the close button,
        // so focus the section: its heading is announced and Tab reaches
        // the rest.
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
    current = mode;
    // Settings belongs to no tab, so the tab bar steps aside for it.
    tablist.hidden = !tabsShown || mode === 'settings';
    const visible = (name: WorkspaceMode): boolean =>
      name === mode && (tabsShown || !isTabMode(name));
    symbols.hidden = !visible('symbols');
    for (const [name, entry] of built) entry.section.hidden = !visible(name);
    for (const [name, button] of tabButtons) {
      const selected = name === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    root.dataset.mode = mode;
  };

  const open = (mode: OpenableMode, from: HTMLElement | null = null, focus = true): void => {
    const previous = current;
    if (previous !== 'symbols' && previous !== mode) {
      built.get(previous as OpenableMode)?.view.onClose?.();
    }
    opener = from;
    if (isTabMode(mode)) tab = mode;
    else if (mode === 'save') tab = 'library';
    else if (mode === 'shortcuts') tab = 'customShortcuts';
    // The selected tab names its panel (aria-controls), so the panel under
    // a view exists even when the view was opened first.
    if (tab !== 'symbols') ensure(tab);
    const entry = ensure(mode);
    show(mode);
    if (previous !== mode) entry.view.onOpen?.();
    // A mode always opens at its top: the scroller is the panel body, which
    // the workspace sits inside (see main.ts).
    const scroller = root.closest<HTMLElement>('.panel-body');
    if (scroller) scroller.scrollTop = 0;
    if (focus) entry.view.focus();
  };

  const showSymbols = (): void => {
    if (current !== 'symbols') built.get(current as OpenableMode)?.view.onClose?.();
    opener = null;
    tab = 'symbols';
    show('symbols');
  };

  /** A tab chosen from the tab bar: its panel shows and focus stays put. */
  function select(mode: TabMode): void {
    if (mode === 'symbols') showSymbols();
    else open(mode, null, false);
  }

  const close = (focus: CloseFocus = 'field'): void => {
    const from = opener;
    opener = null;
    if (!isTabMode(current)) {
      built.get(current)?.view.onClose?.();
      if (tab === 'symbols') {
        show('symbols');
      } else {
        const under = ensure(tab);
        show(tab);
        under.view.onOpen?.();
      }
    }
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

  // Escape returns to the field: from a view opened over a tab it closes
  // that view first. Something inside may already have used the key (a
  // form's own cancel, a roving list's exit), which it marks with
  // preventDefault; the Symbols tab handles its own Escape the same way.
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (current === 'symbols' && !tablist.contains(event.target as Node | null)) return;
    event.preventDefault();
    close('field');
  });

  // ------------------------------------------------------------- capture
  const capture = createLibraryCapture(editor, {
    show: (title, from) => {
      const entry = ensure('save');
      if (entry.title) entry.title.textContent = title;
      open('save', from);
      return entry.view.body;
    },
    hide: () => close('none'),
  });

  bindToSettings((settings) => {
    tabsShown = settings.parts.symbols;
    show(current);
  });

  return {
    root,
    capture,
    open,
    close,
    showSymbols,
    current: () => current,
  };
}
