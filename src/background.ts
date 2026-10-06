/**
 * Service worker.
 *
 * Responsibilities: Make the toolbar action and the _execute_action keyboard
 * shortcut (which Chrome turns into a toolbar click) open the surface the user
 * chose in Settings – the side panel natively, a pop-out window or a tab from
 * the action.onClicked handler. Handle the custom toggle-symbols command that
 * shows or hides the symbols workspace. The panel itself hosts all editor
 * logic; the worker never touches a host page.
 */
import { SETTINGS_STORAGE_KEY, getSettingsStorageArea } from './settings-storage';
import { createEditorTab, createPopoutWindow, readDefaultSurface } from './surface';
import type { Surface } from './types';

/**
 * The chosen surface as last read, or undefined until the first read after
 * the worker wakes. Chrome only lets `sidePanel.open` run inside the user
 * gesture that raised the event, so a handler that may open the panel has to
 * decide without awaiting storage.
 */
let knownSurface: Surface | undefined;

/**
 * Point the toolbar icon at the chosen surface. Chrome opens the side panel
 * by itself only while `openPanelOnActionClick` is set; otherwise the click
 * reaches action.onClicked below. The setting is stored by Chrome, but is
 * written again on every worker start and every change so it can never
 * disagree with the choice.
 */
async function applyToolbarBehaviour(): Promise<void> {
  const surface = await readDefaultSurface();
  knownSurface = surface;
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: surface === 'panel' });
}

function applyToolbarBehaviourLogged(): void {
  applyToolbarBehaviour().catch((error: unknown) => {
    // Non-fatal: log for diagnostics.
    console.error('Failed to set side panel behaviour:', error);
  });
}

applyToolbarBehaviourLogged();
chrome.runtime.onInstalled.addListener(applyToolbarBehaviourLogged);
chrome.runtime.onStartup.addListener(applyToolbarBehaviourLogged);
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'sync' || area === 'local') && changes[SETTINGS_STORAGE_KEY]) {
    applyToolbarBehaviourLogged();
  }
});

/** Open the editor in the given surface; the panel opens in `windowId`. */
function openSurface(surface: Surface, windowId: number | undefined): void {
  const opened =
    surface === 'window'
      ? createPopoutWindow()
      : surface === 'tab'
        ? createEditorTab()
        : Promise.resolve(openSidePanel(windowId));
  opened.catch((error: unknown) => console.error('Failed to open the editor:', error));
}

// With the side panel chosen Chrome never raises this event, so it only
// carries the window and tab choices – and the panel on the rare click that
// lands before the behaviour above has caught up with a change.
chrome.action.onClicked.addListener((tab) => {
  if (knownSurface !== undefined) {
    openSurface(knownSurface, tab.windowId);
    return;
  }
  readDefaultSurface()
    .then((surface) => openSurface(surface, tab.windowId))
    .catch((error: unknown) => console.error('Failed to open the editor:', error));
});

/**
 * Bring an editor page that is already open in a window or tab to the front.
 * Resolves false when there is none, so a repeated shortcut focuses the
 * editor instead of opening another copy of it.
 */
async function focusOpenEditor(): Promise<boolean> {
  const [context] = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.TAB],
    documentUrls: [chrome.runtime.getURL('src/sidepanel/index.html')],
  });
  if (!context || context.tabId < 0) return false;
  await chrome.tabs.update(context.tabId, { active: true });
  await chrome.windows.update(context.windowId, { focused: true });
  return true;
}

/** Open the side panel in the given window, or the last focused one. */
function openSidePanel(windowId: number | undefined): void {
  if (windowId !== undefined) {
    chrome.sidePanel
      .open({ windowId })
      .catch((error: unknown) => console.error('Failed to open side panel:', error));
    return;
  }
  chrome.windows
    .getLastFocused()
    .then((window) => {
      if (window.id !== undefined) return chrome.sidePanel.open({ windowId: window.id });
      return undefined;
    })
    .catch((error: unknown) => console.error('Failed to open side panel:', error));
}

/**
 * Flip the persisted flag for the symbol palette (`parts.symbols`, whose
 * pre-`parts` name was `symbolsOpen`; an absent value counts as shown, the
 * default). The panel reads the settings from storage and reacts to changes,
 * so this both sets the initial state when opening and toggles it live when
 * the panel is already open. Every other field, and every other interface
 * part, is preserved.
 */
function toggleSymbols(): void {
  const storage = getSettingsStorageArea();
  storage
    .get(SETTINGS_STORAGE_KEY)
    .then((stored) => {
      const settings = (stored[SETTINGS_STORAGE_KEY] ?? {}) as Record<string, unknown>;
      const parts = (settings.parts ?? {}) as Record<string, unknown>;
      const shown =
        typeof parts.symbols === 'boolean'
          ? parts.symbols
          : settings.symbolsOpen !== false;
      return storage.set({
        [SETTINGS_STORAGE_KEY]: { ...settings, parts: { ...parts, symbols: !shown } },
      });
    })
    .catch((error: unknown) => console.error('Failed to toggle the symbols:', error));
}

// Custom keyboard shortcut handlers (see the `commands` entry in the manifest).
// The _execute_action command is reserved and triggers the toolbar action natively,
// so it follows the chosen surface like a click; only custom commands like toggle-symbols reach this listener.
chrome.commands.onCommand.addListener((command, tab) => {
  switch (command) {
    case 'toggle-symbols':
      // Before the first read after a wake the choice is unknown and the
      // panel, the default, is assumed: only the panel needs the gesture.
      if (knownSurface === undefined || knownSurface === 'panel') {
        openSidePanel(tab?.windowId);
      } else {
        const surface = knownSurface;
        focusOpenEditor()
          .then((focused) => {
            if (!focused) openSurface(surface, tab?.windowId);
          })
          .catch((error: unknown) => console.error('Failed to open the editor:', error));
      }
      toggleSymbols();
      break;
    default:
      break;
  }
});
