/**
 * Where the pop-out window goes. Shared by the panel (More ▾ › Open in a new
 * window) and the service worker (toolbar icon and shortcut), which are
 * bundled separately.
 *
 * The last size and position are kept in `chrome.storage.local` – they belong
 * to this machine's screens, so they must not sync to another computer. A
 * stored position is only ever reused after being pulled back onto the screen
 * and above a minimum size, because the monitor it was saved on may have been
 * unplugged or rearranged since.
 */
import { hasChromeStorage } from './settings-storage';

const POPOUT_BOUNDS_KEY = 'popoutBounds';

/** Size of the pop-out window until the user has resized it. */
const POPOUT_DEFAULT = { width: 820, height: 960 } as const;

/** Smallest the pop-out window is reopened at, so it is never unusably small. */
const POPOUT_MIN = { width: 400, height: 480 } as const;

/** A rectangle in screen coordinates. */
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The window's bounds, with the usable screen area they were saved against. */
interface StoredPopoutBounds extends Rect {
  /**
   * The screen area at the time of saving. The service worker has no screen
   * of its own to clamp against, so it uses this one.
   */
  area: Rect;
}

/** What `chrome.windows.create` needs to size and place the pop-out. */
export interface PopoutPlacement {
  width: number;
  height: number;
  left?: number;
  top?: number;
}

const isRect = (value: unknown): value is Rect => {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return ['left', 'top', 'width', 'height'].every((k) => Number.isFinite(r[k]));
};

/** Read a stored record back, discarding anything that is not well formed. */
export function parseStoredBounds(value: unknown): StoredPopoutBounds | undefined {
  if (!isRect(value)) return undefined;
  const area = (value as { area?: unknown }).area;
  if (!isRect(area) || area.width <= 0 || area.height <= 0) return undefined;
  const { left, top, width, height } = value;
  return { left, top, width, height, area: { ...area } };
}

/**
 * Fit `bounds` into `area`: at least the minimum size (never larger than the
 * area), and moved so the whole window is on screen.
 */
export function clampToArea(bounds: Rect, area: Rect): Rect {
  const width = Math.round(Math.min(Math.max(bounds.width, POPOUT_MIN.width), area.width));
  const height = Math.round(Math.min(Math.max(bounds.height, POPOUT_MIN.height), area.height));
  const left = Math.round(Math.min(Math.max(bounds.left, area.left), area.left + area.width - width));
  const top = Math.round(Math.min(Math.max(bounds.top, area.top), area.top + area.height - height));
  return { left, top, width, height };
}

/** The screen area available to this document, where it has a screen. */
function currentScreenArea(): Rect | undefined {
  if (typeof window === 'undefined' || !window.screen) return undefined;
  const { availWidth, availHeight } = window.screen;
  if (!(availWidth > 0) || !(availHeight > 0)) return undefined;
  // availLeft/availTop are non-standard but present in Chrome, and non-zero
  // when the window is on a secondary monitor.
  const extra = window.screen as Screen & { availLeft?: number; availTop?: number };
  return { left: extra.availLeft ?? 0, top: extra.availTop ?? 0, width: availWidth, height: availHeight };
}

/** Where to open the pop-out: the saved bounds, clamped, else the default. */
export function placementFor(
  stored: StoredPopoutBounds | undefined,
  screenArea: Rect | undefined,
): PopoutPlacement {
  if (!stored) return { ...POPOUT_DEFAULT };
  return clampToArea(stored, screenArea ?? stored.area);
}

/** Resolve where to open the pop-out right now. */
export async function popoutPlacement(): Promise<PopoutPlacement> {
  if (!hasChromeStorage('local')) return { ...POPOUT_DEFAULT };
  try {
    const record = await chrome.storage.local.get(POPOUT_BOUNDS_KEY);
    return placementFor(parseStoredBounds(record[POPOUT_BOUNDS_KEY]), currentScreenArea());
  } catch {
    return { ...POPOUT_DEFAULT };
  }
}

/** How long the window must stop moving before its bounds are stored. */
const SAVE_DELAY_MS = 500;

/**
 * Keep the bounds of the window this document lives in. Resizing or dragging
 * fires `onBoundsChanged` continuously, so the write waits until it stops.
 * Minimised and maximised windows report bounds that are not the user's
 * chosen ones and are ignored.
 */
export function rememberPopoutBounds(windowId: number): void {
  if (typeof chrome === 'undefined' || !chrome.windows?.onBoundsChanged || !hasChromeStorage('local')) {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  chrome.windows.onBoundsChanged.addListener((changed) => {
    if (changed.id !== windowId) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const area = currentScreenArea();
      const { left, top, width, height, state } = changed;
      if (!area || (state !== undefined && state !== 'normal')) return;
      if (left === undefined || top === undefined || width === undefined || height === undefined) return;
      chrome.storage.local
        .set({ [POPOUT_BOUNDS_KEY]: { left, top, width, height, area } })
        .catch((error: unknown) => console.error('Failed to save the window bounds:', error));
    }, SAVE_DELAY_MS);
  });
}
