/**
 * Settings view.
 *
 * Renders the settings controls and applies changes live. The settings *data*
 * lives in settings.ts; this module is the view that reads/writes it.
 * Painting the appearance onto the document is appearance.ts's job, and the
 * keyboard shortcut reference is shortcuts-view.ts's – Settings holds
 * preferences only.
 *
 * The form is chunked into labelled fieldsets – Interface / Appearance /
 * Editing / Speech – with labels above full-width controls, the one position that
 * never truncates at 320px. Every control is a native form element with an
 * associated `<label>`, so it is keyboard-operable and correctly named for
 * assistive tech (WCAG 4.1.2). The form is the body of the workspace's
 * Settings mode (More ▾ › Settings); the starter-pack toggle lives with the
 * other library tools.
 */
import type { InterfacePartSpec } from './interface-parts';
import { INTERFACE_PARTS } from './interface-parts';
import { hiddenParts, setPart, showEveryPart } from './part-visibility';
import type { Settings, Theme, SpeechRuleSet, SpeechVerbosity } from '../types';
import { getSettings, updateSettings, onSettingsChange } from './settings';
import { configureSpeech } from './speech';
import { announce } from './a11y';

/**
 * Discrete font-size multipliers offered to the user. The multiplier maps the
 * 18px root: Small 16 · Medium 18 · Large 20 · Larger 22 · Largest 24 px.
 */
const FONT_SCALES: { label: string; value: number }[] = [
  { label: 'Small', value: 16 / 18 },
  { label: 'Medium', value: 1 },
  { label: 'Large', value: 20 / 18 },
  { label: 'Larger', value: 22 / 18 },
  { label: 'Largest', value: 24 / 18 },
];

interface SelectOption<T> {
  label: string;
  value: T;
}

/** Build a labelled `<select>` and wire its change handler. */
function labelledSelect<T extends string>(
  id: string,
  labelText: string,
  options: SelectOption<T>[],
  selected: T,
  onChange: (value: T) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.className = 'field__label';
  label.textContent = labelText;

  const select = document.createElement('select');
  select.id = id;
  select.className = 'field__control';
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    if (option.value === selected) el.selected = true;
    select.appendChild(el);
  }
  select.addEventListener('change', () => onChange(select.value as T));

  wrap.append(label, select);
  return wrap;
}

/** A labelled fieldset grouping related settings. */
function group(legendText: string, ...children: HTMLElement[]): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'settings__group';

  const legend = document.createElement('legend');
  legend.className = 'settings__legend';
  legend.textContent = legendText;
  fieldset.appendChild(legend);

  fieldset.append(...children);
  return fieldset;
}

/**
 * "Equation size" control: a slider AND a typeable number input (as a
 * percentage), kept in sync – the number input is the required non-drag path
 * (SC 2.5.7). It resizes ONLY the equation text (via --equation-scale), not
 * the rest of the interface, and applies live.
 *
 * Accessibility: a labelled group; the number input has a visible `<label>`
 * and the slider an `aria-label`; both are keyboard-operable and report
 * their value. An out-of-range typed value shows a visible message alongside
 * the danger border – never colour alone.
 */
function createEquationSizeControl(): HTMLElement {
  const MIN = 50;
  const MAX = 300;
  const toPct = (scale: number): number =>
    Math.min(MAX, Math.max(MIN, Math.round(scale * 100)));

  const wrap = document.createElement('div');
  wrap.className = 'eq-size';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-labelledby', 'eq-size-label');

  const label = document.createElement('label');
  label.id = 'eq-size-label';
  label.htmlFor = 'eq-size-number';
  label.className = 'eq-size__label';
  label.textContent = 'Equation size';

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'eq-size__range';
  range.min = String(MIN);
  range.max = String(MAX);
  range.step = '5';
  range.setAttribute('aria-label', 'Equation size (per cent)');

  const number = document.createElement('input');
  number.type = 'number';
  number.id = 'eq-size-number';
  number.className = 'eq-size__number';
  number.min = String(MIN);
  number.max = String(MAX);
  number.step = '5';
  number.setAttribute('aria-describedby', 'eq-size-error');
  // Named by the visible "Equation size" label via htmlFor – no aria-label,
  // which would override that association with a near-duplicate.

  const unit = document.createElement('span');
  unit.className = 'eq-size__unit';
  unit.setAttribute('aria-hidden', 'true');
  unit.textContent = '%';

  const error = document.createElement('span');
  error.className = 'field__error';
  error.id = 'eq-size-error';
  error.hidden = true;
  error.textContent = `Enter a size between ${MIN} and ${MAX}%.`;

  const setInvalid = (invalid: boolean): void => {
    error.hidden = !invalid;
    number.classList.toggle('field__control--invalid', invalid);
    number.setAttribute('aria-invalid', String(invalid));
  };

  const render = (pct: number): void => {
    const v = String(pct);
    if (range.value !== v) range.value = v;
    if (number.value !== v) number.value = v;
    // Accent fill of the track up to the thumb (see .eq-size__range in CSS).
    range.style.setProperty('--slider-fill', `${((pct - MIN) / (MAX - MIN)) * 100}%`);
  };

  const apply = (pct: number): void => {
    const clamped = Math.min(MAX, Math.max(MIN, pct));
    const equationScale = clamped / 100;
    render(clamped);
    void updateSettings({ equationScale });
  };

  range.addEventListener('input', () => apply(Number(range.value)));
  // Update on each keystroke for the slider feel, but clamp/normalise on commit.
  number.addEventListener('input', () => {
    const n = Number(number.value);
    if (Number.isFinite(n) && n >= MIN && n <= MAX) {
      setInvalid(false);
      apply(n);
    } else {
      setInvalid(number.value.trim() !== '');
    }
  });
  number.addEventListener('change', () => {
    setInvalid(false);
    apply(Number(number.value) || 100);
  });

  onSettingsChange((settings) => render(toPct(settings.equationScale)));
  render(toPct(getSettings().equationScale));

  wrap.append(label, range, number, unit, error);
  return wrap;
}

