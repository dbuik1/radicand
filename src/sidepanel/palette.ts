/**
 * Curated symbol palette – the Symbols mode of the workspace.
 *
 * Search first (find anything by describing it), then the Insert… controls
 * (Drawing, My library – opened as workspace modes), then the category
 * strip and the symbol well. The keyboard path is the design: from the
 * field, Tab lands on the search box; Tab again reaches the Insert… control,
 * then the category tabs, then the symbol grid (one stop each). Enter/Space
 * inserts at the caret WITHOUT moving focus, so consecutive inserts cost
 * one keypress each; Escape from the tabs or the grid returns focus to the
 * field (the Pearson Accessible Equation Editor / MathType convention). It
 * is a convenience layer, never a ceiling – the full LaTeX command set
 * remains typeable directly into the field, and the LaTeX source view
 * (source.ts) shows/edits it.
 *
 * The palette can be hidden (Ctrl+Shift+Y, persisted): a single "Symbols"
 * row with the shortcut hint stays behind, and reopens it. The persisted
 * flag is reacted to by the workspace (workspace.ts), which owns what the
 * middle zone shows; the palette only exposes the collapse.
 *
 * Accessibility:
 * - Categories use the ARIA `tablist`/`tab`/`tabpanel` pattern: arrow keys
 *   move between tabs (wrapping; Home/End to the ends) and reveal the
 *   matching panel. The selected category persists per user. On narrow
 *   panels the strip scrolls sideways (a fade and chevron signal more);
 *   the selected tab is always scrolled into view.
 * - Each panel is a roving-tabindex grid – a single Tab stop with
 *   two-dimensional arrow-key navigation between symbols.
 * - Every button has a meaningful programmatic accessible name
 *   (`aria-label`), not just its glyph. Targets are >= 24x24 CSS px
 *   (SC 2.5.8); symbol keys are 44px.
 */
import type { EditorController } from './editor';
import { addRecent, getRecent, loadRecent, onRecentChange } from './recent';
import { getSettings, onSettingsChange, updateSettings } from './settings';
import { announce } from './a11y';
import { createSymbolSearch } from './symbol-search';
import { wireRovingTabindex } from './roving';
import { createMenu } from './menu';
import { bindPart, bindToSettings, isPartShown } from './part-visibility';

interface PaletteItem {
  /** Visible glyph shown on the button. */
  glyph: string;
  /** Meaningful accessible name (announced instead of the glyph). */
  label: string;
  /** LaTeX inserted on activation; `#?` marks tab-navigable placeholders. */
  latex: string;
}

interface PaletteCategory {
  name: string;
  items: PaletteItem[];
}

/** LaTeX for an r x c pmatrix whose every cell is a tab-navigable placeholder. */
export function matrixLatex(rows: number, columns: number): string {
  const row = Array.from({ length: columns }, () => '#?').join('&');
  const body = Array.from({ length: rows }, () => row).join('\\\\');
  return `\\begin{pmatrix}${body}\\end{pmatrix}`;
}

