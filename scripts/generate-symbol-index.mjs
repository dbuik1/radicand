/**
 * Generate the searchable symbol index (src/assets/symbol-index.json).
 *
 * Run manually with `npm run symbols:generate` after a MathLive upgrade or a
 * dataset refresh – NEVER as part of the build: it downloads its two source
 * datasets (from pinned commits, hash-checked – see SOURCES), and
 * `npm run build` must work offline. The generated JSON is committed;
 * attribution lives in docs/symbol-index-licences.md.
 *
 * Sources:
 * - unimathsymbols.txt (Günter Milde, LPPL 1.3+): LaTeX commands with
 *   genuinely colloquial descriptions ("open face R", "for all"). LPPL
 *   requires derived files to carry a different name – this script's output
 *   (symbol-index.json) satisfies that – and attribution, which the notices
 *   file provides.
 * - W3C unicode.xml (David Carlisle, W3C Software Notice): canonical
 *   descriptions, MathML/HTML entity names (ForAll, ContourIntegral) and
 *   publisher glosses, keyed by codepoint – excellent extra search terms.
 *
 * Every candidate is gated through the installed MathLive's own renderer:
 * only commands this exact MathLive version can render survive, so the
 * index is self-updating when the dependency is bumped.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertLatexToMarkup } from 'mathlive';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CACHE = path.join(HERE, '.cache');
const OUT = path.join(ROOT, 'src', 'assets', 'symbol-index.json');

/**
 * Each dataset is fetched from a pinned upstream commit and checked against
 * the SHA-256 of the exact bytes the committed index was built from, so a
 * regeneration reproduces the same input and an altered upstream file is
 * refused. To take a newer dataset: update the commit, run once, paste the
 * hash the failure reports, and review the resulting index diff.
 */
const SOURCES = {
  'unimathsymbols.txt': {
    repo: 'kawabata/math-symbols',
    commit: '091b81cb40ceaff97614999ffe85b572ace182f0',
    path: 'unimathsymbols.txt',
    sha256: 'db3999f6ae20dd5a99da87530997cc158346fddd88f1f3981ecdd7a307142e28',
  },
  'unicode.xml': {
    repo: 'w3c/xml-entities',
    commit: 'ea3b5d3bce7e79601ced3ec124df8bbbd1ac3298',
    path: 'unicode.xml',
    sha256: '5c89bbbc46e5bcff12e16f9c2b4d8bdd2eab83cad6a4c7821866e878eac6f3ff',
  },
};

const sourceUrl = ({ repo, commit, path: file }) =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${file}`;

/** Download (or reuse a cached copy of) a source dataset, verifying its hash. */
async function fetchSource(name) {
  const source = SOURCES[name];
  mkdirSync(CACHE, { recursive: true });
  // The cache is keyed by commit so a copy fetched before a pin change is
  // never reused for the new pin.
  const file = path.join(CACHE, `${source.commit.slice(0, 12)}-${name}`);
  const digest = (body) => createHash('sha256').update(body).digest('hex');
  if (existsSync(file) && digest(readFileSync(file)) !== source.sha256) {
    console.warn(`cached ${name} does not match its pinned hash – re-downloading`);
    rmSync(file);
  }
  if (!existsSync(file)) {
    const url = sourceUrl(source);
    console.log(`downloading ${url}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    const actual = digest(body);
    if (actual !== source.sha256) {
      throw new Error(
        `${name}: SHA-256 ${actual} does not match the pinned ${source.sha256} – ` +
          'refusing to use it. If the pin was moved on purpose, update the hash in SOURCES.',
      );
    }
    writeFileSync(file, body);
  }
  return readFileSync(file, 'utf8');
}

/** True when this MathLive build renders `latex` without an error atom. */
function renders(latex) {
  try {
    return !/ML__error/.test(convertLatexToMarkup(latex));
  } catch {
    return false;
  }
}

/**
 * Phrases that are dataset bookkeeping, not names anyone searches by:
 * package-specific rendering caveats ("fourier prints a dollar sign") and
 * XML-entity-set housekeeping ("legacy uppercase name").
 */
const JUNK_PHRASE = /\b(prints|legacy|obsolete)\b/;

/**
 * Turn a unimathsymbols comments field into search phrases: drop alternative
 * `\commands` and their package parentheticals, keep the human phrases.
 * `= \mathds{R} (dsfont), open face R` → `['open face r']`.
 */
