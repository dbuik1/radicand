/**
 * Side-panel entry point.
 *
 * Loads settings and mounts every part of the panel, top to bottom: the
 * header (the Equation heading and Settings), the field, the actions bar
 * (the two Copy buttons and Read aloud), a skip link past the tabs, then the
 * scrolling body: the tabbed workspace, the collapsed source disclosure and
 * a link back to the field.
 */
import { announce } from './a11y';
import { createActionsBar } from './actions-bar';
import { createEditor } from './editor';
import { installDraft } from './draft';
import { installAutoFit } from './editor/auto-fit';
import { createEditorHeader, installSettingsShortcut } from './editor-header';
import { installCopyShortcut } from './output';
import { rememberWindowBoundsIfPopout } from './presentation';
import { bindPart, installPartAnnouncements } from './part-visibility';
import { createSourceView } from './source';
import { installSlashFractionHint } from './slash-hint';
import { installStaticMathStyles } from './static-maths';
import { getCachedAppearance, getSettings, loadSettings, onSettingsChange } from './settings';
import { applyAppearance } from './appearance';
import { warmUpSpeech } from './speech';
import { loadLibrary } from './library';
import { loadShortcuts } from './shortcuts';
import { editorTriggers } from './triggers';
import { addRecent } from './recent';
import { installLibrarySaveShortcut } from './library-capture';
import { createQuickSearch, installSymbolSearchShortcut } from './symbol-search';
import type { QuickSearch } from './symbol-search';
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
  // Same shape for the expression library: the Library tab and the search read
  // the in-memory entries synchronously and follow onLibraryChange.
  void loadLibrary();
  void loadShortcuts();
  void rememberWindowBoundsIfPopout();

  mount.replaceChildren();

  // The "Equation" heading is created first so the field can be labelled
  // by it (it doubles as the field's accessible name).
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

  let workspace: Workspace | undefined;
  // Ctrl+/ (Cmd+/ on a Mac) and Draw's Search instead both open the quick
  // search under the field.
  let quickSearch: QuickSearch | undefined;
  const openQuickSearch = (): void => quickSearch?.open();
  header.settings.addEventListener('click', () => workspace?.open('settings', header.settings));

  // The scrolling body: the tabbed workspace (Symbols first, since
  // insertion is the most frequent action), then a hairline and the
  // collapsed source disclosure. The field and the workspace are built
  // synchronously, in the first paint; the field is focused as soon as it
  // is in place so the user can start typing.
  const body = document.createElement('div');
  body.className = 'panel-body';
  mount.appendChild(body);
  workspace = createWorkspace(editor, { onSearch: openQuickSearch });
  body.appendChild(workspace.root);
  // The hairline belongs to the source disclosure below it: with the source
  // switched off there is nothing under the line to separate.
  const divider = document.createElement('hr');
  divider.className = 'divider';
  bindPart('source', divider);
  body.appendChild(divider);

  // "Back to equation" is the last stop in the panel, so a keyboard user
  // who has walked the tabs returns to the field in one press.
  const back = document.createElement('a');
  back.id = 'back-to-equation';
  back.className = 'skip-link skip-link--back';
  back.href = '#equation-editor';
  back.textContent = 'Back to equation';
  back.addEventListener('click', (event) => {
    event.preventDefault();
    editor.focus();
  });
  body.appendChild(back);

  // The actions bar sits directly under the field and outside the scrolling
  // body, so Copy and Read aloud stay beside the equation they act on.
  // "Skip symbols" follows it: the next stop would be the tabs, and a user
  // who only wants the source can pass them in one press.
  const skip = document.createElement('a');
  skip.id = 'skip-symbols';
  skip.className = 'skip-link';
  skip.href = '#source-input';
  skip.textContent = 'Skip symbols';
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    const summary = document.querySelector<HTMLElement>('details.source > summary');
    if (summary && summary.checkVisibility()) summary.focus();
    else back.focus();
  });
  mount.insertBefore(createActionsBar(editor), body);
  mount.insertBefore(skip, body);

  // Whatever the user switches off in Settings is announced from here, once
  // per change however it arrived, and focus is rescued into the field if it
  // was inside the piece that went.
  installPartAnnouncements(() => editor.focus());

  // Panel-wide keyboard shortcut (Alt+C) to copy the equation from anywhere in
  // the panel, using the same routine as the Copy button.
  installCopyShortcut(editor);
  // And Alt+S to save the equation (or selection) to the library.
  installLibrarySaveShortcut(() => workspace?.capture.open());
  // And Alt+, to Settings.
  installSettingsShortcut(() => workspace?.open('settings'));
  // And Ctrl+/ (Cmd+/ on a Mac) to the quick search, which sits under the
  // field beside the `\` finder.
  quickSearch = createQuickSearch(editor);
  fieldWrap.appendChild(quickSearch.root);
  installSymbolSearchShortcut(quickSearch);
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

  void installDraft(editor);

  editor.focus();
  announce('Radicand ready. Equation field focused.');

  // The source view sits below the workspace (collapsed unless the user's
  // persisted preference reopens it). Built a frame later so first paint
  // and focus are never gated behind its construction.
  requestAnimationFrame(() => {
    body.insertBefore(createSourceView(editor), back); // optional source/preview
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