const CATEGORIES: PaletteCategory[] = [
  {
    name: 'Layout',
    items: [
      { glyph: '½', label: 'Fraction', latex: '\\frac{#?}{#?}' },
      { glyph: '√', label: 'Square root', latex: '\\sqrt{#?}' },
      { glyph: 'ⁿ√', label: 'nth root', latex: '\\sqrt[#?]{#?}' },
      { glyph: 'xⁿ', label: 'Superscript (power)', latex: '#?^{#?}' },
      { glyph: 'xₙ', label: 'Subscript', latex: '#?_{#?}' },
      { glyph: 'xⁿₘ', label: 'Subscript and superscript', latex: '#?_{#?}^{#?}' },
      { glyph: '()', label: 'Parentheses', latex: '\\left(#?\\right)' },
      { glyph: '[]', label: 'Square brackets', latex: '\\left[#?\\right]' },
      { glyph: '{}', label: 'Curly braces', latex: '\\left\\{#?\\right\\}' },
      { glyph: '|x|', label: 'Absolute value', latex: '\\left|#?\\right|' },
      { glyph: 'x⃗', label: 'Vector', latex: '\\vec{#?}' },
      { glyph: 'x̂', label: 'Hat', latex: '\\hat{#?}' },
      { glyph: 'x̄', label: 'Bar (overline)', latex: '\\overline{#?}' },
    ],
  },
  {
    name: 'Operators',
    items: [
      { glyph: '×', label: 'Multiplication sign', latex: '\\times' },
      { glyph: '÷', label: 'Division sign', latex: '\\div' },
      { glyph: '±', label: 'Plus-minus sign', latex: '\\pm' },
      { glyph: '∓', label: 'Minus-plus sign', latex: '\\mp' },
      { glyph: '⋅', label: 'Dot operator', latex: '\\cdot' },
      { glyph: '∗', label: 'Asterisk operator', latex: '\\ast' },
      { glyph: '∘', label: 'Composition (ring operator)', latex: '\\circ' },
      { glyph: '∞', label: 'Infinity', latex: '\\infty' },
      { glyph: '∂', label: 'Partial derivative symbol', latex: '\\partial' },
      { glyph: '∇', label: 'Nabla (del)', latex: '\\nabla' },
      // Relations share the chip: one strip stop fewer, and ≤ ≠ ≈ sit
      // beside × ÷ ± where users look for them.
      { glyph: '≤', label: 'Less than or equal to', latex: '\\le' },
      { glyph: '≥', label: 'Greater than or equal to', latex: '\\ge' },
      { glyph: '≠', label: 'Not equal to', latex: '\\ne' },
      { glyph: '≈', label: 'Approximately equal to', latex: '\\approx' },
      { glyph: '≡', label: 'Identical to', latex: '\\equiv' },
      { glyph: '∝', label: 'Proportional to', latex: '\\propto' },
      { glyph: '≪', label: 'Much less than', latex: '\\ll' },
      { glyph: '≫', label: 'Much greater than', latex: '\\gg' },
    ],
  },
  {
    name: 'Greek',
    items: [
      { glyph: 'α', label: 'Greek small letter alpha', latex: '\\alpha' },
      { glyph: 'β', label: 'Greek small letter beta', latex: '\\beta' },
      { glyph: 'γ', label: 'Greek small letter gamma', latex: '\\gamma' },
      { glyph: 'δ', label: 'Greek small letter delta', latex: '\\delta' },
      // MathLive renders \epsilon as the lunate ϵ (and \phi below as ϕ);
      // the keys show what will actually be inserted.
      { glyph: 'ϵ', label: 'Greek small letter epsilon', latex: '\\epsilon' },
      { glyph: 'θ', label: 'Greek small letter theta', latex: '\\theta' },
      { glyph: 'λ', label: 'Greek small letter lambda', latex: '\\lambda' },
      { glyph: 'μ', label: 'Greek small letter mu', latex: '\\mu' },
      { glyph: 'π', label: 'Greek small letter pi', latex: '\\pi' },
      { glyph: 'ρ', label: 'Greek small letter rho', latex: '\\rho' },
      { glyph: 'σ', label: 'Greek small letter sigma', latex: '\\sigma' },
      { glyph: 'ϕ', label: 'Greek small letter phi', latex: '\\phi' },
      { glyph: 'ω', label: 'Greek small letter omega', latex: '\\omega' },
      { glyph: 'Δ', label: 'Greek capital letter delta', latex: '\\Delta' },
      { glyph: 'Σ', label: 'Greek capital letter sigma', latex: '\\Sigma' },
      { glyph: 'Ω', label: 'Greek capital letter omega', latex: '\\Omega' },
    ],
  },
  {
    name: 'Sets',
    items: [
      { glyph: '∈', label: 'Element of', latex: '\\in' },
      { glyph: '∉', label: 'Not an element of', latex: '\\notin' },
      { glyph: '⊂', label: 'Subset of', latex: '\\subset' },
      { glyph: '⊆', label: 'Subset of or equal to', latex: '\\subseteq' },
      { glyph: '∪', label: 'Union', latex: '\\cup' },
      { glyph: '∩', label: 'Intersection', latex: '\\cap' },
      { glyph: '∅', label: 'Empty set', latex: '\\emptyset' },
      { glyph: '∀', label: 'For all', latex: '\\forall' },
      { glyph: '∃', label: 'There exists', latex: '\\exists' },
      { glyph: 'ℝ', label: 'Set of real numbers', latex: '\\mathbb{R}' },
      { glyph: 'ℤ', label: 'Set of integers', latex: '\\mathbb{Z}' },
      { glyph: 'ℕ', label: 'Set of natural numbers', latex: '\\mathbb{N}' },
      { glyph: 'ℚ', label: 'Set of rational numbers', latex: '\\mathbb{Q}' },
      { glyph: 'ℂ', label: 'Set of complex numbers', latex: '\\mathbb{C}' },
    ],
  },
  {
    name: 'Arrows',
    items: [
      { glyph: '→', label: 'Rightwards arrow', latex: '\\to' },
      { glyph: '←', label: 'Leftwards arrow', latex: '\\leftarrow' },
      { glyph: '↔', label: 'Left right arrow', latex: '\\leftrightarrow' },
      { glyph: '⇒', label: 'Implies', latex: '\\Rightarrow' },
      { glyph: '⇐', label: 'Is implied by', latex: '\\Leftarrow' },
      { glyph: '⇔', label: 'If and only if', latex: '\\Leftrightarrow' },
      { glyph: '↦', label: 'Maps to', latex: '\\mapsto' },
      { glyph: '↑', label: 'Upwards arrow', latex: '\\uparrow' },
      { glyph: '↓', label: 'Downwards arrow', latex: '\\downarrow' },
    ],
  },
  {
    name: 'Functions',
    items: [
      { glyph: 'sin', label: 'Sine function', latex: '\\sin' },
      { glyph: 'cos', label: 'Cosine function', latex: '\\cos' },
      { glyph: 'tan', label: 'Tangent function', latex: '\\tan' },
      { glyph: 'csc', label: 'Cosecant function', latex: '\\csc' },
      { glyph: 'sec', label: 'Secant function', latex: '\\sec' },
      { glyph: 'cot', label: 'Cotangent function', latex: '\\cot' },
      { glyph: 'sin⁻¹', label: 'Inverse sine (arcsine)', latex: '\\arcsin' },
      { glyph: 'cos⁻¹', label: 'Inverse cosine (arccosine)', latex: '\\arccos' },
      { glyph: 'tan⁻¹', label: 'Inverse tangent (arctangent)', latex: '\\arctan' },
      { glyph: '∑', label: 'Summation', latex: '\\sum_{#?}^{#?}' },
      { glyph: '∏', label: 'Product', latex: '\\prod_{#?}^{#?}' },
      { glyph: '∫', label: 'Integral', latex: '\\int_{#?}^{#?}' },
      { glyph: '∬', label: 'Double integral', latex: '\\iint_{#?}^{#?}' },
      { glyph: '∭', label: 'Triple integral', latex: '\\iiint_{#?}^{#?}' },
      { glyph: '∮', label: 'Contour integral', latex: '\\oint_{#?}^{#?}' },
      { glyph: 'lim', label: 'Limit', latex: '\\lim_{#?}' },
      { glyph: 'd/dx', label: 'Derivative', latex: '\\frac{d}{d#?}' },
      { glyph: '∂/∂x', label: 'Partial derivative', latex: '\\frac{\\partial}{\\partial #?}' },
    ],
  },
  // The Matrix category renders quick sizes + the custom size picker rather
  // than a plain symbol grid – see buildMatrixPanel.
  { name: 'Matrix', items: [] },
];

