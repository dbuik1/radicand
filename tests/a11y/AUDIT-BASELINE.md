# Accessibility audit – baseline (1 October 2026, produced from commit 6419408)

Produced by `npm run test:a11y` (Playwright driving the real side-panel build in
headless Chromium; axe-core restricted to WCAG 2.0/2.1/2.2 A+AA tags, plus
custom keyboard / focus / target-size / reflow / live-region / naming checks).
Themes audited: **light, dark, high-contrast**.

Latest run: 30 violations (30 known, 0 new), 0 stale known issues, 60
warnings (axe-incomplete). Every check in sections B–G passed.

Scan inventory: each theme is axe-scanned in ten states – `symbols`, `finder`
(the `\` finder open), `drawing`, `my-library`, `settings`,
`keyboard-shortcuts`, and the four custom-shortcuts states
`custom-shortcuts-empty`, `custom-shortcuts-list`, `custom-shortcuts-form`
and `custom-shortcuts-import` – so 30 scans in all. The other checks are the
tab-order walk, focus visibility, target size, reflow (320 px, seven modes
across five font sizes), live regions (including My library and Custom
shortcuts keeping keyboard focus through their flows, the latter ending in an
escape step) and names and headings.

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
   from the outside. Revisit on MathLive upgrades. A MathLive 0.111.0 upgrade
   was trialled: the element's role changed from `math` to `group`, but axe
   still flags `#equation-editor` with "Element has focusable descendants", so
   the known issue stays (the project remains on 0.110.0).

## Recently fixed

1. **`aria-input-field-name` on `.ML__keyboard-sink`** (FIXED) – MathLive's hidden
   keyboard-capture element lacked an accessible name. Solution: set an
   `aria-label` on the sink after mount from `createEditor`, with polling to
   ensure the label persists through MathLive's initialisation cycle.

## Manual-review notes (warnings, not violations)

- Style menu "Blackboard bold" item (ℝ glyph) – manual contrast check, replacing
  the earlier axe-incomplete note (axe no longer reports this item as
  incomplete). There is no separate Blackboard theme: the item is the
  `mathbb` entry of the Style ▾ menu and is checked in each of the three
  themes. Measured from computed styles in the built panel (headless
  Chromium; focus reached with the keyboard so `:focus-visible` applies).
  The glyph and label share one colour. Text needs 4.5:1; the 2px focus ring
  needs 3:1 against the item fill it sits on.

  | Theme | State | Foreground | Background | Text ratio | Focus ring ratio |
  | --- | --- | --- | --- | --- | --- |
  | Light | off | #1a1c1e | #ffffff | 17.09 | – |
  | Light | on (checked) | #1a1c1e | #ffffff | 17.09 | – |
  | Light | hover | #1a1c1e | #f4f5f7 | 15.67 | – |
  | Light | focus | #1a1c1e | #f4f5f7 | 15.67 | 6.11 (#0b5cad) |
  | Dark | off | #f1f3f5 | #15171a | 16.14 | – |
  | Dark | on (checked) | #f1f3f5 | #15171a | 16.14 | – |
  | Dark | hover | #f1f3f5 | #262a2f | 12.98 | – |
  | Dark | focus | #f1f3f5 | #1f2226 | 14.36 | 7.15 (#6fb1ff) |
  | High contrast | off | #ffffff | #000000 | 21.00 | – |
  | High contrast | on (checked) | #ffffff | #000000 | 21.00 | – |
  | High contrast | hover | #ffffff | #000000 | 21.00 | – |
  | High contrast | focus | #ffffff | #000000 | 21.00 | 14.88 (#ffd60a) |

  Verdict: every state passes in all three themes; no colour token changed.
  The checked state is distinguished by the ✓ in the item's check column and
  `aria-checked`, not by colour; in high contrast the hover state has no fill
  change by design (it is not a contrast failure).
- Remaining `axe-incomplete` warnings (20 per theme) are the Style trigger's
  decorative chevron (`color-contrast`) and `aria-valid-attr-value` on
  `#style-trigger`, repeated across scans; both need manual review rather than
  being failures.
- Real screen-reader behaviour (NVDA/JAWS/VoiceOver reading of the maths
  content itself) cannot be automated here; the checks above cover the
  programmatic API surface (names, roles, live regions) that screen readers
  consume.
