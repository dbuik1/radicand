/**
 * The one `\`-trigger namespace the field sees, composed from the two
 * stores that own triggers: Custom shortcuts and My library. A shortcut is
 * asked first – it exists for nothing else – then a library entry with the
 * same trigger. The authoring forms validate against the whole namespace
 * (triggerProblem), so a clash can only arrive by import, and then the
 * shortcut wins predictably.
 */
import { validateLatex } from 'mathlive';
import type { EditorTriggers, TriggerEntry } from './editor';
import {
  findLibraryTrigger,
  getLibraryEntries,
  isLibraryTriggerPrefix,
  onLibraryChange,
  recordLibraryUse,
} from './library';
import type { LibraryEntry } from './library';
import { spokenName } from './name-maths';
import {
  findShortcut,
  getShortcuts,
  isShortcutPrefix,
  onShortcutsChange,
  recordShortcutUse,
  shortcutLabel,
  TRIGGER_PATTERN,
} from './shortcuts';
import type { Shortcut } from './shortcuts';

function fromShortcut(shortcut: Shortcut): TriggerEntry {
  return {
    id: shortcut.id,
    trigger: shortcut.trigger,
    name: shortcutLabel(shortcut),
    body: shortcut.latex,
    ...(shortcut.keywords !== undefined ? { keywords: shortcut.keywords } : {}),
  };
}

function fromLibrary(entry: LibraryEntry & { trigger: string }): TriggerEntry {
  return {
    id: entry.id,
    trigger: entry.trigger,
    name: spokenName(entry.name),
    body: entry.body,
    ...(entry.keywords !== undefined ? { keywords: entry.keywords } : {}),
  };
}

function lookup(name: string): TriggerEntry | null {
  const shortcut = findShortcut(name);
  if (shortcut) return fromShortcut(shortcut);
  const entry = findLibraryTrigger(name);
  return entry?.trigger !== undefined ? fromLibrary({ ...entry, trigger: entry.trigger }) : null;
}

// The finder reads the whole list on every keystroke, so it is built once
// per change to either store rather than once per query.
let listed: TriggerEntry[] | null = null;
const invalidate = (): void => {
  listed = null;
};
onShortcutsChange(invalidate);
onLibraryChange(invalidate);

function list(): readonly TriggerEntry[] {
  if (listed === null) {
    listed = [
      ...getShortcuts().map(fromShortcut),
      ...getLibraryEntries().flatMap((entry) =>
        entry.trigger !== undefined ? [fromLibrary({ ...entry, trigger: entry.trigger })] : [],
      ),
    ];
  }
  return listed;
}

/** The composed trigger store the editor is created with. */
export const editorTriggers: EditorTriggers = {
  isPrefix: (prefix) => isShortcutPrefix(prefix) || isLibraryTriggerPrefix(prefix),
  lookup,
  list,
  // Ids are UUIDs, so the store that knows the id is the one that owns it.
  recordUse(id) {
    if (getShortcuts().some((shortcut) => shortcut.id === id)) recordShortcutUse(id);
    else recordLibraryUse(id);
  },
};

/**
 * Why a trigger string is unacceptable, or null when it is fine. A strict
 * prefix of a real command is deliberately allowed – triggers never
 * auto-accept, so a prefix cannot interfere with typing the command.
 * `excludeId` is the entry being edited, so its own trigger does not
 * self-collide.
 */
export function triggerProblem(trigger: string, excludeId?: string): string | null {
  if (trigger === '') return null;
  if (!/^[a-zA-Z]+$/.test(trigger)) return 'A trigger can only contain letters.';
  if (!TRIGGER_PATTERN.test(trigger)) return 'A trigger needs at least two letters.';
  if (validateLatex(`\\${trigger}`).length === 0) {
    return `\\${trigger} is already a LaTeX command.`;
  }
  if (getShortcuts().some((s) => s.trigger === trigger && s.id !== excludeId)) {
    return `A custom shortcut already uses \\${trigger}.`;
  }
  if (getLibraryEntries().some((e) => e.trigger === trigger && e.id !== excludeId)) {
    return `A library formula already uses \\${trigger}.`;
  }
  return null;
}
