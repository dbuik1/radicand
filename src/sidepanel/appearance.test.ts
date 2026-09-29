// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { applyAppearance } from './appearance';
import { DEFAULT_SETTINGS } from './settings';

describe('applyAppearance', () => {
  it('reflects theme and font scale onto the document root', () => {
    applyAppearance({ ...DEFAULT_SETTINGS, theme: 'dark', fontScale: 1.25 });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--font-size-scale')).toBe('1.25');
  });

  it('clears the theme attribute for the system theme, so CSS follows the OS', () => {
    applyAppearance({ ...DEFAULT_SETTINGS, theme: 'dark' });
    applyAppearance({ ...DEFAULT_SETTINGS, theme: 'system' });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('sets the equation scale independently of the interface text size', () => {
    applyAppearance({ ...DEFAULT_SETTINGS, fontScale: 1, equationScale: 1.5 });
    expect(document.documentElement.style.getPropertyValue('--equation-scale')).toBe('1.5');
    expect(document.documentElement.style.getPropertyValue('--font-size-scale')).toBe('1');
  });
});
