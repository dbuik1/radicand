/**
 * Auto-fit: shrink (never enlarge) the rendered equation so very wide content
 * (e.g. a large matrix) fits within the field's available width, governed by
 * the `autoFit` setting. Applies a `--equation-fit` factor on the field
 * itself, multiplied into the font-size alongside the user's chosen
 * `--equation-scale` (see `.math-field` in styles.css); removed whenever the
 * setting is off or the content already fits at the current scale.
 *
 * The needed factor is always computed from the equation's UNSHRUNK natural
 * width – `scrollWidth` at the currently-applied factor, divided back out by
 * that same factor – so the shrink just applied never feeds back into the
 * next computation (which would otherwise compound indefinitely).
 */
import type { EditorController } from './index';
import { announce } from '../a11y';
import { getSettings, onSettingsChange } from '../settings';

/** The smallest factor applied; below it the equation is unreadable. */
export const MIN_FIT = 0.4;

/**
 * How long the fit must hold before it is announced. A slider drag or a
 * burst of typing changes the factor many times a second; one message
 * describing where it settled is enough.
 */
export const FIT_ANNOUNCE_DELAY_MS = 400;

export function installAutoFit(editor: EditorController): void {
  const field = editor.element;
  let currentFit = 1;

  // The shrink is silent on screen – the maths just gets smaller – so it is
  // announced once when it engages, with the size it settled at, and once
  // when the equation returns to its chosen size. Further changes to the
  // factor while it stays engaged are not announced.
  let announcedShrunk = false;
  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleAnnouncement = (): void => {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      const shrunk = currentFit < 1;
      if (shrunk === announcedShrunk) return;
      announcedShrunk = shrunk;
      announce(
        shrunk
          ? `Equation shrunk to ${Math.round(currentFit * 100)} % to fit the panel. Turn off automatic shrinking in Settings.`
          : 'Equation back at its chosen size.',
      );
    }, FIT_ANNOUNCE_DELAY_MS);
  };

  /**
   * The box the equation actually overflows. MathLive lays the rendered
   * maths out inside its shadow root and clips it there, so the host
   * element always reports scrollWidth === clientWidth however wide the
   * content is – measuring the host alone never sees an overflow, and this
   * whole routine would sit inert while equations were cut off. Falls back
   * to the host if MathLive ever renames the class.
   */
  const measured = (): HTMLElement =>
    field.shadowRoot?.querySelector<HTMLElement>('.ML__content') ?? field;

  const clearFit = (): void => {
    if (currentFit === 1) return;
    currentFit = 1;
    field.style.removeProperty('--equation-fit');
    scheduleAnnouncement();
  };

  const recompute = (): void => {
    if (!getSettings().autoFit) {
      clearFit();
      return;
    }
    const box = measured();
    const available = box.clientWidth;
    if (available <= 0) return; // not laid out yet
    const naturalWidth = box.scrollWidth / currentFit;
    if (naturalWidth <= available) {
      clearFit(); // fits already – never enlarge beyond the chosen scale
      return;
    }
    const needed = Math.max(MIN_FIT, available / naturalWidth);
    if (Math.abs(needed - currentFit) < 0.01) return; // avoid churn
    currentFit = needed;
    field.style.setProperty('--equation-fit', String(currentFit));
    scheduleAnnouncement();
  };

  // Content changes (typing, palette inserts, undo/redo, …) – deferred a
  // frame so layout has settled before scrollWidth is measured.
  editor.onChange(() => requestAnimationFrame(recompute));
  // Panel/field resized (side-panel width drag, detached window resize).
  const observer = new ResizeObserver(() => recompute());
  observer.observe(field);
  // The equation-size slider (or the setting toggled elsewhere) changes
  // --equation-scale, which changes the natural width at any given fit.
  onSettingsChange(() => recompute());
  recompute();
}
