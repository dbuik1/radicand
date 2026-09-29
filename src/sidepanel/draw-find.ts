/**
 * Draw-to-find: sketch a symbol with a pointer and insert one of the
 * closest matches – for when you know what a symbol looks like but not its
 * name. The Drawing mode of the workspace (opened from the Insert… controls)
 * shows a drawing surface with Undo/Clear controls and a ranked candidate
 * list; the text search remains the keyboard-equivalent route to every
 * symbol, and a "Search instead" control beside Undo and Clear hands over
 * to it at any time, ink or no ink.
 *
 * The recogniser and its prototype drawings (src/sidepanel/draw/, distilled
 * from the Detexify dataset) live in a module worker that starts on first
 * open – first paint never pays for them, ranking never blocks the ink or
 * the announcements, and everything stays offline.
 *
 * Accessibility: the surface itself is a pointer gesture area (focusable,
 * described, but not keyboard-drawable – the search is the documented
 * alternative); every control around it is a native button; candidates are
 * one Tab stop with roving tabindex like the palette grid; the status line
 * is the aria-live region, so what sighted users read is what gets
 * announced (with a visually-hidden suffix where the announcement needs a
 * fact the layout carries some other way). It is handed back separately so
 * the workspace can seat it in the mode header, under the title.
 */
import type { EditorController } from './editor';
import { addRecent } from './recent';
import { SEARCH_SHORTCUT_LABEL } from './shortcut-labels';
import { onSettingsChange } from './settings';
import type { Stroke } from './draw/recogniser';
import type { DrawCandidate, DrawRecognition } from './draw/templates';
import type { DrawRecogniser } from './draw/recognition-client';

let recogniserPromise: Promise<DrawRecogniser | null> | null = null;

/** Start the shared recognition worker on first call; cached afterwards. */
function loadRecogniser(): Promise<DrawRecogniser | null> {
  recogniserPromise ??= import('./draw/recognition-client')
    .then((module) => module.loadWorkerRecogniser())
    .catch((error: unknown) => {
      console.error('Draw-to-find is unavailable:', error);
      return null;
    });
  return recogniserPromise;
}

export interface DrawToFind {
  /** The draw region: surface, controls and candidates. */
  region: HTMLElement;
  /** The live status line, for the mode header. */
  status: HTMLElement;
  /** Warm the recogniser and size the canvas – call when the mode shows. */
  open: () => void;
  /** Clear ink and candidates – call when the mode hides. */
  close: () => void;
}

export interface DrawToFindOptions {
  /** The recogniser loader (tests substitute a fake). */
  load?: () => Promise<DrawRecogniser | null>;
  /** "Search instead": hand over to the text search. */
  onSearchInstead: () => void;
}

/** The surface's CSS height, and the fallback when it is not laid out yet. */
const SURFACE_HEIGHT = 180;