/**
 * Categories folded into others since the stored `paletteCategory` was
 * written: a user who last had Relations open lands on Operators, not on
 * Recent. Library became a workspace mode; it falls through to Recent.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  Relations: 'Operators',
  Trigonometry: 'Functions',
  Calculus: 'Functions',
};

/** The matrix sizes offered as one-press keys in the Matrix panel. */
const MATRIX_QUICK_SIZES: { rows: number; columns: number }[] = [
  { rows: 2, columns: 2 },
  { rows: 3, columns: 3 },
  { rows: 2, columns: 1 },
  { rows: 1, columns: 3 },
];

/**
 * Insert a matrix of the given size and note it in the Recent list.
 * `focus: false` keeps focus where it is (keyboard activation from the
 * quick-size keys); pointer activation passes true so the caret is ready to fill
 * the first cell.
 */
function insertMatrix(
  editor: EditorController,
  rows: number,
  columns: number,
  focus: boolean,
): void {
  editor.insert(matrixLatex(rows, columns), { focus });
  addRecent({
    glyph: `${rows}×${columns}`,
    label: `${rows} by ${columns} matrix`,
    latex: matrixLatex(rows, columns),
  });
  announce(`Inserted ${rows} by ${columns} matrix`);
}

/**
 * Create the inline matrix size picker: a "Custom size…" disclosure opening
 * a panel with a 6x6 interactive grid and Rows/Columns number inputs. Grid
 * and inputs are redundant encodings of the same value – pointer speed for
 * sighted users, keyboard/screen-reader precision (up to 20×20) for everyone
 * else; neither is mandatory. Inline, not modal: surrounding context stays
 * visible and no focus trap is needed.
 */
