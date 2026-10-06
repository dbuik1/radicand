/**
 * ARIA toolbar roving-tabindex pattern, shared by the palette grids and the
 * Library list: Left/Right move through the reading order (wrapping),
 * Up/Down move by a laid-out row when the container reports its column
 * count, Home/End jump to the ends, and only the active button is in the
 * tab sequence. Escape returns focus to the equation field.
 */

/** Options for {@link wireRovingTabindex}. */
export interface RovingOptions {
  /**
   * Number of columns currently laid out, for ArrowUp/ArrowDown. Computed
   * per keypress (the grid reflows with the panel width). Omitted = 1D.
   */
  columns?: () => number;
  /** Invoked on Escape (returns focus to the equation field). */
  onEscape?: () => void;
}

/** Handle returned by {@link wireRovingTabindex}. */
export interface RovingHandle {
  /**
   * Re-derive the tab stop after `buttons` was changed in place: the first
   * button becomes the only one in the tab sequence.
   */
  reset: () => void;
}

/**
 * `buttons` is read live, so a caller may refill the same array in place
 * (a filtered list) and call `reset` instead of wiring a second time.
 */
export function wireRovingTabindex(
  toolbar: HTMLElement,
  buttons: HTMLButtonElement[],
  options: RovingOptions = {},
): RovingHandle {
  let activeIndex = 0;

  const focusAt = (index: number, wrap: boolean): void => {
    let next: number;
    if (wrap) {
      next = (index + buttons.length) % buttons.length;
    } else {
      // 2D moves clamp at the grid's edges rather than wrapping to an
      // unrelated position.
      if (index < 0 || index >= buttons.length) return;
      next = index;
    }
    const current = buttons[activeIndex];
    const target = buttons[next];
    if (current) current.tabIndex = -1;
    if (target) {
      target.tabIndex = 0;
      target.focus();
    }
    activeIndex = next;
  };

  toolbar.addEventListener('keydown', (event: KeyboardEvent) => {
    const columns = options.columns?.() ?? 1;
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        focusAt(activeIndex + 1, true);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusAt(activeIndex - 1, true);
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusAt(activeIndex + columns, false);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(activeIndex - columns, false);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0, true);
        break;
      case 'End':
        event.preventDefault();
        focusAt(buttons.length - 1, true);
        break;
      case 'Escape':
        if (options.onEscape) {
          event.preventDefault();
          options.onEscape();
        }
        break;
      default:
        break;
    }
  });

  // One delegated listener, so the button set can change without rewiring.
  toolbar.addEventListener('focusin', (event) => {
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index === -1 || index === activeIndex) return;
    const current = buttons[activeIndex];
    if (current) current.tabIndex = -1;
    const btn = buttons[index];
    if (btn) btn.tabIndex = 0;
    activeIndex = index;
  });

  return {
    reset: () => {
      activeIndex = 0;
      buttons.forEach((btn, index) => {
        btn.tabIndex = index === 0 ? 0 : -1;
      });
    },
  };
}
