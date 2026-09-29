# Drafted upstream issue: `\mathcal` loses its style in the MathML export

Not yet filed. Intended for [arnog/mathlive](https://github.com/arnog/mathlive/issues);
verified against MathLive 0.110.0.

---

**Title:** MathML export drops the calligraphic variant: `\mathcal{L}`
serialises as a bare `<mi>L</mi>`

**Body:**

The MathML serialiser maps styled letters to their Unicode
maths-alphanumeric codepoints, but for the calligraphic variant the mapping
returns the letter unchanged and no `mathvariant` fallback is emitted:

```js
import { convertLatexToMathMl } from 'mathlive'; // 0.110.0

convertLatexToMathMl('\\mathcal{L}'); // '<mi>L</mi>'        – style lost
convertLatexToMathMl('\\mathscr{L}'); // '<mi>ℒ</mi>'        – correct
convertLatexToMathMl('\\mathbb{R}');  // '<mi>ℝ</mi>'        – correct
convertLatexToMathMl('\\mathbf{v}');  // '<mi mathvariant="bold">v</mi>'
```

Consequence: any consumer of the MathML export – including screen readers,
for which MathML is the accessible interchange format – cannot distinguish a
calligraphic letter from a plain one. ClearSpeak, MathSpeak and MathCAT all
announce `ℒ` correctly as "script L", so mapping the calligraphic variant to
the Unicode script codepoints (as `\mathscr` already does), or emitting
`mathvariant="script"` as a fallback, would restore the distinction.

Happy to provide more detail. Found while building an accessibility-first
maths editor on MathLive, where we currently route all calligraphic output
through `\mathscr` to work around this.
