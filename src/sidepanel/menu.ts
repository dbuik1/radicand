/**
 * A shared drop-down menu: a trigger button that opens a list of actions,
 * following the WAI-ARIA menu button pattern. Used for the Style ▾ and
 * More ▾ menus in the equation header and for the Copy format ▾ half of the
 * split Copy button in the actions bar.
 *
 * Accessibility:
 * - The trigger carries `aria-haspopup="menu"`, `aria-expanded` and
 *   `aria-controls`; the list is `role="menu"` named by the trigger.
 * - Items are `menuitem`, `menuitemcheckbox` or `menuitemradio` buttons with
 *   `tabindex="-1"`: the list is a single Tab stop that never traps focus.
 *   Enter, Space, ArrowDown (or ArrowUp, to the last item) open the menu and
 *   move focus into it; ArrowUp/ArrowDown wrap, Home/End jump, typing a
 *   letter jumps to the next item starting with it.
 * - Escape closes and returns focus to the trigger. Tab closes without
 *   trapping: focus continues from the trigger to whatever follows it.
 * - Activating an item runs its handler and closes the menu, returning focus
 *   to the trigger unless the handler moves focus itself (`focusAfter`).
 * - Checked states are read from each item's `checked()` on every open (and
 *   on {@link MenuController.sync}), so the menu always reports the truth
 *   rather than a cached copy.
 * - Keyboard shortcut hints are visible text hidden from the accessible name
 *   and carried on `aria-keyshortcuts` instead, so they are announced as
 *   shortcuts rather than read as part of the label.
 */

export interface MenuItem {
  /** `item` (the default), a toggle `checkbox`, or one of a `radio` set. */
  kind?: 'item' | 'checkbox' | 'radio';
  /** Visible label and accessible name. */
  label: string;
  /**
   * One short line under the label saying what the item leads to, read as
   * part of the item's name after the label ("My library, whole saved
   * equations").
   */
  detail?: string;
  /** Optional glyph in a fixed leading column (decorative; hidden from AT). */
  glyph?: string;
  /** Visible keyboard-shortcut hint, e.g. "Ctrl+B". */
  shortcut?: string;
  /** `aria-keyshortcuts` value when it differs from the hint, e.g. "Control+B". */
  keyshortcuts?: string;
  /** Current state for checkbox/radio items, read on every open and sync. */
  checked?: () => boolean | 'mixed';
  /**
   * Whether the item is offered at all, read on every open and sync. An item
   * whose target is not on screen (a piece of interface the user switched
   * off) is left out rather than disabled: from here there is nothing the
   * user could do to make it work. Arrow keys, Home/End and typeahead all
   * step over what is left out.
   */
  shown?: () => boolean;
  /** Runs on activation, after the menu has closed. */
  onSelect: () => void;
  /**
   * Where focus goes after activation: back to the trigger (the default), or
   * nowhere (`'none'`) when the handler moves focus itself – e.g. into the
   * equation field or a disclosure it just opened.
   */
  focusAfter?: 'trigger' | 'none';
}

export interface MenuSeparator {
  kind: 'separator';
}

export type MenuEntry = MenuItem | MenuSeparator;

export interface MenuOptions {
  /** Base id: the trigger is `<id>-trigger`, the list `<id>-menu`. */
  id: string;
  /** Visible trigger text (before the ▾ chevron). Empty for an icon-only trigger. */
  label: string;
  /** Accessible name for the trigger when the visible text is not enough. */
  triggerAriaLabel?: string;
  /** Extra classes for the trigger (defaults to a secondary button). */
  triggerClass?: string;
  entries: MenuEntry[];
  /** Which edge of the trigger the list aligns to (default: start). */
  align?: 'start' | 'end';
  /** Open below (default) or above the trigger (for a bottom-pinned bar). */
  direction?: 'down' | 'up';
  /** Called just before the list is shown (after the checked states sync). */
  onOpen?: () => void;
}