function proseFromComments(comments) {
  return (
    comments
      // Parentheticals (package names) go before the comma split – a comma
      // inside one ("(yhmath, fourier)") would otherwise tear it in half
      // and leave "(yhmath" as a phrase.
      .replace(/\([^)]*\)/g, '')
      .split(',')
      .map((part) =>
        part
          .replace(/[=#x*t]\s+(?=\\)/g, '')
          .replace(/\\[a-zA-Z@]+(\{[^}]*\})*/g, '')
          .replace(/[{}^_]/g, ' ')
          .trim(),
      )
      // The same ISO-notation strip the unicode.xml aliases get: the prose
      // field carries slash-forms ("/scr e") and class markers too. The
      // dataset itself carries a typo on most \mathbb letters –
      // "matMATHEMATICAL DOUBLE-STRUCK …" (a stray "mat" prefix) – which
      // would otherwise become the display name "Matmathematical …".
      .map((part) => part.replace(/\bmat(?=mathematical\b)/gi, ''))
      .map((part) => cleanAliasPhrase(part.toLowerCase()))
      .filter((part) => /[a-zA-Z]{2}/.test(part))
      .filter((part) => !JUNK_PHRASE.test(part))
  );
}

/**
 * Alias commands from a comments field: unimathsymbols marks true aliases
 * with `=` (`= \HBar (wrisym)` for U+210F). `#` marks a SIMILAR but
 * DIFFERENT character with the same-looking glyph, and `x` a false friend –
 * neither may inherit this line's glyph or description, so only `=` is
 * taken. Only bare commands – anything needing an argument is not a symbol
 * alias.
 */