/**
 * One checkbox per piece of interface, built from the part table – there is
 * no list of pieces here to fall out of step with the panel.
 *
 * The checkbox is the plain control-then-label-then-hint row the rest of the
 * form uses, and it says nothing when it changes: the announcement belongs to
 * the panel the piece left (see installPartAnnouncements), which speaks once
 * however the change arrived.
 */
function buildPartField(spec: InterfacePartSpec, shown: boolean): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field field--checkbox';

  const id = `set-part-${spec.part}`;
  const hintId = `${id}-hint`;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.className = 'field__checkbox';
  input.checked = shown;
  input.setAttribute('aria-describedby', hintId);
  input.addEventListener('change', () => {
    void setPart(spec.part, input.checked);
  });

  const labelWrap = document.createElement('div');
  const label = document.createElement('label');
  label.htmlFor = id;
  label.className = 'field__label field__label--checkbox';
  label.textContent = spec.label;

  const hint = document.createElement('span');
  hint.id = hintId;
  hint.className = 'field__hint';
  hint.textContent = spec.hint;

  const row = document.createElement('div');
  row.className = 'field__row';
  labelWrap.append(label, hint);
  row.append(input, labelWrap);
  wrap.append(row);
  return wrap;
}

/**
 * The Interface group: what the panel shows around the equation field. The
 * field is not in it – it is the one thing that is always there – so the
 * group can be emptied completely and the editor still works, by keyboard as
 * much as by pointer.
 *
 * "Show every piece" is the way back from that state in one action, and is
 * inert while nothing is hidden rather than absent, so the group reads the
 * same whichever state it is in.
 */
function buildInterfaceGroup(settings: Settings): HTMLElement {
  const restore = document.createElement('button');
  restore.type = 'button';
  restore.id = 'set-parts-restore';
  restore.className = 'btn btn--secondary';
  restore.textContent = 'Show every piece';
  restore.disabled = hiddenParts(settings).length === 0;
  restore.addEventListener('click', () => {
    void showEveryPart();
  });

  const actions = document.createElement('div');
  actions.className = 'field';
  actions.appendChild(restore);

  return group(
    'Interface',
    ...INTERFACE_PARTS.map((spec) => buildPartField(spec, settings.parts[spec.part])),
    actions,
  );
}

