/**
 * The pure half of the My library filter: which categories exist and which
 * entry belongs to which. A category is free text, so two spellings that
 * differ only in case or surrounding space are one category, shown under
 * the first spelling met.
 */
import type { LibraryEntry } from './library';

export interface CategoryOption {
  /** Case-folded, trimmed identity used for matching. */
  key: string;
  /** The spelling shown to the user. */
  label: string;
}

/** The identity of an entry's category, or null when it has none. */
export function categoryKey(entry: Pick<LibraryEntry, 'category'>): string | null {
  const key = entry.category?.trim().toLowerCase() ?? '';
  return key === '' ? null : key;
}

/** Every distinct category in the entries, alphabetically. */
export function categoriesOf(entries: readonly Pick<LibraryEntry, 'category'>[]): CategoryOption[] {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const key = categoryKey(entry);
    if (key !== null && !seen.has(key)) seen.set(key, entry.category!.trim());
  }
  return [...seen]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en'));
}
