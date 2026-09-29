/**
 * Service worker.
 *
 * Responsibilities: Set up the side panel behaviour so the toolbar action and the
 * _execute_action keyboard shortcut both toggle it open/closed. Handle the custom
 * toggle-symbols command that shows or hides the symbols workspace. The panel
 * itself hosts all editor logic; the worker never touches a host page.
 */
import { SETTINGS_STORAGE_KEY, getSettingsStorageArea } from './settings-storage';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => {
      // Non-fatal: log for diagnostics.
      console.error('Failed to set side panel behaviour:', error);
    });
});

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
// The _execute_action command is reserved and triggers the toolbar action natively;
// only custom commands like toggle-symbols reach this listener.
chrome.commands.onCommand.addListener((command, tab) => {
  switch (command) {
    case 'toggle-symbols':
      openSidePanel(tab?.windowId);
      toggleSymbols();
      break;
    default:
      break;
  }
});
