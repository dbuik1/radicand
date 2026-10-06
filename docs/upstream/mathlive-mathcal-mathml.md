# Drafted upstream issue: `\mathcal` loses its style in the MathML export

Ready to file at [arnog/mathlive](https://github.com/arnog/mathlive/issues/new)
under the maintainer's own account. Reproduced on MathLive 0.110.0 and on
0.111.0, the latest release; no existing issue covers it.

---

**Title:** MathML export drops the calligraphic variant: `\mathcal{L}`
serialises as a bare `<mi>L</mi>`

**Body:**

### Description

`convertLatexToMathMl` maps styled letters to their Unicode
mathematical alphanumeric codepoints, but the calligraphic variant falls
through unchanged: `\mathcal{L}` comes out exactly like a plain `L`, with
no codepoint mapping and no `mathvariant` attribute.

### Steps to reproduce

```js
import { convertLatexToMathMl } from 'mathlive'; // 0.111.0 (also 0.110.0)

convertLatexToMathMl('\\mathcal{L}'); // '<mi>L</mi>'                    – style lost
convertLatexToMathMl('\\mathscr{L}'); // '<mi>ℒ</mi>'                    – correct
convertLatexToMathMl('\\mathbb{R}');  // '<mi>ℝ</mi>'                    – correct
convertLatexToMathMl('\\mathbf{v}');  // '<mi mathvariant="bold">v</mi>' – style kept
```

### Expected

`\mathcal{L}` serialises as `<mi>ℒ</mi>` (U+2112), mapping the
calligraphic variant to the Unicode script letters as `\mathscr` already
does. Unicode has no separate calligraphic alphabet, and MathML Core keeps
only `mathvariant="normal"`, so the codepoint is the form every renderer
and assistive technology understands. For MathML 3 consumers,
`<mi mathvariant="script">L</mi>` would be an acceptable alternative.

### Why it matters

MathML is the interchange format screen readers consume. ClearSpeak,
MathSpeak and MathCAT all announce `ℒ` as "script L", but with the
current output a calligraphic letter is read, copied and pasted as a plain
one: a Lagrangian `\mathcal{L}` and a length `L` become indistinguishable
in the exported MathML.

### Environment

- MathLive 0.111.0 (also reproduced on 0.110.0)
- Node 22, calling `convertLatexToMathMl` directly

We found this while building an accessibility-first maths editor on
MathLive, which currently routes calligraphic output through `\mathscr`
to work around it. Happy to open a pull request if a codepoint mapping is
the preferred fix.
