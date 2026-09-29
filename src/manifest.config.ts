import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

/**
 * Manifest V3 definition.
 *
 * Design notes:
 * - We use a side panel (not a popup) so the authoring/copy-out workflow
 *   survives loss of focus.
 * - Permissions are intentionally minimal: `sidePanel` to host the UI,
 *   `storage` for persisted settings and the expression library, and
 *   `clipboardWrite` so the Copy affordance can write rich clipboard
 *   payloads reliably. None of these adds a Chrome install warning. The
 *   extension never touches a host page: no `host_permissions`, no
 *   `tabs`, no `activeTab`, no `scripting`, no declared content scripts,
 *   and no network requests at runtime.
 */
export default defineManifest({
  manifest_version: 3,
  name: 'Radicand – Accessible Maths Editor',
  short_name: 'Radicand',
  version: pkg.version,
  description: pkg.description,
  minimum_chrome_version: '116',
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  action: {
    default_title: 'Radicand',
    default_icon: {
      16: 'src/assets/icons/icon-16.png',
      32: 'src/assets/icons/icon-32.png',
    },
  },
  icons: {
    16: 'src/assets/icons/icon-16.png',
    32: 'src/assets/icons/icon-32.png',
    48: 'src/assets/icons/icon-48.png',
    128: 'src/assets/icons/icon-128.png',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  // Keyboard shortcuts for editor control. The suggested keys are only defaults;
  // users can change or clear them at chrome://extensions/shortcuts.
  // - `_execute_action`: Reserved command that fires the toolbar action, which via
  //   setPanelBehavior({ openPanelOnActionClick: true }) natively toggles the side
  //   panel open/closed. No description field (Chrome supplies the action's title).
  // - 'toggle-symbols': Custom command handled in background.ts to open the panel
  //   and show or hide the symbols workspace.
  commands: {
    '_execute_action': {
      suggested_key: {
        default: 'Ctrl+Shift+U',
        mac: 'Command+Shift+U',
      },
    },
    'toggle-symbols': {
      suggested_key: {
        default: 'Ctrl+Shift+Y',
        mac: 'Command+Shift+Y',
      },
      description: 'Show or hide the symbols (opens the panel if closed)',
    },
  },
  permissions: ['sidePanel', 'storage', 'clipboardWrite'],
});