export interface MenuController {
  /** The wrapper holding trigger and list; mount this. */
  root: HTMLElement;
  trigger: HTMLButtonElement;
  menu: HTMLElement;
  open: (focus?: 'first' | 'last') => void;
  /** Close; `focusTrigger` (default true) returns focus to the trigger. */
  close: (focusTrigger?: boolean) => void;
  /** Re-read every checkbox/radio item's checked state. */
  sync: () => void;
  isOpen: () => boolean;
}

/** The least a list keeps clear of the viewport's side edges. */
const MENU_VIEWPORT_GAP = 8;

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return entry.kind === 'separator';
}

function roleFor(kind: MenuItem['kind']): string {
  switch (kind) {
    case 'checkbox':
      return 'menuitemcheckbox';
    case 'radio':
      return 'menuitemradio';
    default:
      return 'menuitem';
  }
}

export function createMenu(options: MenuOptions): MenuController {
  const triggerId = `${options.id}-trigger`;
  const menuId = `${options.id}-menu`;

  const root = document.createElement('div');
  root.className = 'menu';
  if (options.align === 'end') root.classList.add('menu--end');
  if (options.direction === 'up') root.classList.add('menu--up');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = triggerId;
  trigger.className = `${options.triggerClass ?? 'btn btn--secondary'} menu__trigger`;
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', menuId);
  if (options.triggerAriaLabel) trigger.setAttribute('aria-label', options.triggerAriaLabel);
  if (options.label) {
    const text = document.createElement('span');
    text.className = 'menu__trigger-label';
    text.textContent = options.label;
    trigger.appendChild(text);
  }
  const chevron = document.createElement('span');
  chevron.className = 'menu__chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▾';
  trigger.appendChild(chevron);

  const menu = document.createElement('div');
  menu.id = menuId;
  menu.className = 'menu__list';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-labelledby', triggerId);
  menu.hidden = true;

  const items: { el: HTMLButtonElement; spec: MenuItem }[] = [];

  for (const entry of options.entries) {
    if (isSeparator(entry)) {
      const sep = document.createElement('div');
      sep.className = 'menu__separator';
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
      continue;
    }
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'menu__item';
    el.setAttribute('role', roleFor(entry.kind));
    el.tabIndex = -1;
    if (entry.kind === 'checkbox' || entry.kind === 'radio') {
      el.classList.add('menu__item--checkable');
      el.setAttribute('aria-checked', 'false');
      const mark = document.createElement('span');
      mark.className = 'menu__check';
      mark.setAttribute('aria-hidden', 'true');
      el.appendChild(mark);
    }
    if (entry.glyph !== undefined) {
      const glyph = document.createElement('span');
      glyph.className = 'menu__glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = entry.glyph;
      el.appendChild(glyph);
    }
    const text = document.createElement('span');
    text.className = 'menu__text';
    const label = document.createElement('span');
    label.className = 'menu__label';
    label.textContent = entry.label;
    text.appendChild(label);
    if (entry.detail) {
      const detail = document.createElement('span');
      detail.className = 'menu__detail';
      detail.textContent = entry.detail;
      text.appendChild(detail);
    }
    el.appendChild(text);
    if (entry.shortcut) {
      const hint = document.createElement('span');
      hint.className = 'menu__shortcut';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = entry.shortcut;
      el.appendChild(hint);
      el.setAttribute('aria-keyshortcuts', entry.keyshortcuts ?? entry.shortcut);
    }
    el.addEventListener('click', () => activate(entry));
    items.push({ el, spec: entry });
    menu.appendChild(el);
  }

  root.append(trigger, menu);

  let openState = false;

  const sync = (): void => {
    for (const { el, spec } of items) {
      if (spec.shown) el.hidden = !spec.shown();
      if (!spec.checked) continue;
      const state = spec.checked();
      el.setAttribute('aria-checked', state === 'mixed' ? 'mixed' : String(state));
    }
  };

  /** The items currently offered – see `shown` on {@link MenuItem}. */
  const offered = (): { el: HTMLButtonElement; spec: MenuItem }[] =>
    items.filter(({ el }) => !el.hidden);

  const focusItem = (index: number): void => {
    const list = offered();
    if (list.length === 0) return;
    const wrapped = ((index % list.length) + list.length) % list.length;
    list[wrapped]!.el.focus();
  };

  const currentIndex = (): number =>
    offered().findIndex(({ el }) => el === document.activeElement);

  const onDocumentPointerDown = (event: Event): void => {
    if (!root.contains(event.target as Node)) close(false);
  };

  /**
   * Keep the list inside the viewport. It hangs from the trigger's edge
   * (`align`), which suits the trigger's usual place, but a docked panel is
   * narrow: the Copy format half sits at the left edge of its bar and
   * Style ▾ near the middle of the header, and a list that leaves the
   * viewport is one nobody can see or click. Measured on every open, so a
   * resize between opens is honoured too; the list is shifted sideways by
   * exactly the overflow, and the stylesheet's max-width keeps it narrower
   * than the panel, so a shift always finds room.
   */
  const place = (): void => {
    menu.style.removeProperty('transform');
    const rect = menu.getBoundingClientRect();
    if (rect.width === 0) return; // not laid out (a detached or test DOM)
    const gap = MENU_VIEWPORT_GAP;
    let shift = 0;
    if (rect.right > window.innerWidth - gap) shift = window.innerWidth - gap - rect.right;
    if (rect.left + shift < gap) shift = gap - rect.left;
    if (shift !== 0) menu.style.transform = `translateX(${Math.round(shift)}px)`;
  };

  const open = (focus: 'first' | 'last' = 'first'): void => {
    if (openState) {
      focusItem(focus === 'last' ? offered().length - 1 : 0);
      return;
    }
    openState = true;
    sync();
    options.onOpen?.();
    menu.hidden = false;
    place();
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    focusItem(focus === 'last' ? offered().length - 1 : 0);
  };

  const close = (focusTrigger = true): void => {
    if (!openState) return;
    openState = false;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    if (focusTrigger) trigger.focus();
  };

  const activate = (spec: MenuItem): void => {
    close(spec.focusAfter !== 'none');
    spec.onSelect();
  };

  trigger.addEventListener('click', () => {
    if (openState) close();
    else open('first');
  });
  trigger.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      open('last');
    }
  });

  menu.addEventListener('keydown', (event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(currentIndex() + 1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(currentIndex() - 1);
        return;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        return;
      case 'End':
        event.preventDefault();
        focusItem(offered().length - 1);
        return;
      case 'Escape':
        event.preventDefault();
        close(true);
        return;
      case 'Tab':
        // Not trapped: hand focus back to the trigger and let the browser's
        // default Tab/Shift+Tab move on from there.
        close(true);
        return;
      default:
        break;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const char = event.key.toLowerCase();
      const list = offered();
      const start = currentIndex();
      for (let step = 1; step <= list.length; step++) {
        const candidate = list[(start + step + list.length) % list.length]!;
        if (candidate.spec.label.toLowerCase().startsWith(char)) {
          event.preventDefault();
          candidate.el.focus();
          return;
        }
      }
    }
  });

  // Focus leaving the whole widget (a pointer click elsewhere, a programmatic
  // focus move) closes the list without pulling focus back.
  root.addEventListener('focusout', (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && root.contains(next)) return;
    if (!openState) return;
    // Defer: a click on an item blurs it before the click handler runs, and
    // that handler needs the menu still open to close it properly.
    requestAnimationFrame(() => {
      if (openState && !root.contains(document.activeElement)) close(false);
    });
  });

  return {
    root,
    trigger,
    menu,
    open,
    close,
    sync,
    isOpen: () => openState,
  };
}
