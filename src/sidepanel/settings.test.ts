import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from './settings';

describe('settings (no chrome.storage available)', () => {
  it('starts from sensible defaults', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.copyFormat).toBe('mathml');
    expect(DEFAULT_SETTINGS.displayFormat).toBe('latex');
  });

  it('merges partial updates and keeps the rest', async () => {
    const next = await updateSettings({ theme: 'dark' });
    expect(next.theme).toBe('dark');
    expect(next.copyFormat).toBe(DEFAULT_SETTINGS.copyFormat);
    expect(getSettings().theme).toBe('dark');
  });

  it('keeps display and copy formats independent', async () => {
    const next = await updateSettings({ displayFormat: 'mathml' });
    expect(next.displayFormat).toBe('mathml');
    expect(next.copyFormat).toBe(DEFAULT_SETTINGS.copyFormat);
  });

  it('migrates removed legacy formats to their nearest equivalent', async () => {
    // 'asciimath' and 'accessible' were once selectable and may survive in
    // synced storage from an earlier version. Each maps to its nearest current
    // equivalent – deliberately checked against values that differ from the
    // defaults, so a plain fallback would fail these assertions.
    const legacy = await updateSettings({
      displayFormat: 'accessible',
      copyFormat: 'asciimath',
    } as never);
    expect(legacy.displayFormat).toBe('mathml');
    expect(legacy.copyFormat).toBe('latex');
    // And a value that was never valid falls back to the default.
    const junk = await updateSettings({ copyFormat: 'nonsense' } as never);
    expect(junk.copyFormat).toBe(DEFAULT_SETTINGS.copyFormat);
  });

  it('drops the keys of retired settings when older storage still carries them', async () => {
    // `compact` and `settingsOpen` are keys of settings that no longer
    // exist; a stored object from before their removal must normalise to
    // the current shape without them, while its other values still come
    // through.
    const stored = await updateSettings({
      compact: true,
      settingsOpen: true,
      paletteCategory: 'Calculus',
    } as never);
    expect(stored).not.toHaveProperty('compact');
    expect(stored).not.toHaveProperty('settingsOpen');
    expect(getSettings()).not.toHaveProperty('compact');
    expect(stored.paletteCategory).toBe('Calculus');
    await updateSettings({ paletteCategory: DEFAULT_SETTINGS.paletteCategory });
  });

  it('rejects an invalid fontScale and falls back to the default', async () => {
    const next = await updateSettings({ fontScale: -3 });
    expect(next.fontScale).toBe(DEFAULT_SETTINGS.fontScale);
  });

  it('notifies subscribers on change in the fallback path', async () => {
    let seen: string | undefined;
    const { onSettingsChange } = await import('./settings');
    const off = onSettingsChange((s) => {
      seen = s.theme;
    });
    await updateSettings({ theme: 'high-contrast' });
    expect(seen).toBe('high-contrast');
    off();
  });

  it('toggles slashFraction and defaults it to true', async () => {
    expect(DEFAULT_SETTINGS.slashFraction).toBe(true);

    const disabled = await updateSettings({ slashFraction: false });
    expect(disabled.slashFraction).toBe(false);
    expect(getSettings().slashFraction).toBe(false);

    const enabled = await updateSettings({ slashFraction: true });
    expect(enabled.slashFraction).toBe(true);
  });

  it('defaults slashHintShown to false and persists it once set', async () => {
    expect(DEFAULT_SETTINGS.slashHintShown).toBe(false);

    const shown = await updateSettings({ slashHintShown: true });
    expect(shown.slashHintShown).toBe(true);
    expect(getSettings().slashHintShown).toBe(true);
  });

  it('defaults autoFit to true and can be toggled off', async () => {
    expect(DEFAULT_SETTINGS.autoFit).toBe(true);

    const disabled = await updateSettings({ autoFit: false });
    expect(disabled.autoFit).toBe(false);
    expect(getSettings().autoFit).toBe(false);

    const enabled = await updateSettings({ autoFit: true });
    expect(enabled.autoFit).toBe(true);
  });
});
