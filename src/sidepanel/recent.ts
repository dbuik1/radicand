/**
 * Recently-used symbols for the palette's "Recent" tab.
 *
 * This is a small palette convenience (a list of symbol descriptors), not an
 * equation history – it stores no equations the user has authored, only which
 * palette symbols were last used. It is persisted to `chrome.storage.local`
 * (best effort; falls back to in-memory) so the Recent tab stays useful
 * across sessions.
 */
import { hasChromeStorage } from '../settings-storage';

export interface RecentSymbol {
  glyph: string;
  label: string;
  latex: string;
}

const STORAGE_KEY = 'recentSymbols';
const MAX = 12;

/** Sensible starting set so "Recent" is useful before any symbol is used. */
const SEED: RecentSymbol[] = [
  { glyph: '½', label: 'Fraction', latex: '\\frac{#?}{#?}' },
  { glyph: '√', label: 'Square root', latex: '\\sqrt{#?}' },
  { glyph: 'xⁿ', label: 'Superscript (power)', latex: '#?^{#?}' },
  { glyph: 'xₙ', label: 'Subscript', latex: '#?_{#?}' },
  { glyph: 'π', label: 'Greek small letter pi', latex: '\\pi' },
  { glyph: '×', label: 'Multiplication sign', latex: '\\times' },
  { glyph: '≤', label: 'Less than or equal to', latex: '\\le' },
  { glyph: '≥', label: 'Greater than or equal to', latex: '\\ge' },
];

let recent: RecentSymbol[] = [...SEED];
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Current recently-used symbols, most-recent first. */
export function getRecent(): RecentSymbol[] {
  return recent;
}

/** Subscribe to changes (e.g. to rebuild the Recent panel). */
export function onRecentChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Record a symbol as just used: move it to the front, dedupe, cap the list. */
export function addRecent(item: RecentSymbol): void {
  const entry: RecentSymbol = {
    glyph: item.glyph,
    label: item.label,
    latex: item.latex,
  };
  recent = [entry, ...recent.filter((r) => r.latex !== entry.latex)].slice(0, MAX);
  notify();
  if (hasChromeStorage()) {
    void chrome.storage.local.set({ [STORAGE_KEY]: recent });
  }
}

/** Load persisted recents once. Notifies listeners if anything was restored. */
export async function loadRecent(): Promise<void> {
  if (loaded || !hasChromeStorage()) {
    loaded = true;
    return;
  }
  loaded = true;
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const value = stored[STORAGE_KEY] as RecentSymbol[] | undefined;
    if (Array.isArray(value) && value.length > 0) {
      recent = value
        .filter(
          (v): v is RecentSymbol =>
            !!v &&
            typeof v.glyph === 'string' &&
            typeof v.label === 'string' &&
            typeof v.latex === 'string',
        )
        .slice(0, MAX);
      notify();
    }
  } catch (error) {
    console.error('Failed to load recent symbols:', error);
  }
}
