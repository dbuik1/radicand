/**
 * Appearance: reflects the theme, interface text size and equation size
 * settings onto the document root. The settings data lives in settings.ts;
 * this module only paints it, so boot can apply the cached appearance
 * before the settings form exists.
 */
import type { Settings } from '../types';

/**
 * Apply appearance settings (theme, font scale, equation scale) to the
 * document root. Safe to call repeatedly; used on boot and on every change.
 * `forced-colors` (Windows High Contrast) is honoured by CSS regardless of
 * the chosen theme.
 */
export function applyAppearance(settings: Settings): void {
  const root = document.documentElement;
  // 'system' clears the attribute so the stylesheet's
  // `:root:not([data-theme])` + `prefers-color-scheme` rules follow the OS
  // preference; an explicit theme pins the tokens (and colour scheme) in CSS.
  if (settings.theme === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = settings.theme;
  }
  root.style.setProperty('--font-size-scale', String(settings.fontScale));
  // Equation text size is independent of the UI font size.
  root.style.setProperty('--equation-scale', String(settings.equationScale));
}
