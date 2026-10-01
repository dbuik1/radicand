import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampToArea, parseStoredBounds, placementFor, popoutPlacement } from './popout-bounds';

const AREA = { left: 0, top: 0, width: 1920, height: 1040 };
const SAVED = { left: 100, top: 80, width: 900, height: 700, area: AREA };

describe('pop-out window bounds', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens at the default size when nothing is saved', () => {
    expect(placementFor(undefined, AREA)).toEqual({ width: 820, height: 960 });
  });

  it('reopens at the saved size and place when they fit the screen', () => {
    expect(placementFor(SAVED, AREA)).toEqual({ left: 100, top: 80, width: 900, height: 700 });
  });

  it('pulls a window saved on a monitor that has gone back onto the screen', () => {
    const away = { ...SAVED, left: 3000, top: -400 };
    expect(placementFor(away, { left: 0, top: 0, width: 1366, height: 728 })).toEqual({
      left: 466,
      top: 0,
      width: 900,
      height: 700,
    });
  });

  it('never reopens smaller than the minimum or larger than the screen', () => {
    expect(clampToArea({ left: 5, top: 5, width: 50, height: 60 }, AREA)).toMatchObject({
      width: 400,
      height: 480,
    });
    expect(clampToArea({ left: 0, top: 0, width: 9000, height: 9000 }, AREA)).toEqual({
      left: 0,
      top: 0,
      width: 1920,
      height: 1040,
    });
  });

  it('uses the screen it was saved against when the caller has none', () => {
    expect(placementFor({ ...SAVED, left: 1800 }, undefined)).toMatchObject({ left: 1020 });
  });

  it('ignores a stored record that is not well formed', () => {
    expect(parseStoredBounds({ left: 1, top: 2, width: 3 })).toBeUndefined();
    expect(parseStoredBounds({ ...SAVED, area: { ...AREA, width: 0 } })).toBeUndefined();
    expect(parseStoredBounds('x')).toBeUndefined();
    expect(parseStoredBounds(SAVED)).toEqual(SAVED);
  });

  it('reads the saved bounds from chrome.storage.local', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn().mockResolvedValue({ popoutBounds: SAVED }) } },
    });
    expect(await popoutPlacement()).toEqual({ left: 100, top: 80, width: 900, height: 700 });
  });

  it('falls back to the default when storage fails or is absent', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: vi.fn().mockRejectedValue(new Error('x')) } } });
    expect(await popoutPlacement()).toEqual({ width: 820, height: 960 });
    vi.stubGlobal('chrome', undefined);
    expect(await popoutPlacement()).toEqual({ width: 820, height: 960 });
  });
});
