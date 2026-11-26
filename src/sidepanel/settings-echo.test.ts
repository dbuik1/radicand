import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * A stored value that arrives while a local change is still waiting to be
 * written must not undo that change: the next write would then carry the
 * older value back to storage and the change would be lost.
 */
type Changed = (changes: Record<string, { newValue: unknown }>, area: string) => void;

describe('settings: a stored value arriving during a pending local change', () => {
  let changed: Changed;
  let set: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    set = vi.fn(() => Promise.resolve());
    const area = { get: vi.fn(() => Promise.resolve({})), set, remove: vi.fn(() => Promise.resolve()) };
    vi.stubGlobal('chrome', {
      storage: {
        sync: area,
        local: area,
        onChanged: {
          addListener: (listener: Changed) => {
            changed = listener;
          },
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the local change and writes it', async () => {
    const settings = await import('./settings');
    await settings.loadSettings();

    await settings.updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(500);
    expect(set).toHaveBeenCalledTimes(1);

    // The next change is waiting on its debounce when the first write's
    // stored value comes back.
    await settings.updateSettings({ equationScale: 1.5 });
    changed({ settings: { newValue: { ...settings.DEFAULT_SETTINGS, theme: 'dark' } } }, 'sync');
    expect(settings.getSettings().equationScale).toBe(1.5);

    await vi.advanceTimersByTimeAsync(500);
    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls[1]![0].settings).toMatchObject({ theme: 'dark', equationScale: 1.5 });
  });

  it('takes a stored value from elsewhere once nothing local is waiting', async () => {
    const settings = await import('./settings');
    await settings.loadSettings();
    await settings.updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(500);

    changed({ settings: { newValue: { ...settings.DEFAULT_SETTINGS, theme: 'light' } } }, 'sync');
    expect(settings.getSettings().theme).toBe('light');
  });
});
