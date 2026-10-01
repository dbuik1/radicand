/**
 * The surfaces the editor opens in, and the one the toolbar icon uses.
 *
 * Shared by the panel (More ▾ menu, Settings) and the service worker (toolbar
 * icon and keyboard shortcut), which are bundled separately. The choice lives
 * in the ordinary settings record, so the worker reads it from the same
 * storage area the panel writes it to.
 */
import type { Surface } from './types';
import { popoutPlacement } from './popout-bounds';
import { SETTINGS_STORAGE_KEY, getSettingsStorageArea, hasSettingsStorage } from './settings-storage';

const SURFACES: readonly Surface[] = ['panel', 'window', 'tab'];

export const DEFAULT_SURFACE: Surface = 'panel';

/** Coerce a stored value onto one of the surfaces. */
export function normaliseSurface(value: unknown): Surface {
  return SURFACES.includes(value as Surface) ? (value as Surface) : DEFAULT_SURFACE;
}

/** Where the editor page lives inside the extension. */
const PANEL_PATH = 'src/sidepanel/index.html';

function panelUrl(): string {
  return chrome.runtime.getURL(PANEL_PATH);
}

/** Open the editor page in a detached popup window, at its remembered place. */
export async function createPopoutWindow(): Promise<void> {
  const placement = await popoutPlacement();
  await chrome.windows.create({ url: panelUrl(), type: 'popup', ...placement });
}

/** Open the editor page in a browser tab. */
export async function createEditorTab(): Promise<void> {
  await chrome.tabs.create({ url: panelUrl() });
}

/** The surface the toolbar icon is set to open, or the default. */
export async function readDefaultSurface(): Promise<Surface> {
  if (!hasSettingsStorage()) return DEFAULT_SURFACE;
  const stored = await getSettingsStorageArea().get(SETTINGS_STORAGE_KEY);
  const settings = (stored[SETTINGS_STORAGE_KEY] ?? {}) as { defaultSurface?: unknown };
  return normaliseSurface(settings.defaultSurface);
}
