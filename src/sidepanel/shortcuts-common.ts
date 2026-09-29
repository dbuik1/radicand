/**
 * The opt-in common set of shortcuts: the abbreviations people who type
 * mathematics reach for first, in the spirit of the snippet sets that
 * editor plug-ins ship (short Greek letters, `sr` for a square, `ff` for a
 * fraction, doubled letters for the number sets), each written by us as
 * LaTeX from the notation itself. Seeded shortcuts are ordinary shortcuts
 * flagged `seeded: true` (editing one clears the flag – it is the user's
 * from then on). No trigger here is a LaTeX command, so none can shadow
 * one, and each is checked for that by the unit tests against the bundled
 * MathLive. `group` is only for presenting the set before it is added.
 */
import type { NewShortcut } from './shortcuts';

interface CommonShortcut extends NewShortcut {
  group: string;
}

const P = '\\placeholder{}';

export const COMMON_SHORTCUTS: readonly CommonShortcut[] = [
  // Number sets
  { group: 'Number sets', trigger: 'RR', latex: '\\mathbb{R}', name: 'Real numbers', keywords: 'reals' },
  { group: 'Number sets', trigger: 'NN', latex: '\\mathbb{N}', name: 'Natural numbers', keywords: 'naturals' },
  { group: 'Number sets', trigger: 'ZZ', latex: '\\mathbb{Z}', name: 'Integers' },
  { group: 'Number sets', trigger: 'QQ', latex: '\\mathbb{Q}', name: 'Rational numbers', keywords: 'rationals' },
  { group: 'Number sets', trigger: 'CC', latex: '\\mathbb{C}', name: 'Complex numbers' },
  // Greek letters
  { group: 'Greek letters', trigger: 'al', latex: '\\alpha', name: 'Alpha' },
  { group: 'Greek letters', trigger: 'be', latex: '\\beta', name: 'Beta' },
  { group: 'Greek letters', trigger: 'ga', latex: '\\gamma', name: 'Gamma' },
  { group: 'Greek letters', trigger: 'de', latex: '\\delta', name: 'Delta' },
  { group: 'Greek letters', trigger: 'eps', latex: '\\varepsilon', name: 'Epsilon' },
  { group: 'Greek letters', trigger: 'la', latex: '\\lambda', name: 'Lambda' },
  { group: 'Greek letters', trigger: 'si', latex: '\\sigma', name: 'Sigma' },
  { group: 'Greek letters', trigger: 'om', latex: '\\omega', name: 'Omega' },
  { group: 'Greek letters', trigger: 'ph', latex: '\\varphi', name: 'Phi' },
  { group: 'Greek letters', trigger: 'De', latex: '\\Delta', name: 'Capital delta' },
  { group: 'Greek letters', trigger: 'Si', latex: '\\Sigma', name: 'Capital sigma' },
  { group: 'Greek letters', trigger: 'Om', latex: '\\Omega', name: 'Capital omega' },
  // Powers and roots
  { group: 'Powers and roots', trigger: 'sr', latex: '^{2}', name: 'Squared', keywords: 'square power' },
  { group: 'Powers and roots', trigger: 'cb', latex: '^{3}', name: 'Cubed', keywords: 'cube power' },
  { group: 'Powers and roots', trigger: 'inv', latex: '^{-1}', name: 'Inverse' },
  { group: 'Powers and roots', trigger: 'sq', latex: `\\sqrt{${P}}`, name: 'Square root' },
  { group: 'Powers and roots', trigger: 'ee', latex: `e^{${P}}`, name: 'Exponential', keywords: 'e to the' },
  // Fractions and calculus
  { group: 'Fractions and calculus', trigger: 'ff', latex: `\\frac{${P}}{${P}}`, name: 'Fraction' },
  { group: 'Fractions and calculus', trigger: 'dx', latex: '\\,\\mathrm{d}x', name: 'Differential dx' },
  { group: 'Fractions and calculus', trigger: 'dt', latex: '\\,\\mathrm{d}t', name: 'Differential dt' },
  { group: 'Fractions and calculus', trigger: 'dv', latex: `\\frac{\\mathrm{d}${P}}{\\mathrm{d}${P}}`, name: 'Derivative', keywords: 'd by d' },
  { group: 'Fractions and calculus', trigger: 'pd', latex: `\\frac{\\partial ${P}}{\\partial ${P}}`, name: 'Partial derivative' },
  { group: 'Fractions and calculus', trigger: 'dint', latex: `\\int_{${P}}^{${P}} ${P}\\,\\mathrm{d}x`, name: 'Definite integral', keywords: 'bounds' },
  { group: 'Fractions and calculus', trigger: 'limn', latex: '\\lim_{n\\to\\infty}', name: 'Limit as n tends to infinity' },
  { group: 'Fractions and calculus', trigger: 'sumn', latex: '\\sum_{n=1}^{\\infty}', name: 'Sum from n equals 1 to infinity', keywords: 'series' },
  // Logic and sets
  { group: 'Logic and sets', trigger: 'AA', latex: '\\forall', name: 'For all' },
  { group: 'Logic and sets', trigger: 'EE', latex: '\\exists', name: 'There exists' },
  { group: 'Logic and sets', trigger: 'inn', latex: '\\in', name: 'Element of', keywords: 'in member' },
  { group: 'Logic and sets', trigger: 'cc', latex: '\\subseteq', name: 'Subset of' },
  { group: 'Logic and sets', trigger: 'ooo', latex: '\\infty', name: 'Infinity' },
  { group: 'Logic and sets', trigger: 'xx', latex: '\\times', name: 'Times', keywords: 'cross multiply' },
  { group: 'Logic and sets', trigger: 'st', latex: '\\text{ such that }', name: 'Such that' },
  // Brackets and layout
  { group: 'Brackets and layout', trigger: 'abs', latex: `\\left|${P}\\right|`, name: 'Absolute value', keywords: 'modulus' },
  { group: 'Brackets and layout', trigger: 'norm', latex: `\\left\\|${P}\\right\\|`, name: 'Norm' },
  { group: 'Brackets and layout', trigger: 'floor', latex: `\\left\\lfloor ${P}\\right\\rfloor`, name: 'Floor' },
  { group: 'Brackets and layout', trigger: 'ceil', latex: `\\left\\lceil ${P}\\right\\rceil`, name: 'Ceiling' },
  { group: 'Brackets and layout', trigger: 'tt', latex: `\\text{${P}}`, name: 'Text', keywords: 'words upright' },
  { group: 'Brackets and layout', trigger: 'mbf', latex: `\\mathbf{${P}}`, name: 'Bold', keywords: 'vector matrix' },
  { group: 'Brackets and layout', trigger: 'pmat', latex: `\\begin{pmatrix}${P} & ${P} \\\\ ${P} & ${P}\\end{pmatrix}`, name: 'Two by two matrix', keywords: 'pmatrix' },
  { group: 'Brackets and layout', trigger: 'cases', latex: `\\begin{cases}${P} & ${P} \\\\ ${P} & ${P}\\end{cases}`, name: 'Cases', keywords: 'piecewise' },
];
