import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Presentation (open editor in window/tab), including the side-panel
 * self-close behaviour: after successfully opening the editor elsewhere, the
 * docked side panel should close itself – but a detached window/tab that
 * itself opens another surface must not.
 */
describe('presentation: open in window/tab', () => {
  let closeSpy: ReturnType<typeof vi.fn>;

  /**
   * Let every promise the stubbed chrome APIs can settle run to the end of
   * its chain: the whole path to `window.close()` is microtasks, and all of
   * them drain before the next macrotask turn.
   */
  const drained = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    closeSpy = vi.fn();
    vi.stubGlobal('window', { close: closeSpy } as unknown as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function stubChrome(overrides: {
    tabs?: Partial<typeof chrome.tabs>;
    windows?: Partial<typeof chrome.windows>;
  }): void {
    vi.stubGlobal('chrome', {
      runtime: { getURL: (p: string) => `chrome-extension://ext/${p}` },
      tabs: overrides.tabs,
      windows: overrides.windows,
    } as unknown as typeof chrome);
  }

  it('closes the docked side panel after opening a new tab', async () => {
    stubChrome({
      tabs: {
        create: vi.fn().mockResolvedValue({}),
        getCurrent: vi.fn().mockResolvedValue(undefined),
      } as unknown as typeof chrome.tabs,
      windows: {
        getCurrent: vi.fn().mockResolvedValue({ type: 'normal' }),
      } as unknown as typeof chrome.windows,
    });
    const { openInTab } = await import('./presentation');
    openInTab();
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });

  it('closes the docked side panel after opening a new window', async () => {
    stubChrome({
      windows: {
        create: vi.fn().mockResolvedValue({}),
        getCurrent: vi.fn().mockResolvedValue({ type: 'normal' }),
      } as unknown as typeof chrome.windows,
      tabs: {
        getCurrent: vi.fn().mockResolvedValue(undefined),
      } as unknown as typeof chrome.tabs,
    });
    const { openInWindow } = await import('./presentation');
    openInWindow();
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });

  it('does not self-close when already running inside an ordinary tab', async () => {
    stubChrome({
      tabs: {
        create: vi.fn().mockResolvedValue({}),
        getCurrent: vi.fn().mockResolvedValue({ id: 1 } as chrome.tabs.Tab),
      } as unknown as typeof chrome.tabs,
      windows: {
        getCurrent: vi.fn().mockResolvedValue({ type: 'normal' }),
      } as unknown as typeof chrome.windows,
    });
    const { openInTab } = await import('./presentation');
    openInTab();
    await drained();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('does not self-close a detached popup window that opens another tab', async () => {
    stubChrome({
      tabs: {
        create: vi.fn().mockResolvedValue({}),
        getCurrent: vi.fn().mockResolvedValue(undefined),
      } as unknown as typeof chrome.tabs,
      windows: {
        getCurrent: vi.fn().mockResolvedValue({ type: 'popup' }),
      } as unknown as typeof chrome.windows,
    });
    const { openInTab } = await import('./presentation');
    openInTab();
    await drained();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('does nothing when chrome is unavailable (test harness / plain tab)', async () => {
    vi.stubGlobal('chrome', undefined);
    const { openInTab, openInWindow } = await import('./presentation');
    expect(() => openInTab()).not.toThrow();
    expect(() => openInWindow()).not.toThrow();
    expect(closeSpy).not.toHaveBeenCalled();
  });
});