export function createDrawToFind(
  editor: EditorController,
  { load = loadRecogniser, onSearchInstead }: DrawToFindOptions,
): DrawToFind {
  const region = document.createElement('div');
  region.id = 'draw-region';
  region.className = 'draw-find';

  const surface = document.createElement('div');
  surface.className = 'draw-find__surface';
  surface.tabIndex = 0;
  surface.setAttribute('role', 'img');
  surface.setAttribute('aria-label', 'Drawing area');

  const canvas = document.createElement('canvas');
  canvas.className = 'draw-find__canvas';

  // The caption inside the empty surface is also the surface's accessible
  // description, so what a screen reader hears on arrival is what the
  // caption says – including the keyboard route to the text search. It is
  // out of the reading order itself (the description already carries it)
  // and stays the description after ink hides it.
  const hint = document.createElement('div');
  hint.className = 'draw-find__hint';
  hint.id = 'draw-hint';
  hint.setAttribute('aria-hidden', 'true');
  const hintTitle = document.createElement('span');
  hintTitle.className = 'draw-find__hint-title';
  hintTitle.textContent = 'Draw a symbol';
  const hintSub = document.createElement('span');
  hintSub.className = 'draw-find__hint-sub';
  hintSub.textContent = 'Use any number of strokes';
  const hintKeys = document.createElement('span');
  hintKeys.className = 'draw-find__hint-sub';
  hintKeys.textContent = `${SEARCH_SHORTCUT_LABEL} searches by name instead`;
  hint.append(hintTitle, hintSub, hintKeys);
  surface.setAttribute('aria-describedby', hint.id);
  surface.append(canvas, hint);

  const controls = document.createElement('div');
  controls.className = 'draw-find__controls';
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'btn btn--secondary btn--slim';
  undoBtn.textContent = 'Undo stroke';
  undoBtn.disabled = true;
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn--secondary btn--slim';
  clearBtn.textContent = 'Clear';
  clearBtn.disabled = true;
  // Always offered, never disabled: it is the keyboard route out of a mode
  // whose surface only a pointer can use.
  const searchInsteadBtn = document.createElement('button');
  searchInsteadBtn.type = 'button';
  searchInsteadBtn.className = 'btn btn--secondary btn--slim draw-find__search-instead';
  searchInsteadBtn.title = `Search symbols by name (${SEARCH_SHORTCUT_LABEL})`;
  const searchInsteadKey = document.createElement('kbd');
  searchInsteadKey.setAttribute('aria-hidden', 'true');
  searchInsteadKey.textContent = SEARCH_SHORTCUT_LABEL;
  searchInsteadBtn.append('Search instead', searchInsteadKey);
  controls.append(undoBtn, clearBtn, searchInsteadBtn);

  // The visible status line doubles as the live region: what sighted users
  // read is what screen readers hear, once per completed stroke. A
  // visually-hidden suffix carries anything the announcement needs that the
  // layout shows elsewhere (the best match, the search redirect).
  const status = document.createElement('p');
  status.className = 'draw-find__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const setStatus = (
    text: string,
    { strong = false, suffix = '' }: { strong?: boolean; suffix?: string } = {},
  ): void => {
    const parts: (string | HTMLElement)[] = [text];
    if (suffix) {
      const hiddenPart = document.createElement('span');
      hiddenPart.className = 'visually-hidden';
      hiddenPart.textContent = suffix;
      parts.push(hiddenPart);
    }
    status.replaceChildren(...parts);
    status.classList.toggle('draw-find__status--strong', strong);
  };

  const listbox = document.createElement('ul');
  listbox.className = 'draw-find__list';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', 'Drawing matches');
  listbox.hidden = true;

  const noMatch = document.createElement('div');
  noMatch.className = 'draw-find__nomatch';
  noMatch.hidden = true;
  const noMatchText = document.createElement('p');
  noMatchText.className = 'draw-find__nomatch-text';
  noMatchText.textContent = "The text search covers every symbol, including ones drawing can't find.";
  noMatch.append(noMatchText);

  region.append(surface, controls, listbox, noMatch);

  // ------------------------------------------------------------- ink state
  const strokes: Stroke[] = [];
  let currentStroke: [number, number][] | null = null;
  // Orphans a recognition that resolves after the drawing changed or the
  // region was collapsed (same pattern as the search's dismissal guard).
  let recogniseGeneration = 0;
  // Ink style, read from CSS once per full repaint (never per pointermove –
  // a forced style recalculation per sample would stutter the ink).
  let inkColour = '#000';
  let inkWidth = 3.5;

  const context = (): CanvasRenderingContext2D | null => canvas.getContext('2d');

  const configureInk = (ctx: CanvasRenderingContext2D): void => {
    ctx.strokeStyle = inkColour;
    ctx.fillStyle = inkColour;
    ctx.lineWidth = inkWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const paintStroke = (ctx: CanvasRenderingContext2D, stroke: readonly [number, number][] | Stroke): void => {
    if (stroke.length === 0) return;
    if (stroke.length === 1) {
      // A tap is a dot (÷ needs two of them).
      ctx.beginPath();
      ctx.arc(stroke[0]![0], stroke[0]![1], inkWidth / 2, 0, 2 * Math.PI);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0]![0], stroke[0]![1]);
    for (const [x, y] of stroke) ctx.lineTo(x, y);
    ctx.stroke();
  };

  /** Match the bitmap to the surface's CSS size and repaint every stroke. */
  const redraw = (): void => {
    const ctx = context();
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || surface.clientWidth;
    const height = canvas.clientHeight || surface.clientHeight || SURFACE_HEIGHT;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(surface);
    // The surface's used text colour follows every theme, including forced
    // colours (where it resolves to CanvasText).
    inkColour = styles.color;
    inkWidth = parseFloat(styles.getPropertyValue('--draw-ink-width')) || 3.5;
    configureInk(ctx);
    for (const stroke of [...strokes, ...(currentStroke ? [currentStroke] : [])]) {
      paintStroke(ctx, stroke);
    }
  };

  /** Extend the in-progress stroke by one segment, without a full repaint. */
  const paintSegment = (from: readonly [number, number], to: readonly [number, number]): void => {
    const ctx = context();
    if (!ctx) return;
    configureInk(ctx);
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
  };

  const syncControls = (): void => {
    const inkless = strokes.length === 0 && currentStroke === null;
    // Disabling the focused button would dump focus on <body>; park it on
    // the surface first so keyboard users stay inside the region.
    if (inkless && (document.activeElement === undoBtn || document.activeElement === clearBtn)) {
      surface.focus();
    }
    undoBtn.disabled = inkless;
    clearBtn.disabled = inkless;
    hint.hidden = !inkless;
  };

  const clearResults = (): void => {
    listbox.hidden = true;
    listbox.replaceChildren();
    noMatch.hidden = true;
    shownCandidates = [];
  };

  /** Back to the empty state (ink gone, hint back, results gone). */
  const reset = (statusText: string): void => {
    recogniseGeneration++;
    strokes.length = 0;
    currentStroke = null;
    clearResults();
    syncControls();
    redraw();
    setStatus(statusText);
  };

  // ------------------------------------------------------------ candidates
  // What the listbox currently shows – the single keydown handler below
  // reads this, so re-renders never stack listeners.
  let shownCandidates: DrawCandidate[] = [];

  const moveRoving = (options: HTMLLIElement[], from: number, to: number): void => {
    options[from]!.tabIndex = -1;
    // Selection follows focus (the APG listbox convention); the "best
    // match" highlight is the separate --best class, set at render.
    options[from]!.setAttribute('aria-selected', 'false');
    options[to]!.tabIndex = 0;
    options[to]!.setAttribute('aria-selected', 'true');
    options[to]!.focus();
  };

  listbox.addEventListener('keydown', (event: KeyboardEvent) => {
    const options = [...listbox.querySelectorAll<HTMLLIElement>('[role="option"]')];
    const active = options.findIndex((option) => option.tabIndex === 0);
    if (active === -1) return;
    let target: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        target = Math.min(active + 1, options.length - 1);
        break;
      case 'ArrowUp':
        target = Math.max(active - 1, 0);
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = options.length - 1;
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const candidate = shownCandidates[active];
        if (candidate) insertCandidate(candidate);
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    moveRoving(options, active, target);
  });

  const insertCandidate = (candidate: DrawCandidate): void => {
    editor.insert(candidate.latex, { focus: true });
    addRecent({ glyph: candidate.glyph, label: candidate.name, latex: candidate.latex });
    reset(`Inserted ${candidate.name} (${candidate.glyph})`);
  };

  const renderCandidates = (recognition: DrawRecognition): void => {
    const hadFocus = listbox.contains(document.activeElement);
    clearResults();
    const { candidates, matches, confident } = recognition;
    shownCandidates = candidates;
    if (candidates.length === 0) {
      setStatus('No close match.', { strong: true, suffix: ' Try the text search.' });
      noMatch.hidden = false;
      if (hadFocus) surface.focus();
      return;
    }
    candidates.forEach((candidate, index) => {
      const option = document.createElement('li');
      option.className = 'draw-find__option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === 0));
      option.classList.toggle('draw-find__option--best', index === 0);
      // Named by the description alone so the option reads the same as a
      // search result; the command and glyph stay decorative.
      option.setAttribute('aria-label', candidate.name);
      option.tabIndex = index === 0 ? 0 : -1;

      const glyph = document.createElement('span');
      glyph.className = 'draw-find__glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = candidate.glyph;

      const name = document.createElement('span');
      name.className = 'draw-find__name';
      name.textContent = candidate.name;

      const command = document.createElement('span');
      command.className = 'draw-find__cmd';
      command.setAttribute('aria-hidden', 'true');
      command.textContent = candidate.latex;

      option.append(glyph, name, command);
      // Keep the caret in the maths field: a click must not move focus first.
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => insertCandidate(candidate));
      listbox.appendChild(option);
    });

    const best = candidates[0]!;
    // Early on, nudge towards more strokes; once the drawing is committed
    // (or clearly matched), lead with the best match instead. The hidden
    // suffix announces the best match the visible list already shows.
    if (confident || strokes.length >= 4) {
      setStatus(`Best match: ${best.name}`);
    } else {
      setStatus(`${matches} match${matches === 1 ? '' : 'es'} – keep drawing to refine`, {
        suffix: `, best match: ${best.name}`,
      });
    }
    listbox.hidden = false;
    if (hadFocus) {
      const first = listbox.querySelector<HTMLLIElement>('[role="option"]');
      first?.focus();
    }
  };

  const recognise = async (): Promise<void> => {
    const generation = ++recogniseGeneration;
    const recogniser = await load();
    if (generation !== recogniseGeneration) return; // drawing changed or closed
    if (recogniser === null) {
      setStatus('Drawing recognition is unavailable.');
      return;
    }
    if (strokes.length === 0) {
      clearResults();
      setStatus('');
      return;
    }
    try {
      const result = await recogniser.recognise(strokes);
      // The generation guard keeps announcements in order: a result for an
      // older drawing (or a collapsed region) is dropped, never announced.
      if (generation !== recogniseGeneration) return;
      renderCandidates(result);
    } catch (error) {
      console.error('Draw-to-find is unavailable:', error);
      if (generation === recogniseGeneration) setStatus('Drawing recognition is unavailable.');
    }
  };

  // ---------------------------------------------------------- pointer flow
  const pointerPosition = (event: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };

  surface.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault(); // suppresses text selection and touch scrolling
    surface.focus(); // preventDefault also suppressed the focusing click
    surface.setPointerCapture?.(event.pointerId);
    currentStroke = [pointerPosition(event)];
    syncControls();
    redraw();
  });

  surface.addEventListener('pointermove', (event: PointerEvent) => {
    if (!currentStroke) return;
    const point = pointerPosition(event);
    const previous = currentStroke[currentStroke.length - 1]!;
    currentStroke.push(point);
    paintSegment(previous, point);
  });

  const finishStroke = (): void => {
    if (!currentStroke) return;
    strokes.push(currentStroke);
    currentStroke = null;
    syncControls();
    redraw();
    // A frame later, so the completed ink and control states paint before
    // the ~200 ms synchronous ranking runs.
    requestAnimationFrame(() => void recognise());
  };

  surface.addEventListener('pointerup', finishStroke);
  surface.addEventListener('pointercancel', finishStroke);
  // Capture can be torn away (e.g. a right-click mid-stroke): commit what
  // exists rather than stranding a live stroke. After a normal pointerup
  // this is a no-op (currentStroke is already null).
  surface.addEventListener('lostpointercapture', finishStroke);
  // The surface is for ink; the browser context menu would tear capture away.
  surface.addEventListener('contextmenu', (event) => event.preventDefault());

  // Escape (from the surface, the controls or the list) is the workspace's:
  // it closes the Drawing mode and returns to the equation field.

  // -------------------------------------------------------------- controls
  undoBtn.addEventListener('click', () => {
    strokes.pop();
    currentStroke = null;
    syncControls();
    redraw();
    if (strokes.length > 0) {
      void recognise();
    } else {
      recogniseGeneration++;
      clearResults();
      setStatus('');
    }
  });

  clearBtn.addEventListener('click', () => reset('Cleared'));

  searchInsteadBtn.addEventListener('click', onSearchInstead);

  // ------------------------------------------------------------ open/close
  const open = (): void => {
    // Warm the recogniser while the user reaches for the pen: start the
    // worker now and precompile the prototype clouds there, off the main
    // thread, so neither cost lands on the first stroke. The ODbL
    // attribution rides along as a DOM attribute once the worker reports
    // ready, keeping the notice in the shipped app.
    void load().then((recogniser) => {
      if (recogniser === null) return;
      void recogniser.notice.then((notice) => region.setAttribute('data-attribution', notice));
      recogniser.warmUp();
    });
    requestAnimationFrame(redraw); // size the canvas once laid out
  };

  const close = (): void => {
    reset(''); // closing clears ink and candidates
  };

  // Panel resizes rescale the bitmap; theme changes recolour the ink.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => redraw()).observe(surface);
  }
  onSettingsChange(() => redraw());

  return { region, status, open, close };
}