function createMatrixSizePicker(editor: EditorController): HTMLElement {
  const container = document.createElement('div');
  container.className = 'matrix-picker';

  // A plain disclosure, not a dialog: the panel opens inline below the
  // trigger, traps no focus and dims nothing, so `aria-expanded` on the
  // trigger is the honest semantic (dialog semantics would promise modal
  // behaviour that is not there).
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'btn btn--secondary matrix-picker__trigger';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.textContent = 'Custom size…';

  const popover = document.createElement('div');
  popover.className = 'matrix-picker__popover';
  popover.setAttribute('role', 'group');
  popover.setAttribute('aria-labelledby', 'matrix-picker-heading');
  popover.hidden = true;

  const heading = document.createElement('div');
  heading.className = 'matrix-picker__heading';
  heading.id = 'matrix-picker-heading';
  heading.textContent = 'Custom matrix size';

  // One size is selected at a time, so the cells are radios in a radiogroup –
  // assistive tech then reports the selection state natively.
  const grid = document.createElement('div');
  grid.className = 'matrix-picker__grid';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'Matrix size');

  const cells: HTMLButtonElement[][] = [];
  for (let r = 1; r <= 6; r++) {
    const row: HTMLButtonElement[] = [];
    for (let c = 1; c <= 6; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'matrix-picker__cell';
      cell.setAttribute('role', 'radio');
      cell.setAttribute('aria-label', `${r} by ${c}`);
      cell.setAttribute('data-row', String(r));
      cell.setAttribute('data-col', String(c));
      cell.setAttribute('aria-checked', 'false');
      cell.tabIndex = r === 1 && c === 1 ? 0 : -1;
      row.push(cell);
      grid.appendChild(cell);
    }
    cells.push(row);
  }

  const status = document.createElement('div');
  status.className = 'matrix-picker__status';
  status.setAttribute('aria-hidden', 'true');
  status.textContent = '2 rows × 2 columns';

  // Selection state: which cell is selected (user chose it)
  let selectedRow = 2;
  let selectedCol = 2;
  // Focused cell for preview (keyboard navigation)
  let focusedRow = 1;
  let focusedCol = 1;

  const plural = (n: number, unit: string): string =>
    `${n} ${unit}${n === 1 ? '' : 's'}`;

  const updateDisplay = (): void => {
    status.textContent = `${plural(selectedRow, 'row')} × ${plural(selectedCol, 'column')}`;
    cells.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const r = ri + 1;
        const c = ci + 1;
        // Highlight all cells from (1,1) to (displayRow, displayCol)
        // where displayRow/displayCol is max(focused, selected)
        const displayR = Math.max(focusedRow, selectedRow);
        const displayC = Math.max(focusedCol, selectedCol);
        const inRange = r <= displayR && c <= displayC;
        cell.classList.toggle('matrix-picker__cell--in-range', inRange);
        // aria-checked marks only the selected size's cell.
        cell.setAttribute('aria-checked', String(r === selectedRow && c === selectedCol));
      });
    });
  };

  const selectCell = (r: number, c: number): void => {
    selectedRow = r;
    selectedCol = c;
    rowsInput.value = String(r);
    colsInput.value = String(c);
    updateDisplay();
    announce(`${r} by ${c} selected`);
  };

  cells.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      const r = ri + 1;
      const c = ci + 1;
      cell.addEventListener('click', () => selectCell(r, c));
      cell.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectCell(r, c);
        }
      });
    });
  });

  // Grid navigation via arrow keys, Home/End
  const wireGridNavigation = (cells2d: HTMLButtonElement[][]): void => {
    let activeRow = 0;
    let activeCol = 0;

    const focusAt = (r: number, c: number): void => {
      const clamped_r = Math.max(0, Math.min(r, cells2d.length - 1));
      const clamped_c = Math.max(0, Math.min(c, cells2d[0]!.length - 1));
      const current = cells2d[activeRow]![activeCol];
      const target = cells2d[clamped_r]![clamped_c];
      if (current) current.tabIndex = -1;
      if (target) {
        target.tabIndex = 0;
        target.focus();
      }
      activeRow = clamped_r;
      activeCol = clamped_c;
      focusedRow = activeRow + 1;
      focusedCol = activeCol + 1;
      updateDisplay();
    };

    grid.addEventListener('keydown', (event: KeyboardEvent) => {
      let target_r: number | null = null;
      let target_c: number | null = null;
      switch (event.key) {
        case 'ArrowRight':
          target_r = activeRow;
          target_c = activeCol + 1;
          break;
        case 'ArrowLeft':
          target_r = activeRow;
          target_c = activeCol - 1;
          break;
        case 'ArrowDown':
          target_r = activeRow + 1;
          target_c = activeCol;
          break;
        case 'ArrowUp':
          target_r = activeRow - 1;
          target_c = activeCol;
          break;
        case 'Home':
          target_r = activeRow;
          target_c = 0;
          break;
        case 'End':
          target_r = activeRow;
          target_c = cells2d[0]!.length - 1;
          break;
        default:
          return;
      }
      if (target_r !== null && target_c !== null) {
        event.preventDefault();
        focusAt(target_r, target_c);
      }
    });

    cells2d.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        cell.addEventListener('focus', () => {
          if (ri === activeRow && ci === activeCol) return;
          const current = cells2d[activeRow]![activeCol];
          if (current) current.tabIndex = -1;
          cell.tabIndex = 0;
          activeRow = ri;
          activeCol = ci;
          focusedRow = ri + 1;
          focusedCol = ci + 1;
          updateDisplay();
        });
        cell.addEventListener('blur', () => {
          // On blur, revert preview to selected position
          focusedRow = selectedRow;
          focusedCol = selectedCol;
          updateDisplay();
        });
      });
    });
  };

  wireGridNavigation(cells);

  // Manual entry path: labels above the inputs, Insert alongside.
  const manual = document.createElement('div');
  manual.className = 'matrix-picker__manual';

  const rowsField = document.createElement('div');
  rowsField.className = 'matrix-picker__field';
  const rowsLabel = document.createElement('label');
  rowsLabel.setAttribute('for', 'matrix-rows');
  rowsLabel.textContent = 'Rows';

  const rowsInput = document.createElement('input');
  rowsInput.id = 'matrix-rows';
  rowsInput.type = 'number';
  rowsInput.min = '1';
  rowsInput.max = '20';
  rowsInput.value = '2';
  rowsField.append(rowsLabel, rowsInput);

  const colsField = document.createElement('div');
  colsField.className = 'matrix-picker__field';
  const colsLabel = document.createElement('label');
  colsLabel.setAttribute('for', 'matrix-cols');
  colsLabel.textContent = 'Columns';

  const colsInput = document.createElement('input');
  colsInput.id = 'matrix-cols';
  colsInput.type = 'number';
  colsInput.min = '1';
  colsInput.max = '20';
  colsInput.value = '2';
  colsField.append(colsLabel, colsInput);

  // Update the selection as the user types, but only rewrite the inputs'
  // text on commit (change/blur): clamping and defaulting on every keystroke
  // would fight the user mid-entry (e.g. rewriting an emptied box back to a
  // number before they can type the intended value).
  const updateFromInputs = (rewrite: boolean): void => {
    const r = Math.max(1, Math.min(20, parseInt(rowsInput.value, 10) || selectedRow));
    const c = Math.max(1, Math.min(20, parseInt(colsInput.value, 10) || selectedCol));
    selectedRow = r;
    selectedCol = c;
    focusedRow = r;
    focusedCol = c;
    if (rewrite) {
      rowsInput.value = String(r);
      colsInput.value = String(c);
    }
    updateDisplay();
  };

  rowsInput.addEventListener('input', () => updateFromInputs(false));
  colsInput.addEventListener('input', () => updateFromInputs(false));
  rowsInput.addEventListener('change', () => updateFromInputs(true));
  colsInput.addEventListener('change', () => updateFromInputs(true));

  const insertBtn = document.createElement('button');
  insertBtn.type = 'button';
  insertBtn.className = 'btn btn--primary';
  insertBtn.textContent = 'Insert matrix';
  insertBtn.addEventListener('click', () => {
    editor.insert(matrixLatex(selectedRow, selectedCol));
    announce(`Inserted ${selectedRow} by ${selectedCol} matrix`);
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });

  manual.appendChild(rowsField);
  manual.appendChild(colsField);
  manual.appendChild(insertBtn);

  popover.appendChild(heading);
  popover.appendChild(grid);
  popover.appendChild(status);
  popover.appendChild(manual);

  trigger.addEventListener('click', () => {
    popover.hidden = !popover.hidden;
    trigger.setAttribute('aria-expanded', String(!popover.hidden));
    if (!popover.hidden) {
      focusedRow = selectedRow;
      focusedCol = selectedCol;
      const cellIndex = Math.min(selectedRow - 1, cells.length - 1);
      const colIndex = Math.min(selectedCol - 1, cells[0]!.length - 1);
      cells[cellIndex]![colIndex]!.focus();
    }
  });

  // Close on Escape
  popover.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      popover.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
  });

  container.appendChild(trigger);
  container.appendChild(popover);
  return container;
}

