/**
 * Maths inside formula names: the text between a pair of `$` signs is
 * LaTeX, rendered wherever the name is shown and spoken wherever it is
 * read out ("Area of a circle $\pi r^2$"). Everything else is plain text;
 * `\$` is a literal dollar sign, and a `$` with no partner stays as typed.
 */
import { convertLatexToMarkup, convertLatexToSpeakableText } from 'mathlive';

export type NamePart = { text: string } | { latex: string };

export function splitName(name: string): NamePart[] {
  const parts: NamePart[] = [];
  let text = '';
  let index = 0;
  while (index < name.length) {
    const char = name[index];
    if (char === '\\' && name[index + 1] === '$') {
      text += '$';
      index += 2;
      continue;
    }
    if (char === '$') {
      const close = closingDollar(name, index + 1);
      const latex = close === -1 ? '' : name.slice(index + 1, close).trim();
      if (latex !== '') {
        if (text !== '') parts.push({ text });
        text = '';
        parts.push({ latex });
        index = close + 1;
        continue;
      }
    }
    text += char;
    index += 1;
  }
  if (text !== '') parts.push({ text });
  return parts;
}

/** The next unescaped `$` at or after `from`, or -1. */
function closingDollar(name: string, from: number): number {
  for (let index = from; index < name.length; index += 1) {
    if (name[index] === '\\') index += 1;
    else if (name[index] === '$') return index;
  }
  return -1;
}

export function hasNameMaths(name: string): boolean {
  // Most names have no dollar sign at all; the library filter asks per row.
  return name.includes('$') && splitName(name).some((part) => 'latex' in part);
}

const spokenCache = new Map<string, string>();

/** The name as words, for accessible names, announcements and search. */
export function spokenName(name: string): string {
  if (!hasNameMaths(name)) return name.replace(/\\\$/g, '$');
  let spoken = spokenCache.get(name);
  if (spoken === undefined) {
    spoken = splitName(name)
      .map((part) => ('text' in part ? part.text : speak(part.latex)))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    spokenCache.set(name, spoken);
  }
  return spoken;
}

function speak(latex: string): string {
  let words = '';
  try {
    words = convertLatexToSpeakableText(latex).trim();
  } catch {
    // Without the speech rules (outside the panel) fall back to the LaTeX
    // with its markup stripped, which reads better than the raw source.
  }
  if (words === '') words = latex.replace(/\\([a-zA-Z]+)/g, ' $1 ').replace(/[\\{}]/g, ' ');
  return ` ${words} `;
}

/**
 * Show the name in `target`: text as text, maths rendered. The rendered
 * maths is hidden from assistive technology and a visually hidden copy of
 * the spoken name stands in for the whole, so a screen reader hears words
 * rather than the glyph-by-glyph markup.
 */
export function renderName(target: HTMLElement, name: string): void {
  if (!name.includes('$')) {
    target.textContent = name;
    return;
  }
  const parts = splitName(name);
  if (!parts.some((part) => 'latex' in part)) {
    target.textContent = spokenName(name);
    return;
  }
  const shown = document.createElement('span');
  shown.setAttribute('aria-hidden', 'true');
  for (const part of parts) {
    if ('text' in part) {
      shown.append(part.text);
      continue;
    }
    const maths = document.createElement('span');
    maths.className = 'name-maths';
    try {
      maths.innerHTML = convertLatexToMarkup(part.latex);
    } catch {
      maths.textContent = part.latex;
    }
    shown.appendChild(maths);
  }
  const spoken = document.createElement('span');
  spoken.className = 'visually-hidden';
  spoken.textContent = spokenName(name);
  target.replaceChildren(shown, spoken);
}
