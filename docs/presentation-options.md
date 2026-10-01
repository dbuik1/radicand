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
- **Default presentation:** the toolbar action opens whichever surface the
  user chose in Settings (the side panel unless changed): see below.
- **Reusing one UI:** the same page (`src/sidepanel/index.html`) works in all of
  the side panel, window and tab with no changes – it only uses
  permission-free extension-page APIs (`chrome.storage`, `runtime.getURL`,
  `tabs`/`windows` create, `commands.getAll`), which are available in every
  extension page.

## What we've implemented

Because the side panel can't be widened programmatically, the practical way to
give users "more space / their preferred form" is to let them **pop the editor
out**. The More ▾ menu has **Open in a new window** and **Open in a new tab**:

- **Side panel** – the default, and where the editor already is when those two
  items are chosen.
- **New window** – opens the editor in a floating, resizable popup window. It
  starts at a default size (820×960); after that it reopens at the size and
  position the user last left it. The bounds are saved (debounced, from
  `chrome.windows.onBoundsChanged`) in `chrome.storage.local`, so they stay on
  this computer, and are clamped on reopening so the window is on screen and
  at least 400×480. See `src/popout-bounds.ts`.
- **New tab** – opens the editor full-width in a browser tab.

When a new window or tab opens successfully, the docked side panel closes
itself so the editor is never open twice. None of these need extra
permissions (an extension may open its own pages).

## The toolbar icon and its shortcut

Settings › Interface has a **Toolbar icon opens** select (*Side panel*, *New
window*, *New tab*), stored as `defaultSurface` in the ordinary settings record
(`chrome.storage.sync`, falling back to local). The service worker
(`src/background.ts`) applies it at start-up, on install and whenever the
record changes:

- *Side panel* – `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick:
  true })`, so Chrome opens the panel itself and the click never reaches the
  worker.
- *New window* or *New tab* – `openPanelOnActionClick: false`, so the click
  reaches `chrome.action.onClicked`, which opens the pop-out window (at its
  remembered bounds) or a tab.

The `_execute_action` command (Ctrl+Shift+U, Cmd+Shift+U on a Mac) is turned
into a toolbar click by Chrome, so the shortcut opens the same surface. The
symbols command (Ctrl+Shift+Y) opens it too, then shows or hides the symbols.
Both can be rebound at `chrome://extensions/shortcuts`. `chrome.sidePanel.open`
is only allowed in response to a user gesture; a keyboard command is one.

## Possible future enhancements

1. **A "pop out" affordance in the panel header** (not just in the More ▾
   menu) for one-click switching.

All of these layer straightforwardly on top of `presentation.ts`.
