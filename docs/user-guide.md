# User guide

Radicand is a Chrome side panel for writing maths. This guide
walks through everything the panel does, in the order most people meet it,
with the keyboard route for every step. Nothing here needs a mouse.

Contents

1. [Open the panel](#1-open-the-panel)
2. [Write an equation](#2-write-an-equation)
3. [Put in a symbol](#3-put-in-a-symbol)
4. [Build structures: fractions, roots, powers, matrices](#4-build-structures)
5. [Style part of the equation](#5-style-part-of-the-equation)
6. [Copy the equation into another program](#6-copy-the-equation-into-another-program)
7. [Hear the equation](#7-hear-the-equation)
8. [Save and reuse equations: My library](#8-save-and-reuse-equations-my-library)
9. [Type your own shortcuts: Custom shortcuts](#9-type-your-own-shortcuts-custom-shortcuts)
10. [Read or edit the source](#10-read-or-edit-the-source)
11. [Make the panel yours: Settings](#11-make-the-panel-yours-settings)
12. [Keyboard shortcuts](#12-keyboard-shortcuts)
13. [Using a screen reader](#13-using-a-screen-reader)
14. [When something looks wrong](#14-when-something-looks-wrong)

## 1. Open the panel

The Chrome Web Store listing is pending review. Until it is published,
install a release by hand as the [README](../README.md#install) describes.

Press **Ctrl+Shift+U** (**Cmd+Shift+U** on a Mac), or click the extension's
toolbar icon. The panel opens at the side of the browser window with the
cursor already in the equation field, so you can start typing at once.

If the side panel feels narrow, **More ▾ › Open in a new window** or
**Open in a new tab** gives the editor a window of its own. Everything
works the same there.

## 2. Write an equation

The equation field shows the maths as it will look. Type letters, numbers
and operators as you would on paper: `x^2` gives x², `a_1` gives a
subscript, `2/3` builds a fraction (see [section 4](#4-build-structures)).

**Commands.** Type a backslash and start a name, and a list of matching
commands opens under the field. `\sq` offers the square root, `\al` alpha,
and so on. The list also matches plain descriptions, so `\all` finds ∀ and
`\root` finds a square root. Use **Arrow Up** and **Arrow Down** to move
the highlight, **Enter**, **Tab** or **space** to insert, and **Escape** to
dismiss the list and keep typing. Each highlighted row and each insertion is
spoken.

A command completes by itself only when no longer command starts with it:
`\sqrt` becomes a square root with an empty slot inside it without waiting
for a key press. Otherwise the panel waits for you, so `\le` stays open while
you type `\leq`, `\left` or `\leftarrow`, and `\sin` while you type `\sinh`.
Press **Space**, **Tab** or **Enter** to confirm such a command, or pick it
from the list. Settings › Editing › Autocomplete delay sets how long the
panel waits before completing a command that qualifies.

**Empty slots.** Structures come with empty slots (a square root's inside,
a fraction's top and bottom). **Tab** moves to the next slot. Type into a
slot to fill it.

**Moving around.** The arrow keys move through the equation, including up
into a fraction's top and down into its bottom. **Backspace** deletes one
piece at a time, and deleting a structure that still has content inside it
keeps that content in place.

**Undo.** **Ctrl+Z** (**Cmd+Z**) undoes, including an automatic completion.

## 3. Put in a symbol

There are four routes to a symbol. All of them insert at the cursor and
hand focus straight back to the equation.

**Search by name or description.** Press **Ctrl+/** (**Cmd+/** on a Mac)
from anywhere in the panel. A small search box opens directly under the
equation. Describe what you want: "for all", "open face R", "square root",
"less than or equal". The top matches appear as you type. **Arrow Down**
and **Arrow Up** move between them, and **Enter** inserts at the cursor,
closes the box and puts you back in the equation. **Escape** (or **Ctrl+/**
again) closes it without inserting. Over 700 symbols and templates are
indexed and the search runs offline. Anything you have saved to your
library appears in the same results.

The *Search symbols* box above the palette searches the same way, for
browsing: **Enter** inserts and keeps you in the box, so you can insert
several symbols in a row.

Pressing `/` on its own, in the equation, builds a fraction. It
does not open the search. See [section 14](#14-when-something-looks-wrong)
if that catches you out.

**The symbol palette.** Below the search box, the palette has eight tabs:
Recent, Layout, Operators, Greek, Sets, Arrows, Functions and Matrix. The
tab strip scrolls sideways when the panel is narrow. **Arrow Left** and
**Arrow Right** move between tabs, **Tab** moves into the grid, and the
arrow keys move between symbols. **Enter** or **space** inserts one. The
Recent tab keeps the twelve symbols you inserted most recently.

From the equation, **Tab** moves to the search box, then the **Insert…**
control, then the category tabs and then the symbol grid. **Escape** from
the search or the palette returns to the equation.

**Draw it.** Choose **Insert… › Drawing** beside the search box, or
**More ▾ › Drawing**. Sketch the symbol with a mouse, trackpad, pen or
finger, using as many strokes as you like. The best matches update after
every stroke; choose one with the arrow keys and **Enter**. *Undo stroke*
and *Clear* start again. Recognition compares your strokes with real
handwriting samples and needs no connection. Every symbol you can draw is
also findable by the search, which is the keyboard route to the same
symbols.

**From your library.** **Insert… › My library** or **More ▾ › My library**
opens your saved equations. This is for whole equations, not single
symbols: the quadratic formula in one keystroke, say. See
[section 8](#8-save-and-reuse-equations-my-library).

## 4. Build structures

| Structure | Keyboard | Palette |
| --- | --- | --- |
| Fraction | type `/` after the numerator, or `\frac` | Layout › ½ |
| Square root | `\sqrt` | Layout › √ |
| Power | `^` | Layout › xⁿ |
| Subscript | `_` | Layout › xₙ |
| Sum, integral, limit | `\sum`, `\int`, `\lim` | Operators |
| Matrix | the Matrix tab | Matrix › quick sizes or a custom size up to 20×20 |

Inside a matrix, **Ctrl+Enter** adds a row below the cursor and
**Ctrl+Shift+Enter** adds a column to the right. **Tab** moves between
cells.

Sums, integrals and limits carry their limits above and below: **Arrow Up**
and **Arrow Down** move into them.

## 5. Style part of the equation

Select the part to style, then open **Style ▾** above the field and choose
Bold, Italic, Upright, Blackboard bold, Calligraphic or Fraktur. With
nothing selected, the style is armed for whatever you type next. Every
change is announced. **Ctrl+B** and **Ctrl+I** (**Cmd** on a Mac) toggle
bold and italic directly, and typed commands such as `\mathbb` behave the
same way.

## 6. Copy the equation into another program

Press **Copy**, just under the equation, or **Alt+C** (**Option+C** on a
Mac) from anywhere in the panel. The line under the button confirms what was
copied.

The **▾** beside Copy chooses the format:

- **MathML** pastes as real, editable maths into maths-aware programs: Word,
  Google Docs, OneNote, LibreOffice, Pages and many learning platforms.
- **LaTeX** pastes as source text, for Overleaf, Markdown, Moodle, forums
  and anywhere else that reads LaTeX.

The choice is remembered. Settings › Editing › *Tidy brackets in copied
LaTeX* removes the extra braces MathLive sometimes writes.

**Ctrl+C** (**Cmd+C** on a Mac) in the equation copies the LaTeX of the
selection, or of the whole equation when nothing is selected, whatever the
format above is set to.

## 7. Hear the equation

**Speak** reads the equation aloud in the browser's own voice, and turns
into **Stop speaking** while it plays. The rules that turn maths into words
come from the Speech Rule Engine, and Settings › Speech chooses between two
styles:

- **ClearSpeak** reads maths the way a teacher would say it aloud.
- **MathSpeak** is the more explicit style used by screen-reader users, with
  a *Terse*, *Medium* or *Verbose* level.

Screen readers read the equation the same way as they move through it, so
the setting shapes both.

## 8. Save and reuse equations: My library

**Save.** Press **Save to library**, beside Copy under the equation, or **Alt+S**
(**Option+S**). The form saves the whole equation, or just the selection if
you have one. The name starts as the equation itself between dollar signs;
type a better one if you like – the name is what you will search for later.
Maths between dollar signs in the name is shown as maths – *Area of a
circle $\pi r^2$* – and read out as words; `\$` is a plain dollar sign.
*More options* opens the LaTeX, with a preview, a trigger and keywords.

**Empty slots in a saved equation.** Select part of the LaTeX in the form
and press *Blank out selection* to turn it into an empty slot. The equation
then comes back as a template you fill in with Tab.

**Insert.** Three ways:

- **Insert… › My library** beside the search box, or **More ▾ › My
  library**, lists everything you have saved. Filter by typing, sort by
  recently used, name or recently added, and press **Enter** on an entry
  to insert it.
- The **symbol search** (**Ctrl+/**, or the *Search symbols* box) matches
  saved equations as well as symbols.
- A **trigger** of your own. Give an entry a trigger such as `quad` in the
  form and then, in the equation, type `\quad` and press **space**, **Tab**
  or **Enter**. Triggers never fire on their own, so they cannot hijack a
  command you were typing.

**Keep it safe.** *Export library* writes a JSON file you can back up or
share; *Import library…* reads one, and asks whether to merge or replace
what you already have. A formula whose trigger is already in use – by
another formula, a custom shortcut or a LaTeX command – comes in without
it. The optional starter pack adds a small set of common
formulae to build on. The library lives in this browser profile only, so
export it before moving machines.

## 9. Type your own shortcuts: Custom shortcuts

A custom shortcut is a short `\` trigger of your own that types a longer
piece of LaTeX: `\al` for alpha, `\RR` for the real numbers, `\ddx` for a
derivative. **More ▾ › Custom shortcuts**, or the *Custom shortcuts…*
button in Keyboard shortcuts, opens the list.

**Use one.** Type the trigger in the equation, such as `\al`, and press
**space**, **Tab** or **Enter**. Like library triggers, custom shortcuts
never fire on their own.

**Add or edit.** *Add shortcut* opens a form with the trigger, the LaTeX it
inserts, and an optional name and keywords. A trigger is two or more
letters, and cannot be a LaTeX command or a trigger already used by another
shortcut or by My library. *Blank out selection* turns part of the LaTeX
into an empty slot you fill in with Tab. In the list, press **Enter** on a
shortcut to insert it, or *Edit* to change or delete it. *Undo delete*
brings back the last one you deleted.

**The common set.** *Add common shortcuts* adds a ready-made set of short
triggers for Greek letters, number sets, logic, powers and roots,
calculus and brackets, skipping any
trigger you already use. *Remove common shortcuts* takes out the ones you
have not changed.

**Keep them safe.** *Export shortcuts* writes a JSON file. *Import…* reads
one and asks whether to skip duplicates, keep both copies, or replace your
shortcuts. If the file uses a trigger more than once, it also asks whether
to keep every copy, each under a new trigger, or only the first. Like the library, shortcuts live in this browser profile only.

## 10. Read or edit the source

**Equation source**, the disclosure under the symbols, shows the equation as
LaTeX or MathML. The LaTeX is editable: change it and the equation follows.
Its open or closed state is remembered.

## 11. Make the panel yours: Settings

**More ▾ › Settings**, or **Alt+,** (**Option+,**), opens Settings inside the
panel. Settings apply to every window and tab the editor is open in, and
follow you to other computers signed into the same Chrome profile.

**Interface.** One checkbox per piece of the panel: the Equation heading, the
Style and More menus, the symbol palette, its search box, its categories and
keys, the Insert… control, the equation source, and the Copy, Speak and Save
buttons. Switch off what you do not use and the panel becomes as bare as an
equation field and a keyboard. Every shortcut keeps working with its button
gone, and *Show every piece* brings the lot back. **Alt+,** always reaches
Settings, whatever else is off.

**Appearance.** Theme (system, light, dark or high contrast), the size of
the panel's text, and the size of the equation itself, as a slider or a
typed percentage.

**Editing.** *Automatically shrink large equations to fit* keeps a long
equation on screen. *Autocomplete delay* sets how long commands that no longer
command starts with wait before completing. *Typing / inserts a fraction* can be switched off if you
would rather `/` stay a plain slash. *Tidy brackets in copied LaTeX* is
described in [section 6](#6-copy-the-equation-into-another-program).

**Speech.** The reading style and level from
[section 7](#7-hear-the-equation).

## 12. Keyboard shortcuts

**More ▾ › Keyboard shortcuts** lists these inside the panel, with the live
bindings if you have changed them. On a Mac read Cmd for Ctrl and Option for
Alt in the first two groups.

Panel

| Action | Keys |
| --- | --- |
| Open or close the panel | Ctrl+Shift+U |
| Show or hide the symbols | Ctrl+Shift+Y |
| Search for a symbol | Ctrl+/ |
| Copy the equation | Alt+C |
| Save to library | Alt+S |
| Open Settings | Alt+, |
| Close a mode and return to the equation | Escape |

In the equation

| Action | Keys |
| --- | --- |
| Find a command | `\` then letters |
| Choose from the command list | Arrow Up / Arrow Down |
| Insert the highlighted command | Enter, Tab or space |
| Dismiss the command list | Escape |
| Build a fraction | `/` |
| Next empty slot | Tab |
| Bold / italic | Ctrl+B / Ctrl+I |
| Add a matrix row / column | Ctrl+Enter / Ctrl+Shift+Enter |
| Undo | Ctrl+Z |

The first two panel shortcuts are registered with Chrome and can be
changed at `chrome://extensions/shortcuts`; the *Change shortcuts in
Chrome…* link in the Keyboard shortcuts list takes you there.

## 13. Using a screen reader

The panel is built for keyboard-only use with a screen reader:

- The equation field announces itself as *Equation*. Moving through it with
  the arrow keys reads each part in the style chosen under Settings ›
  Speech.
- Every insertion, style change, copy and save is announced, as is the
  highlighted row of the command list and the number of matches.
- Menus are standard menu buttons: **Enter** or **Arrow Down** opens,
  arrows move, **Enter** chooses, **Escape** closes and returns focus.
- Symbol grids and result lists are single-stop: one **Tab** lands on them,
  and the arrow keys move inside. So are Copy, Speak and Save to library:
  **Tab** from the equation lands on Copy, **Arrow Right** and **Arrow
  Left** move between them, and the next **Tab** goes on to the symbols.
- Opening a workspace mode (Drawing, My library, Settings, Keyboard
  shortcuts) moves focus into it; **Escape** or its Close button returns
  focus to the equation.
- Nothing you switch off in Settings › Interface removes a function: the
  shortcuts stay, and switching a piece off is announced.

The panel meets WCAG 2.2 AA and is checked against it in its automated
tests.

## 14. When something looks wrong

**I pressed `/` to search and got a fraction.** In the equation, `/`
builds a fraction. The search is **Ctrl+/** (**Cmd+/** on a Mac). If you
would rather `/` stayed a plain slash, switch off Settings › Editing ›
*Typing / inserts a fraction*. The first time it happens the panel shows a
short hint under the field saying the same.

**A shortcut does nothing.** Another extension or the page may claim the
same keys. Chrome-registered shortcuts (open the panel, show the symbols)
can be rebound at `chrome://extensions/shortcuts`. The panel's own
shortcuts (Ctrl+/, Alt+C, Alt+S, Alt+,) work only while the panel has
focus: click into it or press **Ctrl+Shift+U** first.

**The panel is too narrow.** Drag the side panel's edge, or open the
editor in its own window or tab from **More ▾**. Every menu stays inside
the panel down to 320 pixels wide.

**Pasted maths came out as text.** Choose MathML under Copy ▾ for word
processors and LaTeX for text editors. Some programs need *Paste* rather
than *Paste as plain text*.

**Nothing is spoken.** Speech uses the browser's voices. If the system has
none installed, or sound is off, the panel announces that speech could
not play.

**Where is my library on another computer?** The library stays in the
browser profile it was made in. Export it as JSON and import it on the
other machine.
