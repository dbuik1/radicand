/**
 * Structure commands that should carry tab-navigable placeholders (`#?`), keyed
 * by their command name. When one of these is typed and committed as a bare
 * command (which is all MathLive produces – e.g. `\int`, `\frac`), we replace it
 * with the template so it matches the palette experience. Same templates
 * the palette uses, so the two paths agree.
 */
const STRUCTURE_TEMPLATES: Record<string, string> = {
  sqrt: '\\sqrt{#?}',
  frac: '\\frac{#?}{#?}',
  sum: '\\sum_{#?}^{#?}',
  prod: '\\prod_{#?}^{#?}',
  int: '\\int_{#?}^{#?}',
  iint: '\\iint_{#?}^{#?}',
  iiint: '\\iiint_{#?}^{#?}',
  oint: '\\oint_{#?}^{#?}',
  lim: '\\lim_{#?}',
  vec: '\\vec{#?}',
  hat: '\\hat{#?}',
  bar: '\\bar{#?}',
  overline: '\\overline{#?}',
};
// Styling commands (\mathbf, \mathbb, …) are deliberately NOT structures:
// they live in styling.ts's STYLE_COMMANDS and follow the word-processor
// model (toggle the selection, or arm a sticky style at the caret) instead
// of boxing an empty placeholder.

/**
 * If `latex` ends with a bare structure command (optionally with empty braces
 * and trailing space), return the placeholder template to insert in its
 * place. The leading `\` anchor keeps `\int` from matching inside `\iint`.
 */
export function trailingStructure(latex: string): string | null {
  for (const command of Object.keys(STRUCTURE_TEMPLATES)) {
    const re = new RegExp(`\\\\${command}(?:\\{\\})?\\s*$`);
    if (re.test(latex)) return STRUCTURE_TEMPLATES[command]!;
  }
  return null;
}

/**
 * If `latex` is *exactly* a bare structure command (optionally with empty
 * braces), return its placeholder template. Used for commands committed in a
 * nested context (e.g. a matrix cell), where the field-level LaTeX ends with
 * the environment's `\end{…}` and {@link trailingStructure} cannot see them –
 * there the atom to the caret's left is inspected instead.
 */
export function bareStructureTemplate(latex: string): string | null {
  for (const command of Object.keys(STRUCTURE_TEMPLATES)) {
    if (new RegExp(`^\\\\${command}(?:\\{\\})?$`).test(latex)) {
      return STRUCTURE_TEMPLATES[command]!;
    }
  }
  return null;
}