/** Render the settings form (the body of the Settings mode). */
export function createSettingsView(): HTMLElement {
  const settings = getSettings();

  const form = document.createElement('div');
  form.className = 'settings__form';

  // --- Interface ---
  form.appendChild(buildInterfaceGroup(settings));

  // --- Appearance ---
  const currentScale =
    FONT_SCALES.find((s) => s.value === settings.fontScale)?.value ?? 1;
  form.appendChild(
    group(
      'Appearance',
      labelledSelect<Theme>(
        'set-theme',
        'Theme',
        [
          { label: 'System', value: 'system' },
          { label: 'Light', value: 'light' },
          { label: 'Dark', value: 'dark' },
          { label: 'High contrast', value: 'high-contrast' },
        ],
        settings.theme,
        (theme) => {
          void updateSettings({ theme });
          announce(`Theme set to ${theme.replace('-', ' ')}`);
        },
      ),
      labelledSelect<string>(
        'set-fontsize',
        'Font size',
        FONT_SCALES.map((s) => ({ label: s.label, value: String(s.value) })),
        String(currentScale),
        (value) => {
          const fontScale = Number(value);
          void updateSettings({ fontScale });
          const name = FONT_SCALES.find((s) => s.value === fontScale)?.label ?? value;
          announce(`Font size set to ${name.toLowerCase()}`);
        },
      ),
      createEquationSizeControl(),
    ),
  );

  // --- Editing ---
  form.appendChild(
    group(
      'Editing',
      buildCommandDelayField(settings.commandDelay),
      buildSlashFractionField(settings.slashFraction),
      buildAutoFitField(settings.autoFit),
      buildTidyBracketsField(settings.tidyBrackets),
    ),
  );

  // --- Speech ---
  form.appendChild(
    group(
      'Speech',
      labelledSelect<SpeechRuleSet>(
        'set-ruleset',
        'Speech rule set',
        [
          { label: 'ClearSpeak', value: 'clearspeak' },
          { label: 'MathSpeak', value: 'mathspeak' },
        ],
        settings.speechRuleSet,
        (speechRuleSet) => {
          void updateSettings({ speechRuleSet });
          void configureSpeech({ ...getSettings(), speechRuleSet });
          announce(
            `Speech rule set changed to ${speechRuleSet === 'mathspeak' ? 'MathSpeak' : 'ClearSpeak'}`,
          );
        },
      ),
      labelledSelect<SpeechVerbosity>(
        'set-verbosity',
        'Speech verbosity',
        [
          { label: 'Terse', value: 'terse' },
          { label: 'Medium', value: 'medium' },
          { label: 'Verbose', value: 'verbose' },
        ],
        settings.speechVerbosity,
        (speechVerbosity) => {
          void updateSettings({ speechVerbosity });
          void configureSpeech({ ...getSettings(), speechVerbosity });
          announce(`Speech verbosity set to ${speechVerbosity}`);
        },
      ),
    ),
  );

  // Display and copy formats are chosen inline (the "Show as" and "Copy as"
  // selects), so they are not duplicated here.

  // Keep the form's controls in sync if settings change elsewhere (e.g. a
  // second editor window, arriving via chrome.storage.onChanged).
  onSettingsChange((next) => syncControls(form, next));

  return form;
}

/** A labelled number input for the `\`-command auto-accept / auto-box delay. */
function buildCommandDelayField(value: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const label = document.createElement('label');
  label.htmlFor = 'set-command-delay';
  label.className = 'field__label';
  label.textContent = 'Autocomplete delay';

  const row = document.createElement('div');
  row.className = 'field__row';

  const input = document.createElement('input');
  input.type = 'number';
  input.id = 'set-command-delay';
  input.className = 'field__control field__control--number';
  input.min = '0';
  input.max = '1000';
  input.step = '50';
  input.value = String(value);
  input.setAttribute('aria-describedby', 'set-command-delay-hint');
  input.addEventListener('change', () => {
    const next = Math.max(0, Math.min(1000, Number(input.value) || 0));
    input.value = String(next);
    void updateSettings({ commandDelay: next });
    announce(`Autocomplete delay set to ${next} milliseconds`);
  });

  const unit = document.createElement('span');
  unit.className = 'field__unit';
  unit.textContent = 'ms';

  row.append(input, unit);

  const hint = document.createElement('span');
  hint.id = 'set-command-delay-hint';
  hint.className = 'field__hint';
  hint.textContent =
    'How long to wait after a typed \\command before its placeholders fill in';

  wrap.append(label, row, hint);
  return wrap;
}

/**
 * A labelled checkbox for whether typing `/` builds a fraction. Styled as a
 * control-then-label row (the conventional native checkbox layout), so it
 * sits consistently with the rest of the form. It is a real
 * `<input type="checkbox">` – no div standing in for a control – so it keeps
 * native keyboard operation, `:checked` state, and forced-colors support for
 * free.
 */
function buildSlashFractionField(value: boolean): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field field--checkbox';

  const row = document.createElement('div');
  row.className = 'field__row';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'set-slash-fraction';
  input.className = 'field__checkbox';
  input.checked = value;
  input.setAttribute('aria-describedby', 'set-slash-fraction-hint');
  input.addEventListener('change', () => {
    void updateSettings({ slashFraction: input.checked });
    announce(input.checked ? 'Slash inserts a fraction' : 'Slash types a plain slash');
  });

  // Label follows the checkbox (the common native-control convention); it is
  // still the whole clickable target via `htmlFor`.
  const labelWrap = document.createElement('div');
  const label = document.createElement('label');
  label.htmlFor = 'set-slash-fraction';
  label.className = 'field__label field__label--checkbox';
  label.textContent = 'Typing / inserts a fraction';

  const hint = document.createElement('span');
  hint.id = 'set-slash-fraction-hint';
  hint.className = 'field__hint';
  hint.textContent =
    'When off, / types a plain slash';

  labelWrap.append(label, hint);
  row.append(input, labelWrap);
  wrap.append(row);
  return wrap;
}

