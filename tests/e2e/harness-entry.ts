/**
 * E2E harness entry: mounts the real editor – the same createEditor the side
 * panel uses – and exposes handles for the Playwright specs.
 */
import { createEditor } from '../../src/sidepanel/editor';
import { getSettings, updateSettings } from '../../src/sidepanel/settings';
import * as library from '../../src/sidepanel/library';
import * as shortcuts from '../../src/sidepanel/shortcuts';
import { editorTriggers } from '../../src/sidepanel/triggers';
import { addRecent } from '../../src/sidepanel/recent';

const host = document.getElementById('host');
if (!host) throw new Error('missing #host');
// Bound the same way the side panel binds them (main.ts), so the specs
// exercise library triggers, custom shortcuts and the finder's recent list
// against the field.
const editor = createEditor(host, {
  triggers: editorTriggers,
  onFinderInsert: addRecent,
});

declare global {
  interface Window {
    __editor: typeof editor;
    __mf: typeof editor.element;
    __getSettings: typeof getSettings;
    __updateSettings: typeof updateSettings;
    /** The in-memory library store (no chrome.storage in the harness). */
    __library: typeof library;
    /** The in-memory custom shortcuts store. */
    __shortcuts: typeof shortcuts;
    __ready: boolean;
  }
}
window.__editor = editor;
window.__mf = editor.element;
window.__getSettings = getSettings;
window.__updateSettings = updateSettings;
window.__library = library;
window.__shortcuts = shortcuts;
window.__ready = true;
