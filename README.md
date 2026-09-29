# Radicand

An accessible maths equation editor that lives in Chrome's side panel. Type LaTeX or
pick symbols, see the result as you go, and copy it out as MathML or LaTeX.
Everything works from the keyboard and with a screen reader, and nothing
leaves your browser.

Built on [MathLive](https://mathlive.io/).

## Features

- **Visual editing with LaTeX underneath** – type `\sqrt`, `\alpha` or `/`
  and see the maths; open the source view to edit the LaTeX directly.
- **Find any symbol** – search over 700 symbols by description ("for all",
  "open face R"), browse the palette, or draw the symbol and pick from the
  matches.
- **Copy anywhere** – MathML pastes as real maths into maths-aware word
  processors; LaTeX for everything else.
- **Hear it** – spoken maths in ClearSpeak or MathSpeak.
- **Reuse your work** – a library of named formulae and your own `\`
  shortcuts, both exportable as JSON.
- **Make it yours** – light, dark and high-contrast themes, text size, and a
  switch for every piece of the interface, down to a bare equation field.

The [user guide](docs/user-guide.md) covers every feature and its
keyboard shortcuts.

## Install

The extension is not yet on the Chrome Web Store. Until it is, install a
release by hand:

1. Download `radicand-<version>.zip` from
   [Releases](../../releases) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode** and choose
   **Load unpacked**, then select the unzipped folder.
3. Open the panel with the toolbar icon or **Ctrl+Shift+U**
   (**Cmd+Shift+U** on a Mac).

Chrome 116 or newer is required.

## Accessibility

The editor targets WCAG 2.2 AA, checked by an axe-core audit and
end-to-end keyboard tests on every change. It works at 400 % zoom and in
Windows High Contrast. Reports from people who use assistive technology are
especially welcome – see [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy

No analytics, no network requests and no access to the pages you visit.
Your library and settings are stored in your browser. The extension asks
for three permissions, none of which triggers an install warning:
`sidePanel`, `storage` and `clipboardWrite`. See [PRIVACY.md](PRIVACY.md).

## Development

You need Node 22.12 or newer.

```bash
npm ci
npm run build   # builds the extension into dist/
npm test        # unit tests
```

[CONTRIBUTING.md](CONTRIBUTING.md) explains the project's rules and how to
send a change, and [AGENTS.md](AGENTS.md) lists every check command.
Security problems go through [SECURITY.md](SECURITY.md). Everyone taking
part agrees to the [code of conduct](CODE_OF_CONDUCT.md).

## Licence

MIT License – see [LICENSE](LICENSE). The extension bundles MathLive and
MiniSearch (MIT), the KaTeX and STIX Two Math fonts (SIL Open Font License
1.1) and Speech Rule Engine (Apache License 2.0); every build includes
their notices in `THIRD-PARTY-NOTICES.txt`. The symbol-search and drawing
data have their own terms, set out in
[docs/symbol-index-licences.md](docs/symbol-index-licences.md).
