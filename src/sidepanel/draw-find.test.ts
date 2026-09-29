// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDrawToFind } from './draw-find';
import type { EditorController } from './editor';
import type { DrawCandidate, DrawRecognition } from './draw/templates';

/**
 * UI behaviour against an injected fake recogniser: disclosure semantics,
 * state transitions (drawing, confident, no-match, insert, undo/clear),
 * focus management and the dismissal/supersession races. Real stroke
 * recognition is covered by draw/recogniser.test.ts, and the full pointer
 * flow by the extension smoke lane (tests/ext/run.mjs), which draws a real
 * ∀ on the packaged origin.
 */
function stubEditor() {
  const insert = vi.fn();
  const focus = vi.fn();
  return { editor: { insert, focus } as unknown as EditorController, insert, focus };
}

const candidate = (latex: string, name: string, glyph: string, score: number): DrawCandidate => ({
  latex,
  name,
  glyph,
  score,
});

const recognition = (
  candidates: DrawCandidate[],
  { matches = candidates.length, confident = false } = {},
): DrawRecognition => ({ candidates, matches, confident });

type FakeModule = import('./draw/recognition-client').DrawRecogniser;

function fakeRecogniser(result: DrawRecognition) {
  const recognise = vi.fn().mockResolvedValue(result);
  const module: FakeModule = {
    recognise,
    warmUp: vi.fn(),
    notice: Promise.resolve('test attribution notice'),
  };
  return { module, recognise, load: () => Promise.resolve<FakeModule | null>(module) };
}

/** One drawn stroke: pointer down, a move, and up. */
function drawStroke(surface: HTMLElement, from = 10, to = 60): void {
  surface.dispatchEvent(new MouseEvent('pointerdown', { clientX: from, clientY: from, bubbles: true }));
  surface.dispatchEvent(new MouseEvent('pointermove', { clientX: to, clientY: to, bubbles: true }));
  surface.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
}

// Recognition runs a frame after pointerup; 40 ms outwaits the rAF fallback.
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 40));

function mount(load: () => Promise<FakeModule | null>) {
  const { editor, insert, focus } = stubEditor();
  const onSearchInstead = vi.fn();
  const draw = createDrawToFind(editor, { load, onSearchInstead });
  const { region, status } = draw;
  document.body.append(status, region);
  const surface = region.querySelector<HTMLElement>('.draw-find__surface')!;
  const listbox = region.querySelector<HTMLElement>('[role="listbox"]')!;
  // The workspace drives open/close; a stand-in toggle keeps the tests
  // reading like the user's path (open the mode, draw, close it).
  let opened = false;
  const toggle = {
    click: (): void => {
      opened = !opened;
      if (opened) draw.open();
      else draw.close();
    },
  };
  return { toggle, region, surface, status, listbox, insert, focus, onSearchInstead };
}

const FOR_ALL = candidate('\\forall', 'For all', '∀', 0.9);