/**
 * A labelled checkbox for the "autoFit" setting: shrink (never enlarge) a
 * large equation so it fits the field's width, e.g. a big matrix that would
 * otherwise overflow. Same accessible control-then-label-then-hint pattern as
 * {@link buildSlashFractionField} – a real checkbox, sized to the 24px target.
 */
function buildAutoFitField(value: boolean): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field field--checkbox';

  const row = document.createElement('div');
  row.className = 'field__row';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'set-auto-fit';
  input.className = 'field__checkbox';
  input.checked = value;
  input.setAttribute('aria-describedby', 'set-auto-fit-hint');
  input.addEventListener('change', () => {
    void updateSettings({ autoFit: input.checked });
    announce(input.checked ? 'Large equations will shrink to fit' : 'Large equations will no longer shrink to fit');
  });

  const labelWrap = document.createElement('div');
  const label = document.createElement('label');
  label.htmlFor = 'set-auto-fit';
  label.className = 'field__label field__label--checkbox';
  label.textContent = 'Automatically shrink large equations to fit';

  const hint = document.createElement('span');
  hint.id = 'set-auto-fit-hint';
  hint.className = 'field__hint';
  hint.textContent = 'Shrinks to the panel width, never enlarges';

  labelWrap.append(label, hint);
  row.append(input, labelWrap);
  wrap.append(row);
  return wrap;
}

/**
 * A labelled checkbox for the "tidyBrackets" setting: strip `\left`/`\right`
 * from copied LaTeX where a plain bracket serves equally well (latex-clean.ts).
 * Same pattern as {@link buildAutoFitField}.
 */
function buildTidyBracketsField(value: boolean): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field field--checkbox';

  const row = document.createElement('div');
  row.className = 'field__row';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'set-tidy-brackets';
  input.className = 'field__checkbox';
  input.checked = value;
  input.setAttribute('aria-describedby', 'set-tidy-brackets-hint');
  input.addEventListener('change', () => {
    void updateSettings({ tidyBrackets: input.checked });
    announce(
      input.checked
        ? 'Copied LaTeX will use plain brackets where possible'
        : 'Copied LaTeX will keep growing brackets',
    );
  });

  const labelWrap = document.createElement('div');
  const label = document.createElement('label');
  label.htmlFor = 'set-tidy-brackets';
  label.className = 'field__label field__label--checkbox';
  label.textContent = 'Tidy brackets in copied LaTeX';

  const hint = document.createElement('span');
  hint.id = 'set-tidy-brackets-hint';
  hint.className = 'field__hint';
  hint.textContent =
    'Plain brackets replace \\left( … \\right) when copying, except around tall content';

  labelWrap.append(label, hint);
  row.append(input, labelWrap);
  wrap.append(row);
  return wrap;
}

/** Reflect the latest settings onto the view's controls. */
function syncControls(root: HTMLElement, settings: Settings): void {
  const set = (id: string, value: string): void => {
    const el = root.querySelector<HTMLSelectElement | HTMLInputElement>(`#${id}`);
    if (!el) return;
    // A <select> can't show a value outside its options (e.g. a font scale
    // restored from storage that this build no longer offers) – leave it
    // rather than blanking it.
    if (el instanceof HTMLSelectElement) {
      const known = Array.from(el.options).some((o) => o.value === value);
      if (!known) return;
    }
    if (el.value !== value) el.value = value;
  };
  set('set-theme', settings.theme);
  set('set-fontsize', String(settings.fontScale));
  set('set-command-delay', String(settings.commandDelay));
  set('set-ruleset', settings.speechRuleSet);
  set('set-verbosity', settings.speechVerbosity);

  // Sync checkbox controls (which use `.checked`, not `.value`)
  const slash = root.querySelector<HTMLInputElement>('#set-slash-fraction');
  if (slash && slash.checked !== settings.slashFraction) slash.checked = settings.slashFraction;
  const autoFit = root.querySelector<HTMLInputElement>('#set-auto-fit');
  if (autoFit && autoFit.checked !== settings.autoFit) autoFit.checked = settings.autoFit;
  const tidy = root.querySelector<HTMLInputElement>('#set-tidy-brackets');
  if (tidy && tidy.checked !== settings.tidyBrackets) tidy.checked = settings.tidyBrackets;

  // The interface checkboxes, and the button that undoes all of them at once.
  for (const spec of INTERFACE_PARTS) {
    const box = root.querySelector<HTMLInputElement>(`#set-part-${spec.part}`);
    const shown = settings.parts[spec.part];
    if (box && box.checked !== shown) box.checked = shown;
  }
  const restore = root.querySelector<HTMLButtonElement>('#set-parts-restore');
  if (restore) restore.disabled = hiddenParts(settings).length === 0;
}
