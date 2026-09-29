# Chrome Web Store listing

The text and images for the extension's Chrome Web Store entry, kept here
so the listing changes alongside the code. The images are generated from
the built extension:

```bash
npm run build
node scripts/generate-store-images.mjs
```

## Store listing tab

**Name** (from the manifest): Radicand – Accessible Maths Editor

**Summary** (from the manifest, 132 characters at most):

> Write, hear and copy maths equations in an accessible side-panel editor. Keyboard-first, screen-reader-friendly, fully offline.

**Description**:

```text
Radicand is a maths equation editor that lives in Chrome's side panel. Type LaTeX or pick symbols, see the result as you go, and copy it out as MathML or LaTeX. Everything works from the keyboard and with a screen reader, and nothing leaves your browser.

• Visual editing with LaTeX underneath – type \sqrt, \alpha or / and see the maths; open the source view to edit the LaTeX directly.
• Find any symbol – search over 700 symbols by description ("for all", "open face R"), browse the palette, or draw the symbol and pick from the matches.
• Copy anywhere – MathML pastes as real maths into maths-aware word processors; LaTeX for everything else.
• Hear it – spoken maths in ClearSpeak or MathSpeak.
• Reuse your work – a library of named formulae and your own \ shortcuts, both exportable as JSON.
• Make it yours – light, dark and high-contrast themes, text size, and a switch for every piece of the interface, down to a bare equation field.

Open the panel with the toolbar icon or Ctrl+Shift+U (Cmd+Shift+U on a Mac).

Accessibility: the editor targets WCAG 2.2 AA and is checked by an automated audit and keyboard tests on every change. It works at 400% zoom and in Windows High Contrast.

Privacy: no analytics, no network requests and no access to the pages you visit. Your library and settings stay in your browser.

Free and open source under the MIT License: https://github.com/dbuik1/radicand
User guide: https://github.com/dbuik1/radicand/blob/main/docs/user-guide.md
```

**Category**: Education, in the Productivity group. Accessibility is the
other good fit if you would rather be listed with assistive tools.

**Language**: English (United Kingdom)

**Store icon**: `src/assets/icons/icon-128.png`

**Screenshots** (1280×800), in this order:

1. `screenshot-1-editing.png` – Build the equation, then copy its LaTeX or
   MathML anywhere
2. `screenshot-2-search.png` – Stuck on a symbol? Search for it by what it
   means
3. `screenshot-3-drawing.png` – Draw it if you cannot name it
4. `screenshot-4-library.png` – Keep the formulae you reuse
5. `screenshot-5-contrast.png` – Made for the keyboard and screen readers

The first two show the panel beside [TeXnique](https://texnique.xyz/), an
open-source LaTeX typesetting game, which has no connection with Radicand.
Neither the captions nor the description name it.

**Small promo tile** (440×280): `promo-small-440x280.png`

**Marquee promo tile** (1400×560): `promo-marquee-1400x560.png`

**Official URL**: none

**Homepage URL**: https://github.com/dbuik1/radicand

**Support URL**: https://github.com/dbuik1/radicand/issues

## Privacy tab

**Single purpose**:

```text
Write maths equations in the browser's side panel and copy them as MathML or LaTeX to paste into other documents.
```

**Permission justifications**:

- `sidePanel`:
  ```text
  The editor is the extension's side panel; this permission lets it open there beside the page the user is working on.
  ```
- `storage`:
  ```text
  Saves the user's formula library, custom LaTeX shortcuts, recently used symbols and settings in the browser, so they are kept between sessions. Nothing is sent anywhere.
  ```
- `clipboardWrite`:
  ```text
  The Copy button and Alt+C put the equation on the clipboard as MathML and LaTeX so it can be pasted into a document.
  ```

**Remote code**: No, I am not using remote code. Every script is in the
package.

**Data usage**: tick none of the data types – the extension collects no
user data. Tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the
  approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

**Privacy policy URL**:
https://github.com/dbuik1/radicand/blob/main/PRIVACY.md

## Distribution tab

- **Payments**: Free of charge
- **Visibility**: Public
- **Distribution**: All regions
