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