describe('draw-to-find', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows candidates after a stroke, and clears them when closed', async () => {
    const { load } = fakeRecogniser(recognition([FOR_ALL], { confident: true }));
    const { toggle, surface, status, listbox } = mount(load);

    expect(listbox.hidden).toBe(true);
    toggle.click();

    drawStroke(surface);
    await tick();
    expect(listbox.hidden).toBe(false);

    toggle.click(); // closing the mode clears ink and candidates
    expect(listbox.hidden).toBe(true);
    expect(status.textContent).toBe('');
  });

  it('shows ranked candidates with one Tab stop and the best pre-selected', async () => {
    const { load } = fakeRecogniser(
      recognition(
        [
          FOR_ALL,
          candidate('\\Lambda', 'Greek capital letter lambda', 'Λ', 1.9),
          candidate('\\land', 'Logical and', '∧', 2.1),
        ],
        { confident: true },
      ),
    );
    const { toggle, surface, status, listbox } = mount(load);
    toggle.click();
    drawStroke(surface);
    await tick();

    const options = [...listbox.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options).toHaveLength(3);
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    expect(options.filter((option) => option.tabIndex === 0)).toHaveLength(1);
    expect(status.textContent).toBe('Best match: For all');
  });

  it('moves aria-selected with the roving focus', async () => {
    const { load } = fakeRecogniser(
      recognition([
        FOR_ALL,
        candidate('\\Lambda', 'Greek capital letter lambda', 'Λ', 1.9),
        candidate('\\land', 'Logical and', '∧', 2.1),
      ]),
    );
    const { toggle, surface, listbox } = mount(load);
    toggle.click();
    drawStroke(surface);
    await tick();

    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const options = [...listbox.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    expect(options[2]!.tabIndex).toBe(0);
    // The best-match highlight stays put – it marks rank, not focus.
    expect(options[0]!.classList.contains('draw-find__option--best')).toBe(true);
  });

  it('nudges towards more strokes while the match is weak, announcing the best', async () => {
    const { load } = fakeRecogniser(
      recognition(
        [FOR_ALL, candidate('\\Lambda', 'Greek capital letter lambda', 'Λ', 1.9)],
        { matches: 7, confident: false },
      ),
    );
    const { toggle, surface, status } = mount(load);
    toggle.click();
    drawStroke(surface);
    await tick();
    // The plausible-match count is independent of the five rows shown, and
    // the visually-hidden suffix announces the best match.
    expect(status.textContent).toBe('7 matches – keep drawing to refine, best match: For all');
    expect(status.querySelector('.visually-hidden')?.textContent).toBe(', best match: For all');
  });

  it('inserts on Enter, confirms in the status line, and resets the surface', async () => {
    const { load } = fakeRecogniser(recognition([FOR_ALL], { confident: true }));
    const { toggle, surface, status, listbox, insert } = mount(load);
    toggle.click();
    drawStroke(surface);
    await tick();

    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(insert).toHaveBeenCalledWith('\\forall', { focus: true });
    expect(status.textContent).toBe('Inserted For all (∀)');
    expect(listbox.hidden).toBe(true);
    const undoBtn = document.body.querySelector<HTMLButtonElement>('.draw-find__controls button')!;
    expect(undoBtn.disabled).toBe(true);
  });

  it('shows the no-match redirect, announces it, and hands over to the text search', async () => {
    const { load } = fakeRecogniser(recognition([]));
    const { toggle, surface, status, region, onSearchInstead } = mount(load);

    toggle.click();
    drawStroke(surface);
    await tick();

    expect(status.textContent).toBe('No close match. Try the text search.');
    expect(status.querySelector('.visually-hidden')?.textContent).toBe(' Try the text search.');
    const noMatch = region.querySelector<HTMLElement>('.draw-find__nomatch')!;
    expect(noMatch.hidden).toBe(false);
    region.querySelector<HTMLButtonElement>('.draw-find__search-instead')!.click();
    expect(onSearchInstead).toHaveBeenCalledTimes(1);
  });

  it('offers the text search before any ink, and names the shortcut on the surface', () => {
    // Regression: the only route to the search appeared after a pointer
    // stroke, so a keyboard user landed on a surface they could not draw
    // on and nothing in the mode said how to get out of it.
    const { load } = fakeRecogniser(recognition([]));
    const { surface, region } = mount(load);
    const searchInstead = region.querySelector<HTMLButtonElement>('.draw-find__search-instead')!;
    expect(searchInstead.hidden).toBe(false);
    expect(searchInstead.disabled).toBe(false);
    expect(searchInstead.closest('.draw-find__controls')).not.toBeNull();
    expect(searchInstead.textContent).toMatch(/^Search instead/);
    expect(searchInstead.title).toMatch(/Ctrl\+\/|Cmd\+\//);
    expect(surface.getAttribute('aria-label')).toBe('Drawing area');
    const description = document.getElementById(surface.getAttribute('aria-describedby')!)!;
    expect(description.textContent).toMatch(/Ctrl\+\/|Cmd\+\//);
  });

  it('Undo stroke steps back; Clear returns to the empty state', async () => {
    const { load, recognise } = fakeRecogniser(recognition([FOR_ALL], { confident: true }));
    const { toggle, surface, status, listbox } = mount(load);
    toggle.click();
    drawStroke(surface);
    await tick();
    const [undoBtn, clearBtn] = [
      ...document.body.querySelectorAll<HTMLButtonElement>('.draw-find__controls button'),
    ];
    expect(undoBtn!.disabled).toBe(false);

    undoBtn!.click(); // the only stroke: back to empty, no re-recognition
    expect(listbox.hidden).toBe(true);
    expect(status.textContent).toBe('');
    expect(undoBtn!.disabled).toBe(true);

    drawStroke(surface);
    drawStroke(surface, 20, 80);
    await tick();
    const callsBefore = recognise.mock.calls.length;
    undoBtn!.click(); // one stroke left: re-recognises
    await tick();
    expect(recognise.mock.calls.length).toBe(callsBefore + 1);

    clearBtn!.click();
    expect(status.textContent).toBe('Cleared');
    expect(clearBtn!.disabled).toBe(true);
  });

  it('parks focus on the surface when the focused control disables itself', async () => {
    // Regression: disabling the focused button dumped focus on <body>.
    const { load } = fakeRecogniser(recognition([FOR_ALL], { confident: true }));
    const { toggle, surface } = mount(load);
    toggle.click();
    drawStroke(surface);
    await tick();
    const [, clearBtn] = [
      ...document.body.querySelectorAll<HTMLButtonElement>('.draw-find__controls button'),
    ];
    clearBtn!.focus();
    clearBtn!.click();
    expect(clearBtn!.disabled).toBe(true);
    expect(document.activeElement).toBe(surface);
  });

  it('never drops focus to <body> when a re-rank rebuilds the list', async () => {
    // Regression: rebuilding the options destroyed the focused one,
    // stranding keyboard focus on <body>. Drawing moves focus to the
    // surface (pointer-down), so after the re-render focus must still be
    // somewhere inside the region – never on the document body.
    const { load } = fakeRecogniser(
      recognition([FOR_ALL, candidate('\\Lambda', 'Greek capital letter lambda', 'Λ', 1.9)]),
    );
    const { toggle, surface, region, listbox } = mount(load);
    toggle.click();
    drawStroke(surface);
    await tick();
    listbox.querySelector<HTMLElement>('[role="option"]')!.focus();

    drawStroke(surface, 20, 80); // another stroke re-ranks and re-renders
    await tick();
    expect(document.activeElement).not.toBe(document.body);
    expect(region.contains(document.activeElement)).toBe(true);
  });

  it('a recognition resolving after close cannot re-open the list', async () => {
    let release: (module: FakeModule | null) => void = () => {};
    const gate = new Promise<FakeModule | null>((resolve) => {
      release = resolve;
    });
    const { module } = fakeRecogniser(recognition([FOR_ALL], { confident: true }));
    const { toggle, surface, listbox } = mount(() => gate);

    toggle.click();
    drawStroke(surface);
    toggle.click(); // close while the recogniser is still loading
    release(module);
    await tick();

    expect(listbox.hidden).toBe(true);
  });

  it('a superseded recognition cannot overwrite a newer one', async () => {
    // Regression: only the strokes-empty early return used to save the
    // collapse case, leaving the true supersession race uncovered – two
    // overlapping recognitions with ink still present.
    const releases: ((module: FakeModule | null) => void)[] = [];
    const load = (): Promise<FakeModule | null> =>
      new Promise((resolve) => {
        releases.push(resolve);
      });
    const first = fakeRecogniser(recognition([candidate('\\alpha', 'Stale', 'α', 1)])).module;
    const second = fakeRecogniser(recognition([candidate('\\beta', 'Fresh', 'β', 1)])).module;

    const { toggle, surface, listbox } = mount(load);
    toggle.click(); // the open also warms the loader: releases[0]
    drawStroke(surface); // recognition 1 (a frame later): releases[1]
    await tick();
    drawStroke(surface, 20, 80); // recognition 2 (a frame later): releases[2]
    await tick();
    expect(releases).toHaveLength(3);

    releases[2]!(second); // the newer one lands first
    await tick();
    expect(listbox.querySelector('[role="option"]')!.getAttribute('aria-label')).toBe('Fresh');

    releases[1]!(first); // the stale one must be discarded
    await tick();
    expect(listbox.querySelector('[role="option"]')!.getAttribute('aria-label')).toBe('Fresh');
    expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(1);
  });
});
