/**
 * Autocomplete for typed `\`-commands: watch the letters typed after a `\`
 * and confirm the command as soon as it unambiguously matches a known name,
 * so the user need not press space, Tab or Enter.
 */
import type { MathfieldElement } from 'mathlive';
import { getSettings } from '../settings';
import autoAcceptIndex from '../../assets/auto-accept-index.json';
import { STYLE_COMMANDS } from './styling';
import { readTypedCommand } from './typed-command';

/**
 * A command completes by itself only when no longer command starts with it:
 * finishing `\le` on the spot would take `\leq`, `\left` and `\lessgtr` away
 * from someone still typing them. The names that qualify are generated from
 * MathLive's full command list (scripts/auto-accept-map.mjs), so the map
 * cannot drift from what the editor can parse; every other command simply
 * needs space, Tab or Enter to confirm.
 */
const AUTO_ACCEPT_COMMANDS: ReadonlySet<string> = new Set(autoAcceptIndex.names);

/**
 * Every command the tracker follows, auto-accepting or not: the buffer must
 * survive the letters of an ambiguous name (`le` on the way to `leq`) so a
 * confirm key still finds it.
 */
const TRACKED_COMMANDS: readonly string[] = [
  ...autoAcceptIndex.names,
  ...Object.keys(autoAcceptIndex.ambiguous),
];

/**
 * Library-trigger hooks. Triggers live in a lane of their own: confirmed
 * with space/Tab/Enter, NEVER auto-accepted – so a trigger cannot shadow
 * a real command by construction, and a strict prefix of a real command
 * is harmless.
 */
export interface TriggerHooks {
  /** Whether any trigger starts with `prefix` (keeps the buffer alive). */
  isPrefix(prefix: string): boolean;
  /**
   * Confirm `name` as a trigger. Returns true when it WAS one and was
   * handled (the caller then swallows the confirm key); false lets the
   * key fall through to MathLive untouched.
   */
  accept(name: string): boolean;
}

/**
 * Auto-accept a `\`-command without needing to press space: track the letters
 * typed after a `\`, and when they exactly and unambiguously match a known
 * command, confirm it. Gated on a leading `\` so ordinary letter sequences are
 * never affected. Debounced, so the user can instead keep typing (e.g. `\sqrt{`
 * to edit the radicand raw) – any non-letter key cancels the pending accept.
 *
 * `onAccept` runs right after the command is confirmed so a structure command
 * can be boxed into its placeholder template in the same step. Doing the boxing
 * here (rather than relying on the `input`-driven debounce alone) is what makes
 * placeholders appear even with a zero autocomplete delay: at zero delay the
 * `accept-all` and the boxing debounce would otherwise race, and the synthetic
 * `input` from `accept-all` could cancel the pending box before it ran.
 *
 * The one listener also watches for `triggers` (no second listener over
 * the same buffer): a confirm key on a fully typed trigger is swallowed
 * BEFORE MathLive sees it – the listener runs in the capture phase, so
 * stopping propagation keeps the key from ever reaching the field – and
 * the trigger's saved body is inserted instead.
 */
export function installCommandAutoAccept(
  mf: MathfieldElement,
  onAccept: () => void,
  onStyleCommand: (name: string) => void,
  triggers?: TriggerHooks,
): void {
  let buffer: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  // A STYLE command is never committed: committed bare it becomes an
  // offset-less husk that cannot be selected away and poisons a
  // subsequently armed style. Reject the latex-mode text instead
  // (restoring the field exactly as it was) and hand the name to the
  // style handler, which arms or toggles it the word-processor way.
  const applyStyleName = (name: string): void => {
    mf.executeCommand(['complete', 'reject']);
    onStyleCommand(name);
  };

  // Follow the command as it now reads; complete it after the delay when
  // it exactly and uniquely names an auto-accept command.
  const track = (next: string): void => {
    const tracked = TRACKED_COMMANDS.some((command) => command.startsWith(next));
    // A live trigger prefix keeps the buffer alive too – a trigger longer
    // than an auto-accept command (\sums beside \sum) must survive the
    // letters past the command.
    const triggerLive = triggers?.isPrefix(next) === true;
    buffer = tracked || triggerLive ? next : null;
    // A trigger that is, or extends, the typed name keeps the command
    // waiting for a confirm key: it must never be completed out from under it.
    if (AUTO_ACCEPT_COMMANDS.has(next) && !triggerLive) {
      // Defer so MathLive registers this keystroke first, and so a following
      // keystroke (e.g. `{`) can cancel and keep raw editing.
      timer = setTimeout(() => {
        const name = buffer;
        buffer = null;
        if (name && STYLE_COMMANDS[name] && mf.mode === 'latex') {
          applyStyleName(name);
          return;
        }
        if (mf.mode === 'latex') mf.executeCommand(['complete', 'accept-all']);
        onAccept();
      }, getSettings().commandDelay);
    }
  };

  // Belt-and-braces: if the field leaves 'latex' mode by some path other than
  // this timer's own `accept-all` (e.g. MathLive completing the command itself
  // on Enter, possibly before this keydown listener even runs), cancel any
  // pending accept so `onAccept()` never fires against a command MathLive
  // has already fully committed.
  mf.addEventListener('mode-change', () => {
    if (mf.mode !== 'latex') cancel();
  });

  // Deleting inside a command ends the letter-by-letter tracking, so the
  // command is read back from the field once the deletion has happened:
  // `\sqrtt` then Backspace completes `\sqrt` like typing it straight.
  mf.addEventListener('keyup', (event: KeyboardEvent) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    const typed = readTypedCommand(mf);
    if (typed === null) return;
    cancel();
    track(typed);
  });

  // Capture phase: the host sees the key before MathLive's internal
  // keyboard sink does, which is what lets a trigger's confirm key be
  // swallowed cleanly. The tracking logic is order-insensitive (it always
  // deferred its accept), so the phase change is behaviour-neutral for it.
  mf.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      // A pure modifier press is not input: pressing Shift for a capital letter
      // (e.g. the D of `\Delta`) must neither cancel a pending accept nor reset
      // the buffer – otherwise no capitalised command could ever auto-accept.
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      cancel();
      if (event.key === '\\') {
        buffer = '';
        return;
      }
      if (buffer === null) return;

      const isLetter =
        event.key.length === 1 &&
        /[a-zA-Z]/.test(event.key) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey; // a shortcut chord (Ctrl+Z, …) is not typed input
      if (!isLetter) {
        const pending = buffer;
        buffer = null; // space, `{`, backspace, arrows, shortcuts, … → stop tracking
        const confirms = event.key === ' ' || event.key === 'Tab' || event.key === 'Enter';
        // A style command that is a prefix of a longer one (\mathbf beside
        // \mathbfit) is confirmed by key, and takes the style path too.
        if (
          pending !== '' &&
          confirms &&
          STYLE_COMMANDS[pending] !== undefined &&
          !AUTO_ACCEPT_COMMANDS.has(pending) &&
          mf.mode === 'latex'
        ) {
          event.preventDefault();
          event.stopPropagation();
          applyStyleName(pending);
          return;
        }
        // A confirm key on a fully typed trigger inserts its saved body.
        if (
          triggers !== undefined &&
          pending !== '' &&
          confirms &&
          mf.mode === 'latex' &&
          triggers.accept(pending)
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      track(buffer + event.key);
    },
    { capture: true },
  );
}
