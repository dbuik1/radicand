/**
 * Side-panel entry point.
 *
 * Loads settings and mounts every part of the panel in three zones: the
 * equation header (label, Style ▾, More ▾) and field at the top, with the
 * actions bar (Copy, Speak, Save to library) directly under the field; then
 * the scrolling workspace (one mode at a time – Symbols by default – then
 * the collapsed Equation source disclosure).
 */
import { announce } from './a11y';
import { createActionsBar } from './actions-bar';
import { createEditor } from './editor';
import { installAutoFit } from './editor/auto-fit';
import { createEditorHeader } from './editor-header';
import { installSettingsShortcut } from './more-menu';
import { installCopyShortcut } from './output';
import { bindPart, installPartAnnouncements } from './part-visibility';
import { createSourceView } from './source';
import { installSlashFractionHint } from './slash-hint';
import { installStaticMathStyles } from './static-maths';
import { getCachedAppearance, getSettings, loadSettings, onSettingsChange, updateSettings } from './settings';
import { applyAppearance } from './appearance';
import { warmUpSpeech } from './speech';
import { loadLibrary } from './library';
import { loadShortcuts } from './shortcuts';
import { editorTriggers } from './triggers';
import { addRecent } from './recent';
import { installLibrarySaveShortcut } from './library-capture';
import { focusSymbolSearch, installSymbolSearchShortcut } from './symbol-search';
import { createWorkspace } from './workspace';
import type { Workspace } from './workspace';

/**
 * Run `fn` once the browser is idle (or after `timeout` ms, whichever comes
 * first). Used to push non-urgent background work (speech warm-up) well clear
 * of first paint and the user's first keystrokes, without ever skipping it.
 */
function whenIdle(fn: () => void, timeout = 2000): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout });
  } else {
    setTimeout(fn, timeout);
  }
}

