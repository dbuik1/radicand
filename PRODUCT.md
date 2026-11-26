# Radicand

## Platform
Chrome extension, Manifest V3. One page hosted in three surfaces: the docked side panel (about 400 px wide), a pop-out window (about 820 px) and a full tab.

## Stack
Vanilla TypeScript, Vite with @crxjs, MathLive for the field, Speech Rule Engine for speech. No UI framework. Fonts and all other assets are bundled.

## Users
People who write maths into documents: students, teachers, and authors, many of them using a screen reader, keyboard only, magnification or high contrast. In the owner's words: "Assistive technology users but not at the expense of any others, accessibility as in good design not as in a special solution, for a special solution is not needed."

## Product Purpose
Write an equation, find any symbol, and copy the result as LaTeX or MathML into another document.

## Positioning
One good design for everyone. No separate accessible mode, and no trade of one group's ease for another's.

## Operating Context
Open beside the document being written, used in short bursts. The equation is the work; the panel is a tool at the edge of the screen.

## Capabilities and Constraints
- Offline: no network request at runtime, enforced by the build and a content security policy.
- WCAG 2.2 AA is the floor. Every action works from the keyboard.
- Light, dark and high-contrast themes; text size is adjustable; every part of the interface can be switched off.

## Brand Commitments
The name Radicand, and the icon: a white radical sign wrapping a white field with a navy R, on a brand-blue tile.

## Evidence on Hand
Review of 2026-11-26 (link in AGENTS.md). Layout B1 approved by the owner: the equation field, then Copy LaTeX, Copy MathML and Read aloud, then four tabs (Symbols, Draw, Library, Shortcuts). The main copy format is the large button and Alt+C, set in Settings. Canvas under design/panel/layout/.

## Product Principles
- The equation leads every view.
- Copy is one press from the field, in either format.
- A result is shown and spoken, never only one of the two.
- Nothing the user typed is lost by closing the panel.

## Accessibility & Inclusion
Targets of at least 44 px in the redesign, visible focus on every control, no information by colour alone, reduced motion respected, speech in the ClearSpeak or MathSpeak speech style.
