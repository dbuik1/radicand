// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  bindPart,
  bindToSettings,
  hiddenParts,
  installPartAnnouncements,
  isPartShown,
  setPart,
  showEveryPart,
} from './part-visibility';
import { INTERFACE_PARTS } from './interface-parts';
import { getSettings, updateSettings } from './settings';

const announced = (): Promise<string> =>
  new Promise((resolve) =>
    requestAnimationFrame(() => resolve(document.getElementById('sr-status')?.textContent ?? '')),
  );

const unsubscribes: (() => void)[] = [];
const track = (off: () => void): void => void unsubscribes.push(off);

describe('applying a part flag to an element', () => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="sr-status"></div>';
    await showEveryPart();
  });

  afterEach(async () => {
    while (unsubscribes.length > 0) unsubscribes.pop()?.();
    await showEveryPart();
  });

  it('takes a control out of the page, so it never holds a Tab stop unseen', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    track(bindPart('speak', button));

    expect(button.hidden).toBe(false);
    await setPart('speak', false);
    expect(button.hidden).toBe(true);
    await setPart('speak', true);
    expect(button.hidden).toBe(false);
  });

  it('leaves a heading in the accessibility tree, hidden from the screen only', async () => {
    const heading = document.createElement('h2');
    document.body.appendChild(heading);
    track(bindPart('equationHeading', heading));

    await setPart('equationHeading', false);
    expect(heading.hidden).toBe(false);
    expect(heading.classList.contains('visually-hidden')).toBe(true);
    await setPart('equationHeading', true);
    expect(heading.classList.contains('visually-hidden')).toBe(false);
  });

  it('applies the flag as it stands the moment the element is bound', async () => {
    await setPart('speak', false);
    const button = document.createElement('button');
    track(bindPart('speak', button));
    expect(button.hidden).toBe(true);
  });

  it('stops following once unbound', async () => {
    const button = document.createElement('button');
    bindPart('speak', button)();
    await setPart('speak', false);
    expect(button.hidden).toBe(false);
  });

  it('reports what is switched off, in the order Settings lists it', async () => {
    expect(hiddenParts()).toEqual([]);
    await setPart('speak', false);
    await setPart('styleMenu', false);
    expect(hiddenParts()).toEqual(['styleMenu', 'speak']);
    expect(isPartShown('speak')).toBe(false);
    expect(isPartShown('copy')).toBe(true);
  });

  it('switches one piece without disturbing the others', async () => {
    await setPart('copy', false);
    await setPart('speak', false);
    await setPart('copy', true);
    expect(isPartShown('copy')).toBe(true);
    expect(isPartShown('speak')).toBe(false);
  });

  it('brings everything back in one action', async () => {
    for (const spec of INTERFACE_PARTS) await setPart(spec.part, false);
    expect(hiddenParts().length).toBe(INTERFACE_PARTS.length);
    await showEveryPart();
    expect(hiddenParts()).toEqual([]);
  });

  it('runs a whole-row reaction now and on every change', async () => {
    const seen: boolean[] = [];
    track(bindToSettings((settings) => seen.push(settings.parts.speak)));
    await setPart('speak', false);
    expect(seen).toEqual([true, false]);
  });
});

describe('announcing what went', () => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="sr-status"></div>';
    await showEveryPart();
    while (unsubscribes.length > 0) unsubscribes.pop()?.();
    document.getElementById('sr-status')!.textContent = '';
  });

  afterEach(async () => {
    while (unsubscribes.length > 0) unsubscribes.pop()?.();
    await showEveryPart();
  });

  it('names the piece when one changes', async () => {
    track(installPartAnnouncements(() => {}));
    await setPart('speak', false);
    expect(await announced()).toBe('Speak button hidden');
    await setPart('speak', true);
    expect(await announced()).toBe('Speak button shown');
  });

  it('counts them instead when several change at once', async () => {
    track(installPartAnnouncements(() => {}));
    await updateSettings({
      parts: { ...getSettings().parts, speak: false, copy: false, source: false },
    });
    expect(await announced()).toBe('3 pieces of the interface hidden');
    await showEveryPart();
    expect(await announced()).toBe('3 pieces of the interface shown');
  });

  it('says nothing when a setting that is not a piece of interface changes', async () => {
    track(installPartAnnouncements(() => {}));
    await updateSettings({ theme: 'dark' });
    expect(await announced()).toBe('');
    await updateSettings({ theme: 'system' });
  });

  it('rescues focus into the field when what held it has just gone', async () => {
    let rescued = 0;
    track(installPartAnnouncements(() => (rescued += 1)));
    const button = document.createElement('button');
    document.body.appendChild(button);
    track(bindPart('speak', button));
    button.focus();

    await setPart('speak', false);
    button.blur();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(rescued).toBe(1);
  });

  it('leaves focus where it is when it survived the change', async () => {
    let rescued = 0;
    track(installPartAnnouncements(() => (rescued += 1)));
    const keep = document.createElement('button');
    document.body.appendChild(keep);
    keep.focus();

    await setPart('speak', false);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(rescued).toBe(0);
  });
});
