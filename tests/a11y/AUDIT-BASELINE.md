# Accessibility audit – baseline (September 2026, produced from commit 9862dda)

Produced by `npm run test:a11y` (Playwright driving the real side-panel build in
headless Chromium; axe-core restricted to WCAG 2.0/2.1/2.2 A+AA tags, plus
custom keyboard / focus / target-size / reflow / live-region / naming checks).
Themes audited: **light, dark, high-contrast**.

> Methodology note: an earlier version of the harness reported roughly 150
> findings that proved to be tooling artefacts (outline styles read on
> *unfocused* elements, and hidden tab-panel contents measured at 0×0). The
> checks now drive focus with real Tab keypresses and measure targets only
> while their UI state is visible (each palette tab opened, matrix picker
> popover opened, each workspace mode opened). The results below come from
> those corrected checks.

## Passing

| Check | Result |
| --- | --- |
| axe WCAG A/AA – app-owned DOM | **0 violations** in all three themes |
| Keyboard tab order | The audited walk covers the default state: the Style ▾ and More ▾ menu buttons are one stop each (arrow keys move inside the open menu), the symbol search and the Insert… control are one stop each, then the category tabs and the symbol grid; plus the "Equation source" disclosure's "Show as" select and textarea (open during the walk) and one headless-walk artefact stop on `<body>`. Skip link first in document order; Style ▾, More ▾, math field, symbol search, Insert…, palette tabs, symbol grid, Copy, Copy format ▾, Speak and Save to library all reachable; the other modes (Drawing, My library, Settings, Keyboard shortcuts) are opened in turn by the audits and each ends in its own Close button; no traps; no positive tabindex |
| Focus visibility (SC 2.4.7) | Visible indicator on every Tab stop in light, dark and high-contrast |
| Target size (SC 2.5.8, 24×24) | All interactive targets pass, including palette buttons, matrix-picker cells and every mode's controls measured while that mode is open |
| Reflow (SC 1.4.10) | No page-level horizontal scroll at 320 px, with the `\` finder open as well as closed |
| Live regions (SC 4.1.3) | `#sr-status` / `#sr-alert` present at boot; palette insertion announced ("Inserted Fraction"). The `\` finder speaks its own highlight and insertion – focus stays in MathLive's shadow root, so `aria-activedescendant` cannot reach its options |
| Names & headings | Every interactive element has an accessible name; heading order h1 → h2 |

## Open findings (tracked in known-issues.json)

The single remaining violation is inside **MathLive's shadow internals**. It is
reported once per scan, and each theme is scanned once per workspace mode plus
once with the `\` finder open, so one underlying issue accounts for every entry
in the run. Each known-issue id names the scan it was seen in
(`axe-mathlive:<theme>:<scan>:<rule>:<selector>`), so the same rule reported in
a new mode is a new finding; an entry the run no longer reports is listed as
stale and fails the run until it is removed.

1. **`nested-interactive` on `math-field`** – the focusable host wraps its
   focusable internal sink. This is MathLive's architecture; not safely fixable
   from the outside. Revisit on MathLive upgrades.

## Recently fixed

1. **`aria-input-field-name` on `.ML__keyboard-sink`** (FIXED) – MathLive's hidden
   keyboard-capture element lacked an accessible name. Solution: set an
   `aria-label` on the sink after mount from `createEditor`, with polling to
   ensure the label persists through MathLive's initialisation cycle.

## Manual-review notes (warnings, not violations)

- `axe-incomplete:*:color-contrast` on the Style menu's "Blackboard bold"
  toggle: axe could not compute the contrast of its double-struck ℝ glyph
  automatically. The button uses the same solid token colours as its passing
  siblings, so this is almost certainly a measurement limitation, but check
  it visually when convenient.
- Real screen-reader behaviour (NVDA/JAWS/VoiceOver reading of the maths
  content itself) cannot be automated here; the checks above cover the
  programmatic API surface (names, roles, live regions) that screen readers
  consume.
