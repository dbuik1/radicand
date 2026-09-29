# How the extension can be presented (and customised)

A report on the ways a Chrome (Manifest V3) extension can show its UI, what each
allows us to control, and what we recommend for this editor.

## Summary table

| Surface | Persists? | Size control | Notes |
| --- | --- | --- | --- |
| **Side panel** (current default) | Yes (docked) | User drags width; **no API to set width** | Survives focus loss – ideal for copy-out. |
| **Detached window** (`chrome.windows.create`, `type: "popup"`) | Yes, until closed | **Full** – we set default width/height; user resizes | Best for "bigger by default" and floating use. |
| **Full tab** (`chrome.tabs.create`) | Yes (a tab) | Maximum (whole viewport) | Most space; behaves like a web app page. |
| **Action popup** (`default_popup`) | **No** – closes on blur | CSS, but Chrome **clamps to ≤ 800×600** | Quick, but closing on blur breaks copy-out. |
| **Options page** (`options_ui`) | Yes (tab/embedded) | Tab-sized | For settings, not the editor itself. |
| **In-page overlay** (content script injection) | n/a | n/a | **Not supported** – the extension injects nothing into host pages. |

## What we can and cannot customise

- **Side panel width:** Chrome does **not** expose an API to set or change the
  side panel's width – only the user can drag it. So "make the panel wider by
  default" is not possible while staying a side panel. (We *can* control the
  content's scale: the interface text-size setting, the equation-size slider
  and the auto-fit shrink are all ours.)
- **Action popup size:** set via CSS on the popup's `<body>`, but Chrome caps it
  at roughly **800×600 px** and the popup **closes whenever it loses focus** –
  which is exactly why this project chose the side panel.
- **Window/tab size:** fully under our control. `chrome.windows.create` takes
  `width`/`height`/`left`/`top`; the user can then resize freely and the window
  persists. A tab uses the whole viewport.
- **Default presentation:** the toolbar action currently opens the side panel
  (`openPanelOnActionClick`). We could instead open a window or tab by default,
  or remember the user's last choice.
- **Reusing one UI:** the same page (`src/sidepanel/index.html`) works in all of
  the side panel, window and tab with no changes – it only uses
  permission-free extension-page APIs (`chrome.storage`, `runtime.getURL`,
  `tabs`/`windows` create, `commands.getAll`), which are available in every
  extension page.

## What we've implemented

Because the side panel can't be widened programmatically, the practical way to
give users "more space / their preferred form" is to let them **pop the editor
out**. The Settings panel has an **"Open the editor in"** control with:

- **This panel** – the resting value the control returns to after each use;
  choosing it does nothing, since the editor is already here.
- **New window** – opens the editor in a floating, resizable popup window with a
  sensible default size (820×960), which the user can then resize.
- **New tab** – opens the editor full-width in a browser tab.

When a new window or tab opens successfully, the docked side panel closes
itself so the editor is never open twice. None of these need extra
permissions (an extension may open its own pages).

## Possible future enhancements

1. **Remember a preferred default surface** (side panel / window / tab) as a
   setting, and have the toolbar action honour it.
2. **Persist the window's last size/position** so "New window" reopens exactly
   as the user left it.
3. **A "pop out" affordance in the panel header** (not just in Settings) for
   one-click switching.
4. A **keyboard command** (`commands` API) to open the editor in the preferred
   surface from anywhere.

All of these layer straightforwardly on top of `presentation.ts`.
