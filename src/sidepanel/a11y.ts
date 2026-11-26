/**
 * Accessibility helpers: a centralised live-region announcer. Every
 * non-focus-stealing status message in the extension goes through here
 * (WCAG 2.2 SC 4.1.3).
 *
 * The live regions themselves live in index.html so they are present in the
 * accessibility tree before any script runs.
 */

type Politeness = 'polite' | 'assertive';

const REGION_IDS: Record<Politeness, string> = {
  polite: 'sr-status',
  assertive: 'sr-alert',
};

/**
 * Announce a message to assistive technology without moving focus.
 *
 * `polite` (default) is for routine status – "Copied as MathML", a setting
 * change. `assertive` is reserved for errors that should interrupt.
 *
 * We briefly clear the region first so that announcing the *same* string
 * twice in a row is still spoken (some screen readers suppress identical
 * consecutive values).
 */
export function announce(message: string, politeness: Politeness = 'polite'): void {
  const region = document.getElementById(REGION_IDS[politeness]);
  if (!region) return;

  region.textContent = '';
  // Defer to the next frame so the cleared value is committed first.
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

/** What happened: a step that completed, or one that failed. */
export type ResultKind = 'done' | 'error';

let showResult: ((message: string, kind: ResultKind) => void) | null = null;

/**
 * Register the on-screen place where results appear (the caption under the
 * actions bar). Absent where that bar is not mounted.
 */
export function setResultDisplay(show: (message: string, kind: ResultKind) => void): void {
  showResult = show;
}

/**
 * Report the result of a committing step – a save, an import, a copy – to
 * everyone: spoken through the live region and shown on screen. A result
 * that only a screen reader hears leaves a sighted user unsure it happened.
 */
export function report(message: string, kind: ResultKind = 'done'): void {
  announce(message, kind === 'error' ? 'assertive' : 'polite');
  showResult?.(message, kind);
}
