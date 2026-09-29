/**
 * Zone B: the actions bar directly under the equation field – the split Copy
 * button, Speak and Save to library. It stays put with the field while the
 * workspace scrolls, so the actions are on screen whenever the equation is.
 * Copy is the one primary (accent) action in the panel, and the largest;
 * the others are secondary.
 *
 * The bar is one ARIA toolbar and one Tab stop: Tab from the field lands on
 * it and the next Tab goes on to the workspace, so the symbol search is no
 * further from the field than before; Left/Right, Home and End move between
 * the actions.
 *
 * Each of the three is a piece of interface the user can switch off, and the
 * bar itself goes once all three are off, taking its top border with it – an
 * empty band across the foot of the panel would be exactly the clutter the
 * toggles exist to remove. Copy's caption goes with the Copy button, since
 * it is that button's confirmation line; Alt+C still copies with the button
 * gone, and says so through the live region.
 */
import { announce } from './a11y';
import type { EditorController } from './editor';
import { createCopyControls, createCopyStatus } from './output';
import { bindPart, bindToSettings, isPartShown } from './part-visibility';
import { onSpeakingChange, onSpeechEvent, speakAloud, stopSpeaking } from './speech';

export function createActionsBar(editor: EditorController, saveButton: HTMLElement): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'actions-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Equation actions');

  const copyControls = createCopyControls(editor);
  bindPart('copy', copyControls);

  // Speak is a single toggle: the label swaps to "Stop speaking" while
  // speech plays – same position, so the stop target is where focus already
  // is – rather than a permanently inert Stop button. The swapped label is
  // the one state signal; an `aria-pressed` on top of it would read as
  // "Stop speaking, pressed", stating the state twice.
  const speakBtn = document.createElement('button');
  speakBtn.type = 'button';
  speakBtn.className = 'btn btn--secondary';
  speakBtn.textContent = 'Speak';
  bindPart('speak', speakBtn);
  let speaking = false;
  speakBtn.addEventListener('click', () => {
    if (speaking) {
      stopSpeaking();
      announce('Speech stopped');
      return;
    }
    if (editor.isEmpty()) {
      announce('Nothing to speak. The equation is empty.', 'assertive');
      return;
    }
    void speakAloud(editor.getValue('mathml'), () => editor.getSpokenText());
  });
  onSpeakingChange((next) => {
    speaking = next;
    speakBtn.textContent = next ? 'Stop speaking' : 'Speak';
  });
  // Announced from the engine's own events, so "Speaking equation" means
  // audio is playing, not merely requested, and a failed or finished
  // utterance is heard rather than only seen as the label swapping back.
  onSpeechEvent((event) => {
    if (event === 'start') announce('Speaking equation');
    else if (event === 'end') announce('Finished speaking');
    else announce('Speech could not play on this device.', 'assertive');
  });

  bindPart('saveToLibrary', saveButton);

  const status = createCopyStatus(editor);
  bindPart('copy', status);

  bar.append(copyControls, speakBtn, saveButton, status);

  const buttons = [
    ...copyControls.querySelectorAll<HTMLButtonElement>(':scope > button, .menu > button'),
    speakBtn,
    saveButton,
  ].filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);
  const roving = wireToolbar(bar, buttons);

  bindToSettings(() => {
    const empty =
      !isPartShown('copy') && !isPartShown('speak') && !isPartShown('saveToLibrary');
    bar.hidden = empty;
    roving.refresh();
  });

  return bar;
}

/**
 * Roving tabindex over the toolbar's buttons, skipping any switched off in
 * Settings. Only the buttons' own keydowns are handled, so the arrow keys
 * inside the open Copy format menu stay the menu's.
 */
function wireToolbar(bar: HTMLElement, buttons: HTMLButtonElement[]): { refresh: () => void } {
  let active: HTMLButtonElement | undefined = buttons[0];
  const shown = (): HTMLButtonElement[] =>
    buttons.filter((button) => button.closest('[hidden]') === null && !button.hidden);
  const setActive = (next: HTMLButtonElement | undefined): void => {
    active = next;
    for (const button of buttons) button.tabIndex = button === next ? 0 : -1;
  };
  const refresh = (): void => {
    const visible = shown();
    setActive(active && visible.includes(active) ? active : visible[0]);
  };

  bar.addEventListener('keydown', (event: KeyboardEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !buttons.includes(target)) return;
    const visible = shown();
    const index = visible.indexOf(target);
    let next: HTMLButtonElement | undefined;
    if (event.key === 'ArrowRight') next = visible[(index + 1) % visible.length];
    else if (event.key === 'ArrowLeft') next = visible[(index - 1 + visible.length) % visible.length];
    else if (event.key === 'Home') next = visible[0];
    else if (event.key === 'End') next = visible[visible.length - 1];
    if (!next) return;
    event.preventDefault();
    setActive(next);
    next.focus();
  });
  for (const button of buttons) button.addEventListener('focus', () => setActive(button));

  refresh();
  return { refresh };
}
