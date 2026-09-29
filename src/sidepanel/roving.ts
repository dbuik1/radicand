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

export function wireRovingTabindex(
  toolbar: HTMLElement,
  buttons: HTMLButtonElement[],
  options: RovingOptions = {},
): void {
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

  buttons.forEach((btn, index) => {
    btn.addEventListener('focus', () => {
      if (index === activeIndex) return;
      const current = buttons[activeIndex];
      if (current) current.tabIndex = -1;
      btn.tabIndex = 0;
      activeIndex = index;
    });
  });
}