function alternateCommands(comments) {
  return [...comments.matchAll(/=\s*(\\[a-zA-Z]+)(?![a-zA-Z{])/g)].map((m) => m[1]);
}

/** Canonical form of a phrase, for de-duplicating search terms. */
function normalise(phrase) {
  return phrase.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Strip ISO entity-set notation from a description phrase: slash-form
 * commands (`/forall`), math-class markers (`b:`), `alias isotech forall`
 * cross-references and bare `=`/`#`/`*` separators are noise, not search
 * terms. Expects lower-case input.
 */
function cleanAliasPhrase(phrase) {
  return phrase
    .replace(/\/[a-zA-Z@]+/g, '')
    .replace(/\balias\s+\w+\s+\w+/g, '')
    .replace(/\b[a-z]:/g, '')
    .replace(/[=#*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;.:-]+|[\s,;.:-]+$/g, '')
    .trim();
}

/** Split a CamelCase entity name into words: ContourIntegral → contour integral. */
function words(name) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

/**
 * Alias terms per codepoint from unicode.xml: entity ids, the Wolfram name
 * and every description/desc string. Regex-parsed per <character> block –
 * the file is huge but flat and machine-generated, so this is reliable.
 */
function parseUnicodeXml(xml) {
  const aliases = new Map();
  const blocks = xml.split('<character ');
  for (const block of blocks) {
    const id = block.match(/^id="U([0-9A-F]{4,6})"/);
    if (!id) continue;
    const cp = parseInt(id[1], 16);
    const terms = new Set();
    for (const m of block.matchAll(/<entity id="([A-Za-z][A-Za-z0-9.]*)"/g)) {
      terms.add(words(m[1]));
    }
    for (const m of block.matchAll(/<Wolfram>([A-Za-z]+)<\/Wolfram>/g)) {
      terms.add(words(m[1]));
    }
    for (const m of block.matchAll(/<desc(?:ription[^>]*)?>([^<]+)</g)) {
      // Split on the same separator the index uses in its own fields, so
      // each phrase de-duplicates independently.
      for (const piece of m[1].toLowerCase().split(';')) {
        const cleaned = cleanAliasPhrase(piece);
        if (/[a-z]{2}/.test(cleaned) && !JUNK_PHRASE.test(cleaned)) terms.add(cleaned);
      }
    }
    if (terms.size > 0) aliases.set(cp, [...terms].filter(Boolean));
  }
  return aliases;
}

/**
 * Synonym families by command pattern – the informal names people actually
 * search with, applied at generation time so the runtime stays a plain
 * index lookup.
 */
const SYNONYMS = [
  [/^\\mathbb\{/, 'blackboard bold; double-struck; open face'],
  [/^\\math(?:cal|scr)\{/, 'script; calligraphic; curly'],
  [/^\\mathfrak\{/, 'fraktur; gothic; german letter'],
  [/^\\(?:varnothing|emptyset)$/, 'empty set; null set'],
  [/^\\in$/, 'element of; belongs to; member of'],
  [/^\\(?:implies|Rightarrow)$/, 'implies; if then'],
  [/^\\(?:iff|Leftrightarrow)$/, 'iff; if and only if; equivalent'],
  [/^\\times$/, 'times; multiplication; cross product'],
  [/^\\otimes$/, 'tensor product; circled times'],
  [/^\\cdot$/, 'dot; times; multiplication'],
  [/^\\partial$/, 'partial derivative; del; curly d'],
  [/^\\infty$/, 'infinity; unbounded'],
];

/**
 * Structural entries a symbol table cannot hold: templates with tab-stop
 * placeholders (`#?`), the same shape the palette inserts, each with a
 * hand-picked display glyph in the palette's visual language. Seeded from
 * KaTeX's supported-functions catalogue (MIT).
 */
const STRUCTURAL = [
  ['\\frac{#?}{#?}', '½', 'fraction; divide; over'],
  ['\\tfrac{#?}{#?}', '½', 'small inline fraction'],
  ['\\binom{#?}{#?}', '(ⁿₖ)', 'binomial coefficient; choose; combinations'],
  ['\\sqrt{#?}', '√', 'square root; radical'],
  ['\\sqrt[#?]{#?}', 'ⁿ√', 'nth root; cube root; radical with index'],
  ['#?^{#?}', 'xⁿ', 'superscript; power; exponent; raised'],
  ['#?_{#?}', 'xₙ', 'subscript; index; lowered'],
  ['#?_{#?}^{#?}', 'xⁿₘ', 'subscript and superscript'],
  ['\\sum_{#?}^{#?}', '∑', 'sum; summation; sigma notation'],
  ['\\prod_{#?}^{#?}', '∏', 'product; pi notation'],
  ['\\int_{#?}^{#?}', '∫', 'integral; antiderivative'],
  ['\\iint_{#?}^{#?}', '∬', 'double integral'],
  ['\\iiint_{#?}^{#?}', '∭', 'triple integral'],
  ['\\oint_{#?}^{#?}', '∮', 'contour integral; closed line integral'],
  ['\\lim_{#?}', 'lim', 'limit'],
  ['\\log_{#?}', 'log', 'logarithm with base'],
  ['\\vec{#?}', 'x⃗', 'vector arrow accent'],
  ['\\hat{#?}', 'x̂', 'hat accent; circumflex; unit vector'],
  ['\\bar{#?}', 'x̄', 'bar accent; mean; average; conjugate'],
  ['\\dot{#?}', 'ẋ', 'dot accent; time derivative'],
  ['\\ddot{#?}', 'ẍ', 'double dot accent; second derivative'],
  ['\\tilde{#?}', 'x̃', 'tilde accent'],
  ['\\overline{#?}', 'x̅', 'overline; bar over; complement'],
  ['\\underline{#?}', 'x̲', 'underline'],
  ['\\widehat{#?}', 'x̂', 'wide hat accent'],
  ['\\overbrace{#?}^{#?}', '⏞', 'overbrace with label'],
  ['\\underbrace{#?}_{#?}', '⏟', 'underbrace with label'],
  ['\\overrightarrow{#?}', 'x⃗', 'arrow over; vector'],
  ['\\boxed{#?}', '▢', 'boxed; framed answer'],
  ['\\left(#?\\right)', '()', 'parentheses; round brackets; grouping'],
  ['\\left[#?\\right]', '[]', 'square brackets'],
  ['\\left\\{#?\\right\\}', '{}', 'curly braces; set brackets'],
  ['\\left|#?\\right|', '|x|', 'absolute value; modulus; magnitude'],
  ['\\left\\lVert#?\\right\\rVert', '‖x‖', 'norm; double bars'],
  ['\\left\\langle#?\\right\\rangle', '⟨⟩', 'angle brackets; inner product'],
  ['\\left\\lfloor#?\\right\\rfloor', '⌊⌋', 'floor function'],
  ['\\left\\lceil#?\\right\\rceil', '⌈⌉', 'ceiling function'],
  ['\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', '(∷)', 'matrix with parentheses; 2 by 2'],
  ['\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}', '[∷]', 'matrix with square brackets'],
  ['\\begin{vmatrix}#?&#?\\\\#?&#?\\end{vmatrix}', '|∷|', 'determinant; matrix with bars'],
  ['\\begin{pmatrix}#?\\\\#?\\end{pmatrix}', '(⋮)', 'column vector'],
  ['\\begin{cases}#?&#?\\\\#?&#?\\end{cases}', '{⋮', 'cases; piecewise function'],
  ['\\operatorname{#?}', 'fn', 'named operator; upright function name'],
  ['\\text{#?}', 'abc', 'text inside maths; words'],
  ['\\xrightarrow{#?}', '→', 'labelled arrow; maps to with label'],
  ['\\pmod{#?}', 'mod', 'modulo; mod'],
  ['\\displaystyle#?', '∑↕', 'display style; full-size'],
];

const uni = await fetchSource('unimathsymbols.txt');
const xml = await fetchSource('unicode.xml');
const xmlAliases = parseUnicodeXml(xml);

const entries = [];
const seenCommands = new Set();

/**
 * Styled-alphabet letters (bold, italic, sans-serif, monospace and their
 * combinations) are the Style menu's job, and one entry per letter would
 * bury real symbols in every search. Blackboard, calligraphic/script and
 * fraktur letters stay: those are searched as symbols in their own right
 * ("reals", "power set", "fraktur R").
 */
const STYLED_LETTER = /^\\math(?=[a-z]*(?:bf|it|sf|tt))[a-z]+\{/;

for (const line of uni.split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const fields = line.split('^');
  if (fields.length < 8) continue;
  const [cpHex, char, latexField, unicodeMathField, , , , comments] = fields;
  // Prefer the LaTeX command; fall back to the unicode-math name (MathLive
  // supports many of them). Skip anything the user can simply type – plain
  // ASCII letters, digits and punctuation (escaped or not) would bury real
  // results, and `~` is an invisible non-breaking space. Calligraphic
  // letters insert as \mathscr, not \mathcal: MathLive 0.110 loses
  // \mathcal's style in the MathML export while \mathscr survives (see
  // src/sidepanel/editor/styling.ts).
  const command = (latexField.trim() || unicodeMathField.trim()).replace(
    /^\\mathcal\{/,
    '\\mathscr{',
  );
  if (!command || /^\\?[\x20-\x7E]$/.test(command)) continue;
  if (STYLED_LETTER.test(command)) continue;
  const cp = parseInt(cpHex, 16);
  const prose = proseFromComments(comments ?? '');
  const aliasPhrases = xmlAliases.get(cp) ?? [];
  // The primary command plus any `= \cmd` / `# \cmd` synonyms from the
  // comments (that is how `\hbar` appears – as an alternative to `\hslash`),
  // each gated through the renderer and sharing the same search terms.
  for (const candidate of [command, ...alternateCommands(comments ?? '')]) {
    if (seenCommands.has(candidate)) continue;
    if (!renders(candidate)) continue;
    const synonyms = SYNONYMS.filter(([re]) => re.test(candidate)).flatMap(([, terms]) =>
      terms.split('; '),
    );
    const seenTerms = new Set();
    const keep = (phrase) => {
      const key = normalise(phrase);
      if (!key || seenTerms.has(key)) return false;
      seenTerms.add(key);
      return true;
    };
    const description = [...prose, ...synonyms].filter(keep).join('; ');
    const alias = aliasPhrases.filter(keep).join('; ');
    if (!description && !alias) continue; // nothing to search by
    seenCommands.add(candidate);
    entries.push({
      c: candidate,
      u: char,
      d: description,
      ...(alias ? { a: alias } : {}),
    });
  }
}

/**
 * Common commands neither dataset maps directly (unimathsymbols lists a
 * different primary command, or none): hand-seeded, still renderer-gated.
 */
const EXTRA = [
  ['\\emptyset', '∅', 'empty set; null set'],
  ['\\degree', '°', 'degree sign; angle degrees; temperature'],
  ['\\dots', '…', 'ellipsis; dots; and so on'],
  // The conventional command; unimathsymbols lists \hslash as the primary
  // for U+210F and \hbar only as a similar-character cross-reference.
  ['\\hbar', 'ℏ', "planck constant over two pi; h bar; planck's constant"],
];
for (const [command, char, description] of EXTRA) {
  if (seenCommands.has(command) || !renders(command)) continue;
  seenCommands.add(command);
  entries.push({ c: command, u: char, d: description });
}

let structuralCount = 0;
for (const [latex, glyph, description] of STRUCTURAL) {
  if (!renders(latex.replaceAll('#?', '\\placeholder{}'))) {
    console.warn(`structural entry does not render, skipped: ${latex}`);
    continue;
  }
  entries.push({ c: latex, u: glyph, d: description });
  structuralCount++;
}

// A bare `\hat`, `\sqrt`, `\overbrace`, … duplicates its placeholder
// template, and the template is the strictly better insert (a bare accent
// applies to nothing). Fold the bare entry's search terms into the template
// and drop it. Script-taking operators (`\sum_{#?}^{#?}`) are untouched –
// a bare `\sum` is a legitimate insert of its own.
const templateByName = new Map();
for (const entry of entries) {
  const m = /^\\([a-zA-Z]+)\{/.exec(entry.c);
  if (entry.c.includes('#?') && m && !templateByName.has(m[1])) {
    templateByName.set(m[1], entry);
  }
}
let folded = 0;
for (let i = entries.length - 1; i >= 0; i--) {
  const entry = entries[i];
  if (entry.c.includes('#?') || !/^\\[a-zA-Z]+$/.test(entry.c)) continue;
  const template = templateByName.get(entry.c.slice(1));
  if (!template) continue;
  const known = new Set(
    [...template.d.split(';'), ...(template.a ?? '').split(';')].map(normalise),
  );
  const extraTerms = [...entry.d.split(';'), ...(entry.a ?? '').split(';')]
    .map((part) => part.trim())
    .filter((part) => part && !known.has(normalise(part)));
  if (extraTerms.length > 0) {
    template.a = [...(template.a ? [template.a] : []), ...extraTerms].join('; ');
  }
  entries.splice(i, 1);
  folded++;
}
if (folded > 0) console.log(`folded ${folded} bare commands into their templates`);

/**
 * Display-name overrides. The first phrase of `d` is the name the search
 * results and the draw candidate list announce (displayName in
 * symbol-search.ts), and for visually inseparable classes the dataset
 * phrases do not disambiguate when read aloud – "intersection" against
 * "intersection operator" says nothing a listener can choose between. For
 * \bigvee/\bigwedge the source data is simply wrong (the two names are
 * swapped). The override becomes the leading phrase; the previous phrases
 * drop behind it as search terms, so nothing stops matching.
 */
const DISPLAY_NAME_OVERRIDES = new Map([
  ['\\triangle', 'triangle'],
  ['\\subsetneq', 'subset, not equal'],
  ['\\trianglelefteq', 'normal subgroup or equal'],
  ['\\vartriangleleft', 'normal subgroup of'],
  ['\\lhd', 'left-pointing triangle'],
  ['\\cup', 'union'],
  ['\\bigcap', 'large intersection (n-ary)'],
  ['\\bigcup', 'large union (n-ary)'],
  ['\\bigvee', 'large logical or (n-ary)'],
  ['\\bigwedge', 'large logical and (n-ary)'],
  ['\\bigoplus', 'large circled plus (n-ary)'],
  ['\\bigotimes', 'large circled times (n-ary)'],
  ['\\bigodot', 'large circled dot (n-ary)'],
  ['\\bigsqcup', 'large square union (n-ary)'],
  ['\\biguplus', 'large union with plus (n-ary)'],
  ['\\setminus', 'set minus'],
  ['\\backslash', 'backslash'],
  ['\\longmapsto', 'long maps to'],
  ['\\cdots', 'three dots, centred'],
  ['\\amalg', 'amalgamation'],
]);
let overridden = 0;
for (const entry of entries) {
  const override = DISPLAY_NAME_OVERRIDES.get(entry.c);
  if (override === undefined) continue;
  const rest = entry.d
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && normalise(part) !== normalise(override));
  entry.d = [override, ...rest].join('; ');
  overridden++;
}
if (overridden !== DISPLAY_NAME_OVERRIDES.size) {
  const present = new Set(entries.map((entry) => entry.c));
  for (const command of DISPLAY_NAME_OVERRIDES.keys()) {
    if (!present.has(command)) console.warn(`display-name override matches no entry: ${command}`);
  }
}

const output = {
  // Bump when the entry shape changes; the loader checks it.
  version: 1,
  sources:
    'unimathsymbols.txt (LPPL 1.3+) + W3C unicode.xml, filtered to what the ' +
    'installed MathLive renders. See docs/symbol-index-licences.md.',
  // The exact upstream revisions the entries were built from.
  upstream: Object.fromEntries(
    Object.entries(SOURCES).map(([name, { repo, commit }]) => [name, `${repo}@${commit}`]),
  ),
  mathlive: JSON.parse(readFileSync(path.join(ROOT, 'node_modules/mathlive/package.json'), 'utf8'))
    .version,
  entries,
};

writeFileSync(OUT, JSON.stringify(output));
console.log(
  `wrote ${entries.length} entries (${structuralCount} structural) to ${path.relative(ROOT, OUT)} – ` +
    `${(JSON.stringify(output).length / 1024).toFixed(1)} KB`,
);