/** Hooks the palette needs from the workspace it lives in. */
export interface PaletteHooks {
  /** Open a workspace mode; `opener` is where Close returns focus to. */
  openMode?: (mode: 'drawing' | 'library', opener: HTMLElement) => void;
}

/** The built palette: its element and the collapse the workspace drives. */
export interface PaletteView {
  root: HTMLElement;
}

/**
 * Build the palette: the search row (with the Insert… controls), the category
 * strip and the symbol well.
 *
 * The palette is four pieces of interface, each of which the user can switch
 * off on its own (Settings › Interface): the whole area, the search box, the
 * categories and keys, and the Insert… controls. Each is answered here, where
 * it is built, so nothing else in the panel decides what the palette shows –
 * and each of the three inner pieces has exactly one function deciding
 * whether it is on screen, so two rules can never fight over the same
 * element.
 */
export function createPalette(editor: EditorController, hooks: PaletteHooks = {}): PaletteView {
  const root = document.createElement('div');
  root.className = 'palette';
  root.id = 'symbols';

  const content = document.createElement('div');
  content.className = 'palette__content';
  content.id = 'symbols-content';

  // Search first – find anything by describing it – then the curated tabs.
  // The tabs step aside while the search shows results, so the list is the
  // only thing under the box, and stay away entirely while the categories
  // are switched off: both answers come from this one function, so neither
  // can overwrite the other.
  const tabs = buildCategoryTabs(editor);
  let listOpen = false;
  const syncTabs = (): void => {
    tabs.hidden = listOpen || !isPartShown('symbolCategories');
  };
  bindToSettings(syncTabs);

  const from = buildFromControls(hooks);
  for (const control of from) bindPart('symbolSources', control);

  content.append(
    createSymbolSearch(editor, {
      trailing: from,
      onListToggle: (open) => {
        listOpen = open;
        syncTabs();
      },
    }),
    tabs,
  );
  root.append(content);

  // One owner for the whole area's visibility: it goes when the user switches
  // the palette off, and also when everything inside it is off, since an
  // empty bordered box below the field is exactly the clutter the toggles
  // exist to remove.
  bindToSettings((settings) => {
    const { symbols, symbolSearch, symbolCategories, symbolSources } = settings.parts;
    root.hidden = !symbols || !(symbolSearch || symbolCategories || symbolSources);
  });

  return { root };
}

