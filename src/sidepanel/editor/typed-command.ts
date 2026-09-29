import type { MathfieldElement } from 'mathlive';

/**
 * The letters typed after a `\`, up to the caret, or null when the field is
 * not editing a `\`-command.
 *
 * MathLive keeps the raw LaTeX run in its shadow DOM, one element per
 * character, with the character before the caret marked – `getValue('latex')`
 * reports the committed equation only, so the text being typed is not in it.
 * Anything unexpected (no run, no caret, a non-letter) reads as null.
 */
export function readTypedCommand(mf: MathfieldElement): string | null {
  if (mf.mode !== 'latex') return null;
  const spans = mf.shadowRoot?.querySelectorAll('.ML__raw-latex');
  if (spans === undefined || spans.length === 0) return null;
  let text = '';
  let caretSeen = false;
  for (const span of spans) {
    text += span.textContent ?? '';
    if (span.classList.contains('ML__latex-caret')) {
      caretSeen = true;
      break;
    }
  }
  if (!caretSeen) return null; // caret sits before the first character
  if (!text.startsWith('\\')) return null;
  const query = text.slice(1);
  return /^[a-zA-Z]*$/.test(query) ? query : null;
}
