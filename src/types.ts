/**
 * Shared types for the extension.
 */

/** Output formats the user can copy or view in the source pane. */
export type OutputFormat = 'mathml' | 'latex';

/**
 * Theme options. `system` follows the OS light/dark preference; the explicit
 * values override it. `forced-colors` is always honoured on top.
 */
export type Theme = 'system' | 'light' | 'dark' | 'high-contrast';

/**
 * Where the editor opens: the docked side panel, a detached pop-out window
 * or a browser tab.
 */
export type Surface = 'panel' | 'window' | 'tab';

/** Speech rule set exposed to the user. */
export type SpeechRuleSet = 'clearspeak' | 'mathspeak';

/** Speech verbosity level. */
export type SpeechVerbosity = 'terse' | 'medium' | 'verbose';

/** Persisted user settings (chrome.storage.sync, falling back to local). */
/**
 * A piece of the interface that can be switched off in Settings. The equation
 * field is deliberately absent: it is the one thing the panel always shows.
 * The labels, hints and hiding behaviour live in
 * `src/sidepanel/interface-parts.ts`.
 */
export type InterfacePart =
  | 'equationHeading'
  | 'styleMenu'
  | 'moreMenu'
  | 'symbols'
  | 'symbolSearch'
  | 'symbolCategories'
  | 'symbolSources'
  | 'source'
  | 'copy'
  | 'speak'
  | 'saveToLibrary';

export interface Settings {
  /** Format shown in the source/preview box (and edited there). */
  displayFormat: OutputFormat;
  /** Format written to the clipboard by Copy. */
  copyFormat: OutputFormat;
  /** Colour theme; see {@link Theme}. */
  theme: Theme;
  /** UI font-size multiplier applied to the document root. */
  fontScale: number;
  /** Multiplier applied to the equation text only (not the rest of the UI). */
  equationScale: number;
  speechRuleSet: SpeechRuleSet;
  speechVerbosity: SpeechVerbosity;
  /**
   * Debounce (ms) before a typed `\`-command auto-accepts / auto-boxes its
   * placeholders. Higher gives more time to instead keep typing the argument
   * raw; 0 effectively disables the wait.
   */
  commandDelay: number;
  /** Whether typing `/` builds a fraction (MathLive default) or inserts a plain slash. */
  slashFraction: boolean;
  /**
   * Whether the first-use "Typing / built a fraction" hint has already been
   * shown. Set once, ever, so the hint does not repeat on every session.
   */
  slashHintShown: boolean;
  /**
   * Automatically SHRINK (never enlarge) the rendered equation so it fits
   * within the field's available width – e.g. a large matrix that would
   * otherwise overflow at the user's chosen equation scale. Does nothing when
   * the content already fits.
   */
  autoFit: boolean;
  /**
   * Strip redundant `\left`/`\right` from copied LaTeX (copy boundary
   * only; the editor and source view are untouched). Pairs whose content is
   * genuinely tall are always kept.
   */
  tidyBrackets: boolean;
  /**
   * Which pieces of the interface are on screen, keyed by
   * {@link InterfacePart}. Everything is shown until the user switches it
   * off, and each flag persists per user, so a panel pared back to the
   * equation field stays that way across sessions and windows.
   */
  parts: Record<InterfacePart, boolean>;
  /**
   * The surface the toolbar icon, and the keyboard shortcut that stands in
   * for it, open the editor in.
   */
  defaultSurface: Surface;
  /** Open state of the Equation source disclosure. Closed by default. */
  sourceOpen: boolean;
  /**
   * The symbol category last selected in the palette (by its visible name,
   * e.g. "Recent" or "Greek"), restored on the next session.
   */
  paletteCategory: string;
}