/**
 * The Insert… controls on the search row: the two other things that can go
 * into the field from here – a symbol drawn by hand (Drawing) and a whole
 * saved equation (My library) – opened as workspace modes. Two renderings
 * of the same pair, swapped by a width media query in styles.css: a compact
 * Insert… ▾ menu for narrow panels and plain buttons where there is room.
 * Both hand the mode the control that opened it, so Close comes back here.
 * The same two modes are offered from the More ▾ menu beside the field, so
 * they stay reachable with this row switched off.
 */
function buildFromControls(hooks: PaletteHooks): HTMLElement[] {
  const openMode = (mode: 'drawing' | 'library', opener: HTMLElement): void => {
    hooks.openMode?.(mode, opener);
  };

  const menu = createMenu({
    id: 'from',
    label: 'Insert…',
    triggerAriaLabel: 'Insert a drawn symbol or a saved equation',
    triggerClass: 'btn btn--secondary btn--slim',
    align: 'end',
    entries: [
      {
        label: 'Drawing',
        detail: 'Sketch a symbol',
        onSelect: () => openMode('drawing', menu.trigger),
        focusAfter: 'none',
      },
      {
        label: 'My library',
        detail: 'Whole saved equations',
        onSelect: () => openMode('library', menu.trigger),
        focusAfter: 'none',
      },
    ],
  });
  menu.root.classList.add('from-menu');

  const group = document.createElement('div');
  group.className = 'from-buttons';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Insert from');
  const groupLabel = document.createElement('span');
  groupLabel.className = 'from-buttons__label';
  groupLabel.setAttribute('aria-hidden', 'true');
  groupLabel.textContent = 'Insert from';
  group.appendChild(groupLabel);
  for (const [mode, label, title] of [
    ['drawing', 'Drawing', 'Sketch a symbol and insert it'],
    ['library', 'My library', 'Insert a whole saved equation'],
  ] as const) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--secondary btn--slim';
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', () => openMode(mode, btn));
    group.appendChild(btn);
  }

  return [menu.root, group];
}

