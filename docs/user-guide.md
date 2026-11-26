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
8. [Save and reuse equations: the library](#8-save-and-reuse-equations-the-library)
9. [Type your own shortcuts](#9-type-your-own-shortcuts)
10. [Read or edit the source](#10-read-or-edit-the-source)
11. [Make the panel yours: Settings](#11-make-the-panel-yours-settings)
12. [Keyboard shortcuts](#12-keyboard-shortcuts)
13. [Using a screen reader](#13-using-a-screen-reader)
14. [When something looks wrong](#14-when-something-looks-wrong)

## 1. Open the panel

Install Radicand from the
[Chrome Web Store](https://chromewebstore.google.com/detail/radicand-%E2%80%93-accessible-mat/mgpjglegefndcbfgdhbchjiafeffcbai), or
install a release by hand as the [README](../README.md#install) describes.

Press **Ctrl+Shift+U** (**Cmd+Shift+U** on a Mac), or click the extension's
toolbar icon. The panel opens at the side of the browser window with the
cursor already in the equation field, so you can start typing at once.

The toolbar icon and the shortcut open the side panel unless you choose
otherwise: **Settings › Window › Toolbar icon opens** also offers *New
window* and *New tab*, and applies the next time you click the icon or
press the shortcut. To change the shortcut itself, open
`chrome://extensions/shortcuts` in a tab, or use the *Change shortcuts in
Chrome…* link in the Keyboard shortcuts list.

If the side panel feels narrow, **Settings › Window › Open in window** or
**Open in tab** gives the editor a window of its own. Everything
works the same there. The window reopens at the size and place you last
left it, kept on this computer only and moved back onto the screen if the
monitor it was on has gone.

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
from the list. Settings › Typing › Autocomplete delay sets how long the
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

Under the equation and its buttons are four tabs: **Symbols**, **Draw**,
**Library** and **Shortcuts**. There are four routes to a symbol. All of
them insert at the cursor.

**Search by name or description.** Press **Ctrl+/** (**Cmd+/** on a Mac)
from anywhere in the panel. A small search box opens directly under the
equation. Describe what you want: "for all", "open face R", "square root",
"less than or equal". The top matches appear as you type. **Arrow Down**
and **Arrow Up** move between them, and **Enter** inserts at the cursor,
closes the box and puts you back in the equation. **Escape** (or **Ctrl+/**
again) closes it without inserting. Over 700 symbols and templates are
indexed and the search runs offline. Anything you have saved to your
library appears in the same results.

The *Find a symbol* box in the Symbols tab searches the same way, for
browsing: **Enter** inserts and keeps you in the box, so you can insert
several symbols in a row.

Pressing `/` on its own, in the equation, builds a fraction. It
does not open the search. See [section 14](#14-when-something-looks-wrong)
if that catches you out.

**The symbol keys.** Below the search box are nine categories: Recent,
Layout, Operators, Greek, Styles, Sets, Arrows, Functions and Matrix. The
row of categories scrolls sideways when the panel is narrow. **Arrow Left** and
**Arrow Right** move between tabs, **Tab** moves into the grid, and the
arrow keys move between symbols. **Enter** or **space** inserts one. The
Recent tab keeps the twelve symbols you inserted most recently.

From the equation, **Tab** moves to the copy buttons, then *Skip symbols*,
the four tabs, the search box, the categories and the symbol grid.
**Escape** from the search or the keys returns to the equation.

**Draw it.** Open the **Draw** tab. Sketch the symbol with a mouse, trackpad, pen or
finger, using as many strokes as you like. The best matches update after
every stroke; choose one with the arrow keys and **Enter**. *Undo stroke*
and *Clear* start again. Recognition compares your strokes with real
handwriting samples and needs no connection. Every symbol you can draw is
also findable by the search, which is the keyboard route to the same
symbols.

**From your library.** The **Library** tab lists your saved equations. This is for whole equations, not single
symbols: the quadratic formula in one keystroke, say. See
[section 8](#8-save-and-reuse-equations-the-library).

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

Select the part to style, then open the **Styles** category in the Symbols
tab and press Bold, Italic, Upright, Blackboard bold, Calligraphic or
Fraktur. A key stays pressed while its style is on. With
nothing selected, the style is armed for whatever you type next. Every
change is announced. **Ctrl+B** and **Ctrl+I** (**Cmd** on a Mac) toggle
bold and italic directly, and typed commands such as `\mathbb` behave the
same way.

## 6. Copy the equation into another program

Two buttons sit just under the equation, one for each format:

- **Copy MathML** pastes as real, editable maths into maths-aware programs:
  Word, Google Docs, OneNote, LibreOffice, Pages and many learning
  platforms.
- **Copy LaTeX** pastes as source text, for Overleaf, Markdown, Moodle,
  forums and anywhere else that reads LaTeX.

The line under the buttons confirms what was copied. The first, filled
button is the main format. **Alt+C** (**Option+C** on a Mac) is the quick
copy: it copies in that format from anywhere in the panel. Settings › Copy › *Main copy format* chooses
which of the two that is, and the choice is remembered. *Tidy brackets in
copied LaTeX*, in the same group, removes the extra braces MathLive
sometimes writes.

**Ctrl+C** (**Cmd+C** on a Mac) in the equation copies the LaTeX of the
selection, or of the whole equation when nothing is selected, whatever the
format above is set to.

## 7. Hear the equation

**Read aloud** reads the equation in the browser's own voice, and turns
into **Stop reading** while it plays. The rules that turn maths into words
come from the Speech Rule Engine, and Settings › Speech chooses between two
styles:

- **ClearSpeak** reads maths the way a teacher would say it aloud.
- **MathSpeak** is the more explicit style used by screen-reader users, with
  a *Terse*, *Medium* or *Verbose* level.

Screen readers read the equation the same way as they move through it, so
the setting shapes both.

## 8. Save and reuse equations: the library

**Save.** Press **Save to library** at the top of the Library tab, or
**Alt+S** (**Option+S**) from anywhere in the panel. The form saves the whole equation, or just the selection if
you have one. The name starts as the equation itself between dollar signs;
type a better one if you like – the name is what you will search for later.
Maths between dollar signs in the name is shown as maths – *Area of a
circle $\pi r^2$* – and read out as words; `\$` is a plain dollar sign.
*More options* opens the LaTeX, with a preview, a trigger, keywords and a category.

**Empty slots in a saved equation.** Select part of the LaTeX in the form
and press *Blank out selection* to turn it into an empty slot. The equation
then comes back as a template you fill in with Tab.

**Insert.** Three ways:

- The **Library** tab lists everything you have saved. Filter by typing, sort by
  recently used, name or recently added, and press **Enter** on an entry
  to insert it. Once any entry has a category (set in the **Category**
  field of the save or edit form, which suggests the ones you already
  use, or carried in by an import), a **Category** menu appears beside the sort menu:
  choose a category to list only its formulae, combined with whatever
  you have typed, and choose **All categories** to see everything again.
- The **symbol search** (**Ctrl+/**, or the *Find a symbol* box) matches
  saved equations as well as symbols.
- A **trigger** of your own. Give an entry a trigger such as `quad` in the
  form and then, in the equation, type `\quad` and press **space**, **Tab**
  or **Enter**. Triggers never fire on their own, so they cannot hijack a
  command you were typing.

**Keep it safe.** *Export library* writes a JSON file you can back up or
share; *Import library…* reads one, and asks whether to merge or replace
what you already have. A formula whose trigger is already in use – by
another formula, a shortcut or a LaTeX command – comes in without
it. The optional starter pack adds a small set of common
formulae to build on. The library lives in this browser profile only, so
export it before moving machines.

## 9. Type your own shortcuts

A shortcut is a short `\` trigger of your own that types a longer piece of
LaTeX: `\al` for alpha, `\RR` for the real numbers, `\ddx` for a
derivative. The **Shortcuts** tab lists them.

**Use one.** Type the trigger in the equation, such as `\al`, and press
**space**, **Tab** or **Enter**. Like library triggers, shortcuts never
fire on their own.

**Wrap a selection.** Select part of the equation first, then type the
trigger and confirm it: the selection goes into the shortcut's first empty
slot instead of being replaced, so selecting `x` and typing `\abs` gives
`|x|` when `\abs` is `\left|` slot `\right|`. Any further slots stay empty
and the caret lands after the result. **Ctrl+Z** brings back the selection
as it was. A shortcut with no empty slot has nowhere to put the selection,
so it replaces it; with nothing selected, a shortcut inserts as usual. This
works the same for library triggers.

**Add or edit.** *Add shortcut* opens a form with the trigger, the LaTeX it
inserts, and an optional name and keywords. A trigger is two or more
letters, and cannot be a LaTeX command or a trigger already used by another
shortcut or by the library. *Blank out selection* turns part of the LaTeX
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

**LaTeX source**, the disclosure under the tabs, shows the equation as
LaTeX or, with *Show as* set to MathML, as MathML. The LaTeX is editable: change it and the equation follows.
Its open or closed state is remembered.

## 11. Make the panel yours: Settings

The **Settings** button beside the Equation heading, or **Alt+,**
(**Option+,**), opens Settings inside the panel. Settings apply to every
window and tab the editor is open in, and follow you to other computers
signed into the same Chrome profile.

**Copy.** The main copy format and *Tidy brackets in copied LaTeX*, both
described in [section 6](#6-copy-the-equation-into-another-program).

**Appearance.** Theme (system, light, dark or high contrast), the size of
the panel's text, and the size of the equation itself, as a slider or a
typed percentage.

**Typing.** *Typing / inserts a fraction* can be switched off if you would
rather `/` stay a plain slash. *Shrink large equations to fit* keeps a long
equation on screen. *Autocomplete delay* sets how long a command that no
longer command starts with waits before completing.

**Speech.** The reading style and level from
[section 7](#7-hear-the-equation).

**Window.** *Open in window* and *Open in tab* move the editor out of the
side panel, and *Toolbar icon opens* chooses what the icon and its shortcut
open ([section 1](#1-open-the-panel)).

**Interface.** One checkbox per piece of the panel: the Equation heading,
the copy buttons, the Read aloud button, the tabs below the field, the
symbol search box, the symbol categories and keys, the Save to library
button and the equation source. Switch off what you do not use and the
panel becomes as bare as an equation field and a keyboard. Every shortcut
keeps working with its button gone, and *Show every piece* brings the lot
back. The Settings button and **Alt+,** always reach Settings, whatever
else is off.

## 12. Keyboard shortcuts

The *Keyboard shortcuts* button at the end of the Shortcuts tab lists these
inside the panel, with the live bindings if you have changed them. On a Mac read Cmd for Ctrl and Option for
Alt in the first two groups.

Panel

| Action | Keys |
| --- | --- |
| Open or close the panel | Ctrl+Shift+U |
| Show or hide the symbols | Ctrl+Shift+Y |
| Search for a symbol | Ctrl+/ |
| Quick copy | Alt+C |
| Save to library | Alt+S |
| Open Settings | Alt+, |
| Return to the equation | Escape |

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
- The four tabs are one **Tab** stop: **Arrow Left** and **Arrow Right**
  choose a tab, and the next **Tab** moves into it.
- Symbol grids and result lists are single-stop: one **Tab** lands on them,
  and the arrow keys move inside. So are the copy buttons and Read aloud:
  **Tab** from the equation lands on the main copy button, and **Arrow
  Right** and **Arrow Left** move between them.
- *Skip symbols* comes next: **Enter** on it passes the tabs and lands on
  the source. *Back to equation*, the last stop in the panel, returns to
  the field.
- Opening Settings or the keyboard shortcut list moves focus into it;
  **Escape** or its close button returns focus to the equation.
- Nothing you switch off in Settings › Interface removes a function: the
  shortcuts stay, and switching a piece off is announced.

The panel targets WCAG 2.2 AA and is checked against it in its automated
tests. Known issues remain, chiefly in the equation field the MathLive
library provides, and are being worked on. Radicand changes quickly and
has not had an independent accessibility audit; reports from people who
use assistive technology are especially welcome.

## 14. When something looks wrong

**I pressed `/` to search and got a fraction.** In the equation, `/`
builds a fraction. The search is **Ctrl+/** (**Cmd+/** on a Mac). If you
would rather `/` stayed a plain slash, switch off Settings › Typing ›
*Typing / inserts a fraction*. The first time it happens the panel shows a
short hint under the field saying the same.

**A shortcut does nothing.** Another extension or the page may claim the
same keys. Chrome-registered shortcuts (open the panel, show the symbols)
can be rebound at `chrome://extensions/shortcuts`. The panel's own
shortcuts (Ctrl+/, Alt+C, Alt+S, Alt+,) work only while the panel has
focus: click into it or press **Ctrl+Shift+U** first.

**The panel is too narrow.** Drag the side panel's edge, or open the
editor in its own window or tab from Settings › Window. Everything fits
the panel down to 320 pixels wide.

**Pasted maths came out as text.** Use Copy MathML for word processors
and Copy LaTeX for text editors. Some programs need *Paste* rather
than *Paste as plain text*.

**Nothing is spoken.** Speech uses the browser's voices. If the system has
none installed, or sound is off, the panel announces that speech could
not play.

**Where is my library on another computer?** The library stays in the
browser profile it was made in. Export it as JSON and import it on the
other machine.
