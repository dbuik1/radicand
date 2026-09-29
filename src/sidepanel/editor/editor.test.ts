import { describe, it, expect, vi } from 'vitest';

// editor.ts imports MathLive; we only test the pure MathML helper here, so stub
// the heavy web-component dependency.
vi.mock('mathlive', () => ({ MathfieldElement: class {} }));

import { toMathMlDocument } from './index';
import { trailingStructure } from './templates';
import { removeFocusedScript } from './deletion';

describe('trailingStructure', () => {
  it('maps bare structure commands to placeholder templates', () => {
    expect(trailingStructure('\\int')).toBe('\\int_{#?}^{#?}');
    expect(trailingStructure('\\frac')).toBe('\\frac{#?}{#?}');
    expect(trailingStructure('\\sqrt')).toBe('\\sqrt{#?}');
    expect(trailingStructure('\\lim')).toBe('\\lim_{#?}');
    expect(trailingStructure('x+\\sum')).toBe('\\sum_{#?}^{#?}');
    // Styling commands are NOT structures: they follow the word-processor
    // model in styling.ts instead of boxing a placeholder.
    expect(trailingStructure('\\mathbb')).toBeNull();
  });

  it('matches the empty-brace and trailing-space forms', () => {
    expect(trailingStructure('\\sqrt{}')).toBe('\\sqrt{#?}');
    expect(trailingStructure('\\int ')).toBe('\\int_{#?}^{#?}');
  });

  it('does not match a command that already has an argument', () => {
    expect(trailingStructure('\\sqrt{x}')).toBeNull();
    expect(trailingStructure('\\int_1^2')).toBeNull();
  });

  it('does not confuse \\int with \\iint or \\oint', () => {
    expect(trailingStructure('\\iiint')).toBe('\\iiint_{#?}^{#?}');
    expect(trailingStructure('\\iint')).toBe('\\iint_{#?}^{#?}'); // still \iint, not \iiint
    expect(trailingStructure('\\oint')).toBe('\\oint_{#?}^{#?}');
  });
});

describe('removeFocusedScript', () => {
  const PH = '\\placeholder{}';

  it('removes the focused limit first (rank 0 = top limit for an integral)', () => {
    const full = `\\int_{${PH}}^{${PH}}`;
    // Just-created integral: the top limit (superscript) is focused → rank 0.
    const noSup = removeFocusedScript(full, 0);
    expect(noSup).toBe(`\\int_{${PH}}`);
    const bare = removeFocusedScript(noSup!, 0);
    expect(bare).toBe('\\int');
    expect(removeFocusedScript(bare!, 0)).toBeNull(); // bare operator: delete whole
  });

  it('removes the bottom limit first when it is focused (rank 1)', () => {
    // Tab to the lower limit → rank 1 → subscript removed first.
    expect(removeFocusedScript(`\\int_{${PH}}^{${PH}}`, 1)).toBe(`\\int^{${PH}}`);
  });

  it('handles single-script operators and script templates', () => {
    expect(removeFocusedScript(`\\lim_{${PH}}`, 0)).toBe('\\lim');
    expect(removeFocusedScript(`${PH}^{${PH}}`, 1)).toBe(PH);
    expect(removeFocusedScript(`${PH}_{${PH}}^{${PH}}`, 1)).toBe(`${PH}^{${PH}}`);
  });

  it('returns null for structures without scripts (deleted whole)', () => {
    expect(removeFocusedScript(`\\frac{${PH}}{${PH}}`, 0)).toBeNull();
    expect(removeFocusedScript(`\\sqrt{${PH}}`, 0)).toBeNull();
    expect(removeFocusedScript(`\\sqrt[${PH}]{${PH}}`, 0)).toBeNull();
    expect(removeFocusedScript('\\begin{pmatrix}' + PH + '\\end{pmatrix}', 0)).toBeNull();
  });
});

describe('toMathMlDocument', () => {
  it('wraps a rootless fragment in a <math> document with a namespace', () => {
    const out = toMathMlDocument('<mrow><mi>a</mi><mo>&#177;</mo><mi>b</mi></mrow>');
    expect(out).toMatch(/^<math\b/);
    expect(out).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
    expect(out).toContain('&#177;'); // the plus-minus survives
    expect(out).toMatch(/<\/math>$/);
  });

  it('leaves an existing <math> document untouched', () => {
    const doc = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
    expect(toMathMlDocument(doc)).toBe(doc);
  });

  it('returns empty string for empty input', () => {
    expect(toMathMlDocument('')).toBe('');
    expect(toMathMlDocument('   ')).toBe('');
  });
});
