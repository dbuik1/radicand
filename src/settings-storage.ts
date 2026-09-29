/**
 * The chrome.storage location of the persisted settings – shared between the
 * side panel (sidepanel/settings.ts) and the service worker (background.ts).
 * The two are bundled separately, so this tiny module keeps them from
 * re-implementing (and drifting on) the key and area choice. It also holds
 * the one availability guard every persisting module uses, so the rule for
 * "no chrome.storage here – keep the data in memory" is stated once.
 */

export const SETTINGS_STORAGE_KEY = 'settings';

/**
 * Whether `chrome.storage.<area>` exists in this context. It is absent in
 * unit tests and a plain `vite preview`, where every store falls back to
 * memory.
 */
export function hasChromeStorage(area: 'sync' | 'local' = 'local'): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.[area];
}

/** Whether getSettingsStorageArea() has an area to return. */
export function hasSettingsStorage(): boolean {
  return hasChromeStorage('sync') || hasChromeStorage('local');
}

/** The storage area settings live in: sync (preferred) or local (fallback). */
export function getSettingsStorageArea(): chrome.storage.StorageArea {
  return chrome.storage.sync || chrome.storage.local;
}
