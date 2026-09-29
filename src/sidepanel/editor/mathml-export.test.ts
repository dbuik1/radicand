import { describe, it, expect } from 'vitest';
import { convertLatexToMathMl } from 'mathlive';

/**
 * Screen-reader fidelity of styled letters in the MathML export.
 *
 * MathML is this product's default copy format, and speech engines
 * (ClearSpeak, MathSpeak, MathCAT) announce styled letters from either the
 * Unicode maths-alphanumeric codepoint or the mathvariant attribute. A style
 * that survives rendering but not export is invisible to a blind user.
 */
describe('styled-letter MathML export', () => {
  it('keeps the styles our affordances emit', () => {
    expect(convertLatexToMathMl('\\mathscr{L}')).toContain('\u2112'); // ℒ
    expect(convertLatexToMathMl('\\mathbb{R}')).toContain('\u211d'); // ℝ
    expect(convertLatexToMathMl('\\mathbf{v}')).toContain('mathvariant="bold"');
    expect(convertLatexToMathMl('\\mathfrak{g}')).not.toBe('<mi>g</mi>');
  });

  it('documents the \\mathcal gap that routes calligraphic output to \\mathscr', () => {
    // MathLive 0.110 exports \mathcal{L} as a bare <mi>L</mi> – the style is
    // lost entirely. This is why every calligraphic affordance in this
    // product emits \mathscr instead (templates.ts, the style toggles). If
    // this assertion ever fails, MathLive has fixed the export upstream:
    // revisit the routing and docs/upstream/mathlive-mathcal-mathml.md.
    expect(convertLatexToMathMl('\\mathcal{L}')).toBe('<mi>L</mi>');
  });
});
