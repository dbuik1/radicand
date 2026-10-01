import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: never[]) => void;

/**
 * The service worker runs its set-up as it loads, so each test stubs
 * `chrome`, imports the worker afresh and then plays events at the listeners
 * it registered.
 */
describe('service worker: the toolbar icon opens the chosen surface', () => {
  let stored: Record<string, unknown>;
  let listeners: Record<string, Listener>;
  let setPanelBehavior: ReturnType<typeof vi.fn>;
  let sidePanelOpen: ReturnType<typeof vi.fn>;
  let windowsCreate: ReturnType<typeof vi.fn>;
  let tabsCreate: ReturnType<typeof vi.fn>;
  let getContexts: ReturnType<typeof vi.fn>;

  const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
  const registers = (name: string) => ({ addListener: (fn: Listener) => void (listeners[name] = fn) });

  beforeEach(() => {
    stored = {};
    listeners = {};
    setPanelBehavior = vi.fn().mockResolvedValue(undefined);
    sidePanelOpen = vi.fn().mockResolvedValue(undefined);
    windowsCreate = vi.fn().mockResolvedValue({});
    tabsCreate = vi.fn().mockResolvedValue({});
    getContexts = vi.fn().mockResolvedValue([]);
    vi.stubGlobal('chrome', {
      runtime: {
        getContexts: getContexts,
        ContextType: { TAB: 'TAB' },
        getURL: (p: string) => `chrome-extension://ext/${p}`,
        onInstalled: registers('installed'),
        onStartup: registers('startup'),
      },
      storage: {
        sync: { get: vi.fn(async () => stored), set: vi.fn().mockResolvedValue(undefined) },
        onChanged: registers('changed'),
      },
      sidePanel: { setPanelBehavior, open: sidePanelOpen },
      action: { onClicked: registers('clicked') },
      commands: { onCommand: registers('command') },
      windows: { create: windowsCreate, getLastFocused: vi.fn(), update: vi.fn().mockResolvedValue({}) },
      tabs: { create: tabsCreate, update: vi.fn().mockResolvedValue({}) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const load = async (surface?: string): Promise<void> => {
    if (surface) stored.settings = { defaultSurface: surface };
    await import('./background');
    await settled();
  };

  it('lets Chrome open the side panel on a click by default', async () => {
    await load();
    expect(setPanelBehavior).toHaveBeenLastCalledWith({ openPanelOnActionClick: true });
  });

  it.each(['window', 'tab'])('stops Chrome opening the panel when the choice is %s', async (surface) => {
    await load(surface);
    expect(setPanelBehavior).toHaveBeenLastCalledWith({ openPanelOnActionClick: false });
  });

  it('applies a change of choice straight away', async () => {
    await load();
    stored.settings = { defaultSurface: 'tab' };
    (listeners.changed as (c: object, a: string) => void)({ settings: {} }, 'sync');
    await settled();
    expect(setPanelBehavior).toHaveBeenLastCalledWith({ openPanelOnActionClick: false });
    // Unrelated storage changes leave it alone.
    setPanelBehavior.mockClear();
    (listeners.changed as (c: object, a: string) => void)({ library: {} }, 'local');
    await settled();
    expect(setPanelBehavior).not.toHaveBeenCalled();
  });

  it('applies the choice again when the browser or the extension starts', async () => {
    await load('window');
    setPanelBehavior.mockClear();
    (listeners.installed as () => void)();
    (listeners.startup as () => void)();
    await settled();
    expect(setPanelBehavior).toHaveBeenCalledTimes(2);
  });

  it('opens a pop-out window from a toolbar click when that is the choice', async () => {
    await load('window');
    (listeners.clicked as (tab: object) => void)({ windowId: 3 });
    await settled();
    expect(windowsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'popup', url: 'chrome-extension://ext/src/sidepanel/index.html' }),
    );
    expect(tabsCreate).not.toHaveBeenCalled();
  });

  it('opens a tab from a toolbar click when that is the choice', async () => {
    await load('tab');
    (listeners.clicked as (tab: object) => void)({ windowId: 3 });
    await settled();
    expect(tabsCreate).toHaveBeenCalledWith({ url: 'chrome-extension://ext/src/sidepanel/index.html' });
    expect(windowsCreate).not.toHaveBeenCalled();
  });

  it('opens the same surface from the symbols shortcut', async () => {
    await load('tab');
    (listeners.command as (c: string, tab: object) => void)('toggle-symbols', { windowId: 3 });
    await settled();
    expect(tabsCreate).toHaveBeenCalledTimes(1);
    expect(sidePanelOpen).not.toHaveBeenCalled();
  });

  it('opens the side panel from the symbols shortcut by default', async () => {
    await load();
    (listeners.command as (c: string, tab: object) => void)('toggle-symbols', { windowId: 3 });
    await settled();
    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 3 });
  });

  it('opens the side panel from the shortcut without waiting for storage', async () => {
    await load();
    (listeners.command as (c: string, tab: object) => void)('toggle-symbols', { windowId: 3 });
    // Chrome only honours sidePanel.open inside the gesture, so it must be
    // called before any storage read settles.
    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 3 });
  });

  it('focuses an editor tab already open instead of opening another', async () => {
    await load('tab');
    getContexts.mockResolvedValue([{ tabId: 7, windowId: 2 }]);
    (listeners.command as (c: string, tab: object) => void)('toggle-symbols', { windowId: 3 });
    await settled();
    expect(tabsCreate).not.toHaveBeenCalled();
    expect(sidePanelOpen).not.toHaveBeenCalled();
  });
});
