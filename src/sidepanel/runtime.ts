/**
 * Small runtime helpers shared across the side panel.
 */

/**
 * Resolve a path to a packaged extension resource as an absolute URL.
 *
 * Uses `chrome.runtime.getURL` in the extension so assets are loaded from the
 * extension origin (never the network). Falls back to the path as-is outside
 * the extension (dev server, unit tests).
 */
export function assetUrl(path: string): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}
