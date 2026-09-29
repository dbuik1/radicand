/**
 * The stylesheet MathLive's static markup (`convertLatexToMarkup`) needs to
 * lay out: without it a fraction reads as "ba" and a superscript sits on
 * the baseline. Every rendered preview outside the field – the library and
 * shortcut lists, the save form, formula names – depends on it.
 *
 * The file's @font-face rules are dropped: their relative URLs would point
 * into the wrong folder of the packaged extension, and the equation field
 * already registers the same KaTeX faces from the bundled fonts folder.
 */
import staticCss from 'mathlive/static.css?raw';

let installed = false;

export function installStaticMathStyles(): void {
  if (installed) return;
  installed = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(staticCss.replace(/@font-face\s*\{[^}]*\}/g, ''));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}
