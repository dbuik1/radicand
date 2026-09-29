/**
 * Keyboard shortcuts reference: the read-only list that is the body of the
 * workspace's Keyboard shortcuts mode (More ▾ › Keyboard shortcuts). The
 * browser-registered bindings are read live where `chrome.commands` exists,
 * because the user can rebind them at chrome://extensions/shortcuts; the
 * panel-local shortcuts are always listed.
 */
import {
  COPY_SHORTCUT_LABEL,
  PANEL_SHORTCUT_LABEL,
  SAVE_SHORTCUT_LABEL,
  SEARCH_SHORTCUT_LABEL,
  SETTINGS_SHORTCUT_LABEL,
  SYMBOLS_SHORTCUT_LABEL,
} from './shortcut-labels';

/**
 * A real link to Chrome's shortcut-editing page. Chrome blocks extension
 * pages from navigating to `chrome://` URLs directly, so a plain click is
 * intercepted and routed through `chrome.tabs.create` instead (this does not
 * require the "tabs" permission). In contexts without `chrome.tabs` (e.g. the
 * unit-test harness, or a plain browser tab this file is opened in), the
 * anchor's normal `href` navigation is left to fall through – Chrome will
 * simply block it there, same as before.
 *
 * A genuine `<a>` gives Enter-key activation and correct AT semantics for
 * free, unlike a styled `<button>` or `<span>` standing in for a link.
 */
function buildShortcutsLink(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'shortcut-list__link';
  link.href = 'chrome://extensions/shortcuts';
  link.textContent = 'Change shortcuts in Chrome…';
  link.addEventListener('click', (event) => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      event.preventDefault();
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch((error: unknown) => {
        console.error('Failed to open the shortcuts page:', error);
      });
    }
    // Otherwise (no chrome.tabs, e.g. test harness) let the default `href`
    // navigation attempt proceed/fail as a plain link would.
  });
  return link;
}

/** One shortcut row: the action's name on the left, a kbd chip on the right. */
function shortcutRow(description: string, shortcut: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'shortcut-list__row';

  const desc = document.createElement('span');
  desc.className = 'shortcut-list__desc';
  desc.textContent = description;

  const kbd = document.createElement('kbd');
  kbd.textContent = shortcut;

  row.append(desc, kbd);
  return row;
}

/** Build the read-only keyboard shortcuts block (kbd chips + Chrome link). */
export function buildShortcutHints(): HTMLElement {
  const list = document.createElement('div');
  list.className = 'shortcut-list';
  list.textContent = 'Loading…';

  const defaults = [
    { description: 'Open or close the panel', shortcut: PANEL_SHORTCUT_LABEL },
    { description: 'Show or hide the symbols', shortcut: SYMBOLS_SHORTCUT_LABEL },
  ];

  const renderList = (items: { description: string; shortcut: string }[]): void => {
    list.replaceChildren();
    for (const item of items) {
      list.appendChild(shortcutRow(item.description, item.shortcut));
    }
    // "Copy the equation" is a panel-local shortcut (not registered with
    // chrome.commands), so it is always listed here regardless of whether the
    // fetch below succeeds.
    list.appendChild(shortcutRow('Copy the equation', COPY_SHORTCUT_LABEL));
    list.appendChild(shortcutRow('Save to library', SAVE_SHORTCUT_LABEL));
    list.appendChild(shortcutRow('Search for a symbol', SEARCH_SHORTCUT_LABEL));
    list.appendChild(shortcutRow('Build a fraction while typing', '/'));
    list.appendChild(shortcutRow('Open settings', SETTINGS_SHORTCUT_LABEL));
    // The `\` finder's keys: typed in the field, so they are never in
    // chrome.commands – always listed here.
    list.appendChild(shortcutRow('Find a command', '\\ then letters'));
    list.appendChild(shortcutRow('Choose from the command list', 'Arrow Up / Down'));
    list.appendChild(shortcutRow('Insert the highlighted command', 'Enter, Tab or space'));
    list.appendChild(buildShortcutsLink());
  };

  // Users can rebind these at chrome://extensions/shortcuts, so report the
  // live bindings where the API is available and treat `defaults` as a
  // fallback.
  if (typeof chrome !== 'undefined' && chrome.commands?.getAll) {
    chrome.commands
      .getAll()
      .then((commands) => {
        renderList(
          commands.map((cmd) => ({
            description:
              cmd.name === '_execute_action' ? 'Open or close the panel' : cmd.description || 'Extension shortcut',
            shortcut: cmd.shortcut || 'Not set',
          })),
        );
      })
      .catch(() => renderList(defaults));
  } else {
    // Fallback when chrome.commands is not available (happy-dom in tests)
    renderList(defaults);
  }

  return list;
}
