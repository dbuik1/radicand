// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installAutoFit, FIT_ANNOUNCE_DELAY_MS, MIN_FIT } from './auto-fit';
import { announce } from '../a11y';
import { updateSettings } from '../settings';
import type { EditorController } from './index';

vi.mock('../a11y', () => ({ announce: vi.fn() }));

/**
 * happy-dom lays nothing out, so the measured box reports the widths the
 * test sets; `scrollWidth` follows the applied fit the way a real layout
 * would (the content shrinks with the font size). The extension smoke lane
 * covers the real-layout path; these cover the branch logic.
 */
function mountField(available: number, natural: number) {
  const field = document.createElement('div');
  const content = document.createElement('div');
  content.className = 'ML__content';
  field.attachShadow({ mode: 'open' }).appendChild(content);
  document.body.appendChild(field);
  const state = { available, natural };
  const fit = (): number => Number(field.style.getPropertyValue('--equation-fit') || 1);
  Object.defineProperty(content, 'clientWidth', { get: () => state.available });
  Object.defineProperty(content, 'scrollWidth', { get: () => state.natural * fit() });
  const changeListeners: (() => void)[] = [];
  const editor = {
    element: field,
    onChange: (listener: () => void) => {
      changeListeners.push(listener);
      return () => {};
    },
  } as unknown as EditorController;
  return { field, state, fit, editor, change: () => changeListeners.forEach((l) => l()) };
}

describe('auto-fit', () => {
  let resize: () => void = () => {};

  beforeEach(async () => {
    document.body.innerHTML = '';
    await updateSettings({ autoFit: true });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(announce).mockClear();
  });

  it('shrinks a too-wide equation to the available width', () => {
    const { editor, fit } = mountField(200, 400);
    installAutoFit(editor);
    expect(fit()).toBe(0.5);
  });

  it('never enlarges an equation that already fits', () => {
    const { editor, field } = mountField(400, 200);
    installAutoFit(editor);
    expect(field.style.getPropertyValue('--equation-fit')).toBe('');
  });

  it('measures the unshrunk width, so a fit never compounds on itself', () => {
    const { editor, fit } = mountField(200, 400);
    installAutoFit(editor);
    resize();
    resize();
    expect(fit()).toBe(0.5);
  });

  it('follows the content: releases the fit once the equation fits again', () => {
    const { editor, state, fit, change, field } = mountField(200, 400);
    installAutoFit(editor);
    expect(fit()).toBe(0.5);
    state.natural = 100;
    change();
    return vi.waitFor(() => expect(field.style.getPropertyValue('--equation-fit')).toBe(''));
  });

  it('clears the fit when the setting is turned off, and reapplies when on', async () => {
    const { editor, field, fit } = mountField(200, 400);
    installAutoFit(editor);
    await updateSettings({ autoFit: false });
    expect(field.style.getPropertyValue('--equation-fit')).toBe('');
    await updateSettings({ autoFit: true });
    expect(fit()).toBe(0.5);
  });

  it('never shrinks below the readable floor', () => {
    const { editor, fit } = mountField(100, 10000);
    installAutoFit(editor);
    expect(fit()).toBe(MIN_FIT);
  });

  it('waits for layout: does nothing while the box has no width', () => {
    const { editor, field } = mountField(0, 400);
    installAutoFit(editor);
    expect(field.style.getPropertyValue('--equation-fit')).toBe('');
  });

  describe('announcements', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('says once, with the settled size, that the equation was shrunk to fit', () => {
      const { editor, state } = mountField(300, 600);
      installAutoFit(editor);
      state.natural = 500; // still changing while the message is pending
      resize();
      vi.advanceTimersByTime(FIT_ANNOUNCE_DELAY_MS);
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(
        'Equation shrunk to 60 % to fit the panel. Turn off automatic shrinking in Settings.',
      );
      state.natural = 1000; // shrinks further, but stays engaged: no repeat
      resize();
      vi.advanceTimersByTime(FIT_ANNOUNCE_DELAY_MS);
      expect(announce).toHaveBeenCalledTimes(1);
    });

    it('says once that the equation is back at its chosen size', () => {
      const { editor, state } = mountField(200, 400);
      installAutoFit(editor);
      vi.advanceTimersByTime(FIT_ANNOUNCE_DELAY_MS);
      state.natural = 100;
      resize();
      vi.advanceTimersByTime(FIT_ANNOUNCE_DELAY_MS);
      expect(announce).toHaveBeenCalledTimes(2);
      expect(announce).toHaveBeenLastCalledWith('Equation back at its chosen size.');
    });

    it('stays quiet when the equation always fits', () => {
      const { editor } = mountField(400, 200);
      installAutoFit(editor);
      resize();
      vi.advanceTimersByTime(FIT_ANNOUNCE_DELAY_MS);
      expect(announce).not.toHaveBeenCalled();
    });

    it('does not announce a shrink that is released before the message is due', () => {
      const { editor, state } = mountField(200, 400);
      installAutoFit(editor);
      state.natural = 100;
      resize();
      vi.advanceTimersByTime(FIT_ANNOUNCE_DELAY_MS);
      expect(announce).not.toHaveBeenCalled();
    });
  });
});
