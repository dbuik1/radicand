/**
 * The `\` finder's data: MathLive's command names, joined to the symbol
 * index's glyphs and colloquial names.
 *
 * src/assets/command-index.json is read out of the installed MathLive at
 * development time (scripts/generate-command-index.mjs) because MathLive
 * does not export its command table; the build refuses a copy generated
 * from a different MathLive version. It and the symbol index (loaded through
 * symbol-index.ts) are bundled and loaded lazily on the first `\`, so the
 * panel's first paint never pays for them, and no network is involved at
 * any point.
 */
import type { CommandCandidate } from './command-match';
import { displayName } from '../symbol-list';
import type { ListEntry } from '../symbol-list';
import { loadSymbolIndex } from '../symbol-index';

interface CommandIndex {
  version: number;
  commands: string[];
}

/**
 * The words a description matches on, lower-cased and in order: the
 * colloquial phrases first (`d`), then the formal aliases (`a`). Order
 * carries the ranking – a word from the first phrase is the symbol's own
 * name, a later one an alias.
 */
function terms(entry: ListEntry | undefined): string[] {
  if (entry === undefined) return [];
  const words = `${entry.d}; ${entry.a ?? ''}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
  return [...new Set(words)];
}

/** The command a LaTeX fragment starts with (`\sqrt{#?}` → `sqrt`). */
function leadingCommand(latex: string): string | null {
  return /^\\([a-zA-Z]+)/.exec(latex)?.[1] ?? null;
}

/**
 * Prefer the entry that inserts a usable structure: `\sqrt{#?}` puts the
 * caret in the radicand, where a bare `\sqrt` leaves a husk to fight with.
 */
function better(current: ListEntry | undefined, next: ListEntry): boolean {
  if (current === undefined) return true;
  return !current.c.includes('#?') && next.c.includes('#?');
}

let candidatesPromise: Promise<CommandCandidate[]> | null = null;

/**
 * Load and join the two indexes on first call; every later call returns the
 * same promise. Resolves to an empty list (the finder quietly stays shut) if
 * the command index fails to load or carries an unsupported version; without
 * the symbol index the candidates are bare command names.
 */
export function loadCommandCandidates(): Promise<CommandCandidate[]> {
  candidatesPromise ??= (async () => {
    try {
      const [commandModule, symbols] = await Promise.all([
        import('../../assets/command-index.json'),
        loadSymbolIndex(),
      ]);
      const commands = commandModule.default as unknown as CommandIndex;
      if (commands.version !== 1) {
        console.error(`Command index version ${commands.version} is not supported.`);
        return [];
      }

      const described = new Map<string, ListEntry>();
      for (const entry of symbols ?? []) {
        const name = leadingCommand(entry.c);
        if (name === null) continue;
        if (better(described.get(name), entry)) described.set(name, entry);
      }

      return commands.commands.map((name): CommandCandidate => {
        const entry = described.get(name);
        return {
          name,
          latex: entry?.c ?? `\\${name}`,
          label: entry === undefined ? `\\${name}` : displayName(entry),
          glyph: entry?.u ?? '',
          terms: terms(entry),
        };
      });
    } catch (error) {
      console.error('The command finder is unavailable:', error);
      return [];
    }
  })();
  return candidatesPromise;
}
