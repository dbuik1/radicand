# Working on this repository

These notes are for coding agents and people alike: what the project is,
the rules it holds itself to, and the commands that check them.

## Project

An accessibility-first WYSIWYG maths editor: a Chrome Manifest V3 side-panel
extension built on MathLive. It is a real, usable product – never describe it
as a proof of concept or prototype in any user-facing text.

Hard invariants:

- **Offline**: no network requests at runtime; all assets bundled. The build
  enforces this (`scripts/check-no-network.mjs`, run as `postbuild`).
- **Accessibility**: WCAG 2.2 AA floor, enforced by `npm run test:a11y`
  (axe-core) and the e2e suite. Keyboard-only operation must always work.
- **No UI framework**: vanilla TypeScript, Vite + @crxjs.

## Commands

- `npm run build` – type-check + production build into `dist/`
- `npm test` – unit tests (vitest)
- `npm run test:e2e` – Playwright e2e suite against a real MathLive field
- `npm run test:ext` – smoke-tests the built `dist/` loaded into Chromium as
  a real unpacked extension (manifest, service worker, storage, offline)
- `npm run test:a11y` – WCAG audit
- `npm run typecheck` – strict `tsc --noEmit`, then the unused-export check
- `npm run check:network` – re-run the offline guard on an existing `dist/`
  without rebuilding
- `npm run check:css` – every class and id selector in `styles.css` is one
  the panel renders (also run as `postbuild`)
- `npm run check:exports` – every exported value has an importer (also run
  by `typecheck`)

Editor behaviours (autocomplete, deletion, navigation, matrix keys in
`src/sidepanel/editor/`) are heavily interlocking and have regressed each
other before: reproduce bugs with a failing e2e spec first, keep it as a
regression test, and run the **full** e2e suite before pushing.

## Conventions

- British English in comments, UI text and docs.
- Spaced en dashes ( – ) in prose, never em dashes.
- Conventional Commits (`fix:`, `feat:`, `docs:`, `perf:`, …).
- Comments state the constraint the code keeps, never where a change came
  from; `src/comment-hygiene.test.ts` enforces the common cases.
