/**
 * The opt-in starter pack: a small set of formulae a user would plausibly
 * have typed twice, each written BY US as LaTeX from the mathematics
 * itself (short mathematical expressions attract no meaningful copyright,
 * and writing them ourselves removes the question entirely – provenance
 * is noted in docs/symbol-index-licences.md).
 *
 * Seeded entries are ordinary entries flagged
 * `seeded: true` (editing one clears the flag – it is the user's from
 * then on); none ships a trigger, since triggers are a namespace the
 * user owns; and having weighed placeholders per entry, these are all
 * reference identities whose literals carry the meaning – blanks are one
 * "Blank out selection" away for anyone turning one into a template.
 */
import type { NewLibraryEntry } from './library';

export const STARTER_PACK: readonly NewLibraryEntry[] = [
  {
    name: 'Quadratic formula',
    body: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}',
    keywords: 'roots; solve quadratic',
  },
  {
    name: 'Standard deviation (sample)',
    body: 's=\\sqrt{\\frac{1}{n-1}\\sum_{i=1}^{n}\\left(x_i-\\bar{x}\\right)^2}',
    keywords: 'spread; statistics',
  },
  {
    name: 'Standard deviation (population)',
    body: '\\sigma=\\sqrt{\\frac{1}{N}\\sum_{i=1}^{N}\\left(x_i-\\mu\\right)^2}',
    keywords: 'spread; statistics',
  },
  {
    name: 'Variance (population)',
    body: '\\sigma^2=\\frac{1}{N}\\sum_{i=1}^{N}\\left(x_i-\\mu\\right)^2',
    keywords: 'spread; statistics',
  },
  {
    name: 'Normal distribution density',
    body: 'f(x)=\\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-\\frac{\\left(x-\\mu\\right)^2}{2\\sigma^2}}',
    keywords: 'gaussian; bell curve',
  },
  {
    name: 'Binomial coefficient',
    body: '\\binom{n}{k}=\\frac{n!}{k!\\left(n-k\\right)!}',
    keywords: 'choose; combinations',
  },
  {
    name: 'Binomial probability',
    body: 'P(X=k)=\\binom{n}{k}p^k\\left(1-p\\right)^{n-k}',
    keywords: 'bernoulli trials',
  },
  {
    name: 'Compound interest',
    body: 'A=P\\left(1+\\frac{r}{n}\\right)^{nt}',
    keywords: 'finance; growth',
  },
  {
    name: 'Pythagoras',
    body: 'a^2+b^2=c^2',
    keywords: 'right triangle; hypotenuse',
  },
  {
    name: 'Distance between two points',
    body: 'd=\\sqrt{\\left(x_2-x_1\\right)^2+\\left(y_2-y_1\\right)^2}',
    keywords: 'coordinate geometry',
  },
  {
    name: 'Gradient of a line',
    body: 'm=\\frac{y_2-y_1}{x_2-x_1}',
    keywords: 'slope; rise over run',
  },
  {
    name: "Gauss's law (electric)",
    body: '\\nabla\\cdot\\mathbf{E}=\\frac{\\rho}{\\varepsilon_0}',
    keywords: 'maxwell equations; divergence',
  },
  {
    name: "Gauss's law (magnetic)",
    body: '\\nabla\\cdot\\mathbf{B}=0',
    keywords: 'maxwell equations; no monopoles',
  },
  {
    name: "Faraday's law",
    body: '\\nabla\\times\\mathbf{E}=-\\frac{\\partial\\mathbf{B}}{\\partial t}',
    keywords: 'maxwell equations; induction',
  },
  {
    name: 'Ampère–Maxwell law',
    body: '\\nabla\\times\\mathbf{B}=\\mu_0\\mathbf{J}+\\mu_0\\varepsilon_0\\frac{\\partial\\mathbf{E}}{\\partial t}',
    keywords: 'maxwell equations; circulation',
  },
  {
    name: 'Einstein temperature',
    body: '\\theta_E=\\frac{\\hbar\\omega}{k_B}',
    keywords: 'solid state; phonons',
  },
  {
    name: 'Schrödinger equation (time-dependent)',
    body: 'i\\hbar\\frac{\\partial}{\\partial t}\\Psi=\\hat{H}\\Psi',
    keywords: 'quantum mechanics; wavefunction',
  },
  {
    name: "Euler's identity",
    body: 'e^{i\\pi}+1=0',
    keywords: 'complex numbers',
  },
  {
    name: 'Derivative (limit definition)',
    body: "f'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}",
    keywords: 'first principles; calculus',
  },
  {
    name: 'Integration by parts',
    body: '\\int u\\,\\mathrm{d}v=uv-\\int v\\,\\mathrm{d}u',
    keywords: 'calculus; antiderivative',
  },
];
