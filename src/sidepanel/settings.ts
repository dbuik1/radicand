/**
 * Settings model and persistence.
 *
 * This module owns the settings *data*: defaults, load/save against
 * `chrome.storage.sync` (with fallback to `chrome.storage.local` when sync is
 * unavailable), and change notification. The settings *view* (the controls in
 * the panel) lives in settings-view.ts and talks to this module – keeping
 * data and UI separate.
 *
 * A small in-memory fallback is used when `chrome.storage` is unavailable
 * (e.g. unit tests, plain `vite preview`) so the rest of the app behaves
 * identically.
 */
import type { OutputFormat, Settings } from '../types';
import { DEFAULT_SURFACE, normaliseSurface } from '../surface';
import { DEFAULT_INTERFACE_PARTS, normaliseInterfaceParts } from './interface-parts';
import {
  SETTINGS_STORAGE_KEY as STORAGE_KEY,
  getSettingsStorageArea as getStorageArea,
  hasSettingsStorage as hasChromeStorage,
} from '../settings-storage';

export const DEFAULT_SETTINGS: Settings = {
  displayFormat: 'latex',
  copyFormat: 'mathml',
  theme: 'system',
  fontScale: 1,
  equationScale: 1,
  speechRuleSet: 'clearspeak',
  speechVerbosity: 'medium',
  commandDelay: 100,
  slashFraction: true,
  slashHintShown: false,
  autoFit: true,
  tidyBrackets: true,
  parts: { ...DEFAULT_INTERFACE_PARTS },
  defaultSurface: DEFAULT_SURFACE,
  sourceOpen: false,
  paletteCategory: 'Recent',
};

/** localStorage key for the synchronous last-applied-appearance cache (see below). */
const APPEARANCE_CACHE_KEY = 'appearance-cache';

type Listener = (settings: Settings) => void;
// Listeners live for the panel's lifetime (the panel never unmounts), so no leak concern.
const listeners = new Set<Listener>();

/** Cached snapshot so synchronous reads (e.g. on copy) are cheap. */
let current: Settings = { ...DEFAULT_SETTINGS };

/** The appearance-relevant subset of Settings, cached synchronously (see below). */
type AppearanceCache = Pick<Settings, 'theme' | 'fontScale' | 'equationScale'>;

/**
 * Persist the appearance-relevant slice of settings to `localStorage` on every
 * save, so the *next* load can paint with it synchronously – before the
 * `chrome.storage.sync` round trip resolves – avoiding a flash of the wrong
 * theme. This is a best-effort cache, never the source of truth: `getSettings`
 * and `loadSettings` still only ever read `chrome.storage`. Non-fatal if
 * `localStorage` is unavailable (e.g. some embedding contexts) or throws.
 */
function cacheAppearance(settings: Settings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const cache: AppearanceCache = {
      theme: settings.theme,
      fontScale: settings.fontScale,
      equationScale: settings.equationScale,
    };
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage unavailable/full – the next load simply won't have a cache.
  }
}

/**
 * Synchronously read the last-cached appearance (falling back to the current
 * in-memory settings for anything missing/invalid). Intended to be called
 * once, at boot, before the UI is first painted – so the panel doesn't flash
 * the default theme while the real `chrome.storage.sync` read is still in
 * flight.
 */
export function getCachedAppearance(): Settings {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(APPEARANCE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppearanceCache>;
        return normalise({ ...current, ...parsed });
      }
    } catch {
      // Malformed/unavailable cache – fall through to the in-memory settings.
    }
  }
  return current;
}

/**
 * Coerce a stored format value onto the formats the extension still offers.
 * `asciimath` and `accessible` were once selectable and may survive in synced
 * storage; map each to its nearest current equivalent rather than silently
 * jumping to an unrelated default.
 */
function normaliseFormat(value: unknown, fallback: OutputFormat): OutputFormat {
  if (value === 'mathml' || value === 'latex') return value;
  if (value === 'asciimath') return 'latex';
  if (value === 'accessible') return 'mathml';
  return fallback;
}

/**
 * Snap a stored font scale from an older version's steps onto the current
 * scale (root 18px × multiplier → 16 / 18 / 20 / 22 / 24 px), so the
 * Font-size select still reflects a choice synced from an older version.
 * Unknown positive values pass through unchanged.
 */
function normaliseFontScale(value: number): number {
  const legacy: Record<string, number> = {
    '0.875': 16 / 18,
    '1.125': 20 / 18,
    '1.25': 22 / 18,
    '1.5': 24 / 18,
  };
  return legacy[String(value)] ?? value;
}