async function boot(): Promise<void> {
  const mount = document.getElementById('editor-mount');
  if (!mount) {
    console.error('Editor mount point not found.');
    return;
  }

  // Paint with the last-known appearance (theme/font/equation scale)
  // synchronously, before the async chrome.storage.sync read below resolves –
  // this avoids both a flash of the wrong theme AND (the main point) blocking
  // first paint of the equation field on a storage round trip.
  applyAppearance(getCachedAppearance());
  // Re-apply on any settings change – another context, or the real persisted
  // settings arriving shortly after this first paint.
  onSettingsChange((next) => applyAppearance(next));
  // Kick off the real load in the background; do NOT await it here. Every view
  // below reads getSettings() synchronously (in-memory defaults until this
  // resolves) and subscribes via onSettingsChange, so they pick up the
  // persisted values the moment the round trip completes.
  void loadSettings();
  // Same shape for the expression library: My library and the search read
  // the in-memory entries synchronously and follow onLibraryChange.
  void loadLibrary();
  void loadShortcuts();

  mount.replaceChildren();

  // Zone A: the "Equation" section heading, created first so the field can
  // be labelled by it (it doubles as the field's accessible name), sharing
  // its row with the Style ▾ and More ▾ menus. The row exists for the heading
  // anyway, so the menus cost no vertical space and never push the field down.
  const header = createEditorHeader();

  const fieldWrap = document.createElement('div');
  fieldWrap.className = 'editor-field';

  // Mount the field area into the (connected) panel BEFORE creating the
  // mathfield: some MathLive APIs (e.g. inlineShortcuts) throw if the element
  // is not yet mounted in the document.
  mount.append(header.root, fieldWrap);
  // The field knows nothing of the library or the recent list; both are
  // bound here so the editor mounts on its own elsewhere (the e2e harness).
  const editor = createEditor(fieldWrap, {
    triggers: editorTriggers,
    onFinderInsert: addRecent,
  });
  editor.element.setAttribute('aria-labelledby', header.label.id);
  editor.element.id = 'equation-editor';
  installAutoFit(editor); // shrink-to-fit (never enlarge) large equations
  installStaticMathStyles(); // lays out the rendered previews outside the field

  // The menus are built after the field so they can read its selection,
  // but sit before it in the DOM: the Tab walk is Style ▾, More ▾, the
  // field, the actions toolbar, then the workspace. More ▾ opens workspace
  // modes, so it looks the workspace up at activation time.
  let workspace: Workspace | undefined;
  // Ctrl+/ (Cmd+/ on a Mac) and the More ▾ menu's Search symbols item both
  // go to the Symbols search box, from wherever focus happens to be –
  // closing an open mode first, since the box is in the Symbols mode and
  // only one mode shows at a time, and bringing the symbols and the box back
  // when either is switched off, since neither can take focus while it is
  // not on screen.
  const revealSymbolSearch = (): void => {
    workspace?.close('none');
    const { parts } = getSettings();
    if (!parts.symbols || !parts.symbolSearch) {
      void updateSettings({ parts: { ...parts, symbols: true, symbolSearch: true } });
    }
  };
  header.mountMenus(editor, () => workspace, {
    searchSymbols: () => focusSymbolSearch(revealSymbolSearch),
  });

  // Zone C: the scrolling workspace – one mode at a time, Symbols by
  // default (insertion is the most frequent action, so it earns adjacency
  // to the field) – then a hairline and the collapsed Equation source
  // disclosure. The field and the workspace are built synchronously, in
  // the first paint; the field is focused as soon as it is in place so the
  // user can start typing.
  const body = document.createElement('div');
  body.className = 'panel-body';
  mount.appendChild(body);
  workspace = createWorkspace(editor);
  body.appendChild(workspace.root);
  // The hairline belongs to the Equation source below it: with the source
  // switched off there is nothing under the line to separate.
  const divider = document.createElement('hr');
  divider.className = 'divider';
  bindPart('source', divider);
  body.appendChild(divider);

  // Zone B: the actions bar, directly under the field and outside the
  // scrolling workspace, so Copy, Speak and Save to library sit next to the
  // equation they act on and stay on screen whatever the workspace shows.
  mount.insertBefore(createActionsBar(editor, workspace.capture.button), body);

  // Whatever the user switches off in Settings is announced from here, once
  // per change however it arrived, and focus is rescued into the field if it
  // was inside the piece that went.
  installPartAnnouncements(() => editor.focus());

  // Panel-wide keyboard shortcut (Alt+C) to copy the equation from anywhere in
  // the panel, using the same routine as the Copy button.
  installCopyShortcut(editor);
  // And Alt+S to save the equation (or selection) to the library.
  installLibrarySaveShortcut(() => workspace?.capture.open());
  // And Alt+, to Settings, which is the route that stays open when the
  // More ▾ menu is one of the pieces switched off.
  installSettingsShortcut(() => workspace?.open('settings'));
  // And Ctrl+/ (Cmd+/ on a Mac) to the Symbols search box.
  installSymbolSearchShortcut(revealSymbolSearch);
  // First-use discoverability for the slash-fraction feature: its hint
  // offers the Settings control that turns the feature off.
  installSlashFractionHint(editor, fieldWrap, {
    openSettings: (from) => {
      workspace?.open('settings', from);
      const control = document.getElementById('set-slash-fraction');
      control?.scrollIntoView({ block: 'nearest' });
      control?.focus();
    },
  });

  editor.focus();
  announce('Radicand ready. Equation field focused.');

  // The source view sits below the workspace (collapsed unless the user's
  // persisted preference reopens it). Built a frame later so first paint
  // and focus are never gated behind its construction.
  requestAnimationFrame(() => {
    body.appendChild(createSourceView(editor)); // optional source/preview
  });

  // Warm SRE up when the browser is idle, well clear of first paint and the
  // user's first keystrokes. The built-in MathLive fallback covers the gap
  // until SRE is ready. Read settings freshly here
  // (rather than capturing them at boot) so, if this fires before the
  // chrome.storage read above resolves, it still fires again correctly: any
  // later change re-warms via configureSpeech in settings-view.ts.
  whenIdle(() => warmUpSpeech(getSettings()));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot(), { once: true });
} else {
  void boot();
}