/**
 * Insert a symbol and record it as recently used. `focus` decides whether the
 * field takes focus: pointer activation moves the caret back into view, while
 * keyboard activation from the grid leaves focus on the key so the next
 * insert is one keypress away.
 */
function useItem(editor: EditorController, item: PaletteItem, focus: boolean): void {
  editor.insert(item.latex, { focus });
  addRecent(item);
  announce(`Inserted ${item.label}`);
}

/**
 * Build a fresh roving-tabindex grid of symbol buttons. A NEW element is
 * returned on every call (the caller swaps it in for any previous one), so
 * its keydown wiring is created exactly once per grid and dies with the
 * element – refreshing the Recent panel can never stack handlers.
 *
 * The grid deliberately carries its own keydown handling rather than the
 * surrounding tabpanel: other controls can share the panel (the Matrix
 * panel's size picker does), and a panel-level arrow-key handler would
 * hijack their keyboard interaction.
 *
 * `role="toolbar"` + an accessible name tells assistive-tech users this is a
 * single arrow-key-navigable stop, matching the roving tabindex behaviour.
 */
function buildGrid(
  editor: EditorController,
  items: PaletteItem[],
  label: string,
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'palette__grid';
  grid.setAttribute('role', 'toolbar');
  grid.setAttribute('aria-label', label);
  const buttons: HTMLButtonElement[] = [];
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette__btn';
    btn.textContent = item.glyph;
    btn.setAttribute('aria-label', item.label);
    btn.title = item.label;
    btn.tabIndex = buttons.length === 0 ? 0 : -1;
    // Don't let a mouse click move focus out of the math field – keep the caret
    // where it is so the symbol is inserted at the right place.
    btn.addEventListener('mousedown', (event) => event.preventDefault());
    // `detail === 0` = keyboard activation (Enter/Space): insert at the caret
    // WITHOUT moving focus, so consecutive inserts cost one keypress each.
    btn.addEventListener('click', (event) => useItem(editor, item, event.detail !== 0));
    buttons.push(btn);
    grid.appendChild(btn);
  }
  if (buttons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'palette__empty';
    empty.textContent = 'No symbols used yet – ones you insert from any tab appear here';
    grid.appendChild(empty);
    return grid;
  }
  wireRovingTabindex(grid, buttons, {
    columns: () => measureColumns(buttons),
    onEscape: () => editor.focus(),
  });
  return grid;
}

/**
 * Number of columns the grid is currently laid out in: how many buttons share
 * the first button's row (offsetTop). Measured per keypress – the grid
 * reflows between six and five columns with the panel width.
 */
function measureColumns(buttons: HTMLButtonElement[]): number {
  const firstTop = buttons[0]?.offsetTop ?? 0;
  let count = 0;
  for (const btn of buttons) {
    if (btn.offsetTop !== firstTop) break;
    count++;
  }
  return Math.max(1, count);
}

/** Build the Matrix category panel: quick sizes + the custom size picker. */
function buildMatrixPanel(editor: EditorController): DocumentFragment {
  const fragment = document.createDocumentFragment();

  const quickSizes = document.createElement('div');
  quickSizes.className = 'matrix-sizes';
  quickSizes.setAttribute('role', 'toolbar');
  quickSizes.setAttribute('aria-label', 'Matrix sizes');
  const buttons: HTMLButtonElement[] = [];
  for (const { rows, columns } of MATRIX_QUICK_SIZES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette__btn';
    btn.textContent = `${rows}×${columns}`;
    btn.setAttribute('aria-label', `Insert ${rows} by ${columns} matrix`);
    btn.tabIndex = buttons.length === 0 ? 0 : -1;
    btn.addEventListener('mousedown', (event) => event.preventDefault());
    btn.addEventListener('click', (event) =>
      insertMatrix(editor, rows, columns, event.detail !== 0),
    );
    buttons.push(btn);
    quickSizes.appendChild(btn);
  }
  wireRovingTabindex(quickSizes, buttons, { onEscape: () => editor.focus() });

  fragment.appendChild(quickSizes);
  fragment.appendChild(createMatrixSizePicker(editor));
  return fragment;
}