/** Coerce a stored value onto one of an enum's allowed members. */
function normaliseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Coerce stored data back into a valid Settings object, tolerating gaps. */
function normalise(raw: unknown): Settings {
  // `defaultFormat` is the pre-split legacy key; fall back to it for copy.
  const r = (raw ?? {}) as Partial<Settings> & {
    defaultFormat?: Settings['copyFormat'];
    symbolsOpen?: boolean;
  };
  return {
    displayFormat: normaliseFormat(r.displayFormat, DEFAULT_SETTINGS.displayFormat),
    copyFormat: normaliseFormat(r.copyFormat ?? r.defaultFormat, DEFAULT_SETTINGS.copyFormat),
    theme: normaliseEnum(
      r.theme,
      ['system', 'light', 'dark', 'high-contrast'],
      DEFAULT_SETTINGS.theme,
    ),
    fontScale:
      typeof r.fontScale === 'number' && r.fontScale > 0
        ? normaliseFontScale(r.fontScale)
        : DEFAULT_SETTINGS.fontScale,
    equationScale:
      typeof r.equationScale === 'number' && r.equationScale > 0
        ? r.equationScale
        : DEFAULT_SETTINGS.equationScale,
    speechRuleSet: normaliseEnum(
      r.speechRuleSet,
      ['clearspeak', 'mathspeak'],
      DEFAULT_SETTINGS.speechRuleSet,
    ),
    speechVerbosity: normaliseEnum(
      r.speechVerbosity,
      ['terse', 'medium', 'verbose'],
      DEFAULT_SETTINGS.speechVerbosity,
    ),
    commandDelay:
      typeof r.commandDelay === 'number' && r.commandDelay >= 0
        ? r.commandDelay
        : DEFAULT_SETTINGS.commandDelay,
    slashFraction: typeof r.slashFraction === 'boolean' ? r.slashFraction : DEFAULT_SETTINGS.slashFraction,
    slashHintShown:
      typeof r.slashHintShown === 'boolean' ? r.slashHintShown : DEFAULT_SETTINGS.slashHintShown,
    autoFit: typeof r.autoFit === 'boolean' ? r.autoFit : DEFAULT_SETTINGS.autoFit,
    tidyBrackets:
      typeof r.tidyBrackets === 'boolean' ? r.tidyBrackets : DEFAULT_SETTINGS.tidyBrackets,
    // `symbolsOpen` is the pre-`parts` key for the symbol palette's flag.
    parts: normaliseInterfaceParts(r.parts, r.symbolsOpen),
    defaultSurface: normaliseSurface(r.defaultSurface),
    sourceOpen: typeof r.sourceOpen === 'boolean' ? r.sourceOpen : DEFAULT_SETTINGS.sourceOpen,
    paletteCategory:
      typeof r.paletteCategory === 'string' && r.paletteCategory.length > 0
        ? r.paletteCategory
        : DEFAULT_SETTINGS.paletteCategory,
  };
}

/**
 * Patch of every change made through {@link updateSettings} before the initial
 * {@link loadSettings} read resolved. Boot deliberately does not await that
 * read (first paint must not block on a storage round trip), so a fast first
 * interaction – a toggle, a slider nudge – can land while it is in flight.
 * Merging this patch over the persisted snapshot keeps those changes from
 * being silently reverted when the read completes.
 */
let earlyPatch: Partial<Settings> = {};
let loadResolved = false;

/** Load settings once at startup. Subsequent reads use {@link getSettings}. */
export async function loadSettings(): Promise<Settings> {
  if (hasChromeStorage()) {
    const before = current;
    const storage = getStorageArea();
    const stored = await storage.get(STORAGE_KEY);
    let persisted: unknown = stored[STORAGE_KEY];

    // One-time migration: if sync has no settings but local does, use local and copy to sync.
    if (!persisted) {
      try {
        const local = await chrome.storage.local.get(STORAGE_KEY);
        if (local[STORAGE_KEY]) {
          persisted = local[STORAGE_KEY];
          await storage.set({ [STORAGE_KEY]: normalise(persisted) });
          await chrome.storage.local.remove(STORAGE_KEY);
        }
      } catch (error) {
        console.error('Failed to migrate settings from local to sync:', error);
      }
    }

    current = normalise({ ...((persisted as Partial<Settings>) ?? {}), ...earlyPatch });
    loadResolved = true;

    cacheAppearance(current);
    // The caller may already have built the UI from in-memory defaults (to
    // avoid blocking first paint on this round trip – see boot() in main.ts).
    // Notify subscribers now if the persisted value turned out to differ, so
    // those already-built views pick up the real settings.
    if (JSON.stringify(current) !== JSON.stringify(before)) {
      for (const listener of listeners) listener(current);
    }

    // Keep the cache fresh if settings change in another context.
    chrome.storage.onChanged.addListener((changes, area) => {
      if ((area === 'sync' || area === 'local') && changes[STORAGE_KEY]) {
        const next = normalise(changes[STORAGE_KEY].newValue);
        // Skip re-notification when the value hasn't actually changed – this
        // would otherwise notify twice in the context that made the change.
        if (JSON.stringify(next) === JSON.stringify(current)) return;
        current = next;
        cacheAppearance(current);
        for (const listener of listeners) listener(current);
      }
    });
  }
  // With no chrome.storage there is nothing in flight to race against.
  loadResolved = true;
  return current;
}

/** Synchronous access to the most recently loaded settings. */
export function getSettings(): Settings {
  return current;
}

/** Trailing-debounce handle for the persistence write (see updateSettings). */
let persistTimer: ReturnType<typeof setTimeout> | undefined;

/** Write the current settings to storage now, logging (never throwing) failure. */
function persistNow(): void {
  persistTimer = undefined;
  if (!hasChromeStorage()) return;
  getStorageArea()
    .set({ [STORAGE_KEY]: current })
    .catch((error: unknown) => console.error('Failed to save settings:', error));
}

// Flush any pending write when the panel is closed or navigated away, so a
// change made just before closing is never lost to the debounce window.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistNow();
    }
  });
}

/** Merge and persist a partial update; notifies subscribers synchronously. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  // Remember changes made while the initial storage read is still in flight,
  // so loadSettings can replay them over the persisted snapshot (see above).
  if (!loadResolved) earlyPatch = { ...earlyPatch, ...patch };
  current = normalise({ ...current, ...patch });
  cacheAppearance(current);
  // Always notify listeners synchronously for instant UI updates.
  for (const listener of listeners) listener(current);
  // Persist on a short trailing debounce: rapid successive updates (e.g. the
  // equation-size slider firing once per step of a drag) coalesce into a
  // single write, staying well within chrome.storage.sync's write quotas
  // (MAX_WRITE_OPERATIONS_PER_MINUTE is only 120). A failed write is logged,
  // never thrown – the in-memory settings and the UI stay correct either way.
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 400);
  return current;
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
