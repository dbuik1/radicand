# Contributing

Thank you for helping. Bug reports, accessibility findings and pull
requests are all welcome. Reports from people who use a screen reader,
switch access or keyboard-only navigation are especially valuable: the
automated audit cannot hear what a screen reader says.

Everyone taking part agrees to the [code of conduct](CODE_OF_CONDUCT.md).

## Reporting a bug

Open an issue and choose **Bug report** or **Accessibility problem**; the
form asks for what you did, what you expected, what happened, your browser
and, for accessibility problems, the assistive technology and its version.
Security problems go through [SECURITY.md](SECURITY.md) instead.

## Setting up

You need Node 22.12 or newer and a Chromium-based browser.

```bash
npm ci
npx playwright install chromium   # once, for the browser-based suites
npm run build                     # builds the extension into dist/
```

Load `dist/` in Chrome from `chrome://extensions` with Developer mode on
(**Load unpacked**). [AGENTS.md](AGENTS.md) lists every check command.

## Rules the project holds itself to

- **Offline.** Nothing may make a network request at runtime; every asset
  is bundled. The build fails if anything tries.
- **Accessible.** WCAG 2.2 AA is the floor and everything must work from
  the keyboard alone. `npm run test:a11y` must report no new violations.
- **No UI framework.** Vanilla TypeScript, Vite and @crxjs.
- **Editor bugs start with a failing test.** The editor's behaviours
  interlock, so reproduce a bug with a failing e2e spec in `tests/e2e/specs/`
  first and keep it as a regression test.

## Pull requests

1. Branch from `main` and keep each pull request to one change.
2. Run the checks before opening it:
   `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`,
   `npm run test:ext` and `npm run test:a11y`. CI runs the same on Linux
   and Windows.
3. Title it as a [Conventional Commit](https://www.conventionalcommits.org/)
   (`fix: …`, `feat: …`, `docs: …`).
4. Write British English in interface text, comments and docs.

If you used an AI coding assistant, say so in the pull request. You are
responsible for every line you submit, whoever or whatever typed it.

## Licence

By contributing you agree that your contribution is licensed under the
project's [MIT License](LICENSE).