/** Build the tablist + tabpanels, with a dynamic "Recent" tab first. */
function buildCategoryTabs(editor: EditorController): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'palette__tabs';

  // The strip: the tablist scrolls sideways on narrow panels (wrapping into
  // rows would push the well down); a fade and chevron at the end signal
  // that more chips are off-screen.
  const strip = document.createElement('div');
  strip.className = 'palette__strip';

  const tablist = document.createElement('div');
  tablist.className = 'palette__tablist';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Symbol categories');

  const more = document.createElement('span');
  more.className = 'palette__strip-more';
  more.setAttribute('aria-hidden', 'true');
  more.textContent = '›';
  strip.append(tablist, more);

  const names = ['Recent', ...CATEGORIES.map((c) => c.name)];
  // The selected category persists per user; fall back to Recent for an
  // unknown stored name (e.g. a category renamed between versions).
  const stored = getSettings().paletteCategory;
  const resolveIndex = (name: string): number => {
    const index = names.indexOf(CATEGORY_ALIASES[name] ?? name);
    return index === -1 ? 0 : index;
  };
  const initialIndex = resolveIndex(stored);
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];

  names.forEach((name, index) => {
    const tabId = `palette-tab-${index}`;
    const panelId = `palette-panel-${index}`;
    const selected = index === initialIndex;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = tabId;
    tab.className = 'palette__tab';
    tab.textContent = name;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panelId);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tablist.appendChild(tab);
    tabs.push(tab);

    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'palette__panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabId);
    panel.hidden = !selected;

    if (name === 'Matrix') {
      panel.appendChild(buildMatrixPanel(editor));
    } else {
      const items = index === 0 ? getRecent() : CATEGORIES[index - 1]!.items;
      panel.appendChild(buildGrid(editor, items, `${name} symbols`));
    }

    panels.push(panel);
  });

  // Keep the Recent panel (index 0) in sync as symbols are used or loaded,
  // by swapping in a freshly built grid (the panel's first child).
  const refreshRecent = (): void => {
    panels[0]!.firstElementChild!.replaceWith(
      buildGrid(editor, getRecent(), 'Recent symbols'),
    );
  };
  onRecentChange(refreshRecent);
  void loadRecent(); // async; fires onRecentChange when ready

  // Overflow indicator: shown while chips extend past the strip's right
  // edge. Cheap enough to recompute on every scroll and resize.
  const syncOverflow = (): void => {
    const overflow = tablist.scrollWidth - tablist.clientWidth - tablist.scrollLeft > 1;
    strip.classList.toggle('palette__strip--more', overflow);
  };
  tablist.addEventListener('scroll', syncOverflow, { passive: true });
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(syncOverflow).observe(tablist);
  }

  const select = wireTabs(tabs, panels, {
    onSelect: (index) => {
      // Bring the chip fully into the strip (no-op when the strip wraps).
      tabs[index]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      if (getSettings().paletteCategory !== names[index]) {
        void updateSettings({ paletteCategory: names[index]! });
      }
    },
    onEscape: () => editor.focus(),
  });

  // Follow a category change from elsewhere (another editor window).
  onSettingsChange((next) => {
    const index = resolveIndex(next.paletteCategory);
    if (tabs[index]!.getAttribute('aria-selected') !== 'true') {
      select(index, false);
    }
  });

  wrap.appendChild(strip);
  for (const panel of panels) wrap.appendChild(panel);
  return wrap;
}

/**
 * ARIA tablist keyboard pattern: arrow keys move between tabs (wrapping),
 * Home/End jump to the ends, and selecting a tab reveals its panel. Activation
 * follows focus (automatic), which suits this lightweight panel. Escape
 * returns focus to the equation field. Returns the select function so the
 * caller can drive selection programmatically.
 */
function wireTabs(
  tabs: HTMLButtonElement[],
  panels: HTMLElement[],
  hooks: { onSelect?: (index: number) => void; onEscape?: () => void } = {},
): (index: number, focusTab: boolean) => void {
  const select = (index: number, focusTab: boolean): void => {
    tabs.forEach((tab, i) => {
      const isSelected = i === index;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      const panel = panels[i];
      if (panel) panel.hidden = !isSelected;
    });
    if (focusTab) tabs[index]?.focus();
    hooks.onSelect?.(index);
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index, false));
    tab.addEventListener('keydown', (event: KeyboardEvent) => {
      let target: number | null = null;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          target = (index + 1) % tabs.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          target = (index - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          target = 0;
          break;
        case 'End':
          target = tabs.length - 1;
          break;
        case 'Escape':
          if (hooks.onEscape) {
            event.preventDefault();
            hooks.onEscape();
          }
          return;
        default:
          return;
      }
      event.preventDefault();
      select(target, true);
    });
  });

  return select;
}

// The roving-tabindex helper lives in roving.ts, shared with the Library
// list; the palette grids use it with a measured column count.
