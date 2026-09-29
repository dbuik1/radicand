/**
 * Speech.
 *
 * **Primary:** Speech Rule Engine (SRE), exposing ClearSpeak and MathSpeak rule
 * sets with a verbosity control. **Fallback:** a caller-supplied function (in
 * practice MathLive's built-in spoken text), used whenever SRE has not loaded
 * or errors – so the editor is fully usable before SRE finishes.
 *
 * The string produced here is the **single source of truth** for spoken
 * output, driving the "Speak" affordance.
 *
 * Performance: SRE is heavy, so it is loaded via a dynamic `import()` and only
 * the first time speech is actually requested. SRE's English locale maps are
 * bundled locally and loaded from the extension origin – no network.
 *
 * Integration notes:
 * - The SRE surface used here is `setupEngine({ locale, domain, style,
 *   markup, json })`, `engineReady()` and `toSpeech(mathml)`.
 * - We drive SRE directly rather than via MathLive's optional global-`SRE`
 *   hook, which keeps the integration robust and decoupled.
 */
import type { Settings } from '../types';
import { assetUrl } from './runtime';

/** The SRE surface we use, from the ambient declaration in src/types. */
type SreModule = typeof import('speech-rule-engine');

/** Map our user-facing settings to SRE engine options. Exported for testing. */
export function speechEngineOptions(settings: Settings): Record<string, string> {
  const domain: string =
    settings.speechRuleSet === 'mathspeak' ? 'mathspeak' : 'clearspeak';

  // MathSpeak exposes verbosity directly as a "style": default (verbose),
  // brief (medium), super-brief (terse). ClearSpeak's verbosity is governed by
  // preferences rather than styles, so it stays on its default style; the
  // ruleset choice itself is the main lever there.
  let style = 'default';
  if (domain === 'mathspeak') {
    style =
      settings.speechVerbosity === 'terse'
        ? 'sbrief'
        : settings.speechVerbosity === 'medium'
          ? 'brief'
          : 'default';
  }

  return {
    locale: 'en',
    domain,
    style,
    markup: 'none', // plain text, ready for text-to-speech
    json: assetUrl(SRE_MATHMAPS_PATH),
  };
}

/**
 * Tidy a spoken-text string before it reaches text-to-speech.
 *
 * MathLive's fallback spoken output wraps identifiers in single quotes and
 * uppercases them (e.g. the variable `a` becomes `'A'`). Passed verbatim to the
 * Web Speech API, some voices mis-say `'A'` (e.g. as "am"/"ay") instead of
 * reading the letter. Strip those quote wrappers and collapse whitespace so
 * single letters are spoken naturally. SRE's output is already clean, so this is
 * a no-op on the primary path.
 */
export function sanitiseSpeech(text: string): string {
  return text
    .replace(/'([A-Za-z])'/g, '$1') // MathLive's quoted identifier: 'A' -> A
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rewrite text for the text-to-speech engine ONLY (never for visual output).
 * TTS voices misparse the standalone letter "a":
 * a digit before it turns it into a time ("4 a" -> "four a.m.", even with a
 * comma), and alone it is pronounced as the article ("uh"). Substituting the
 * phonetic letter name "ay" makes every occurrence unambiguous. Trade-off:
 * if a speech rule ever emits "a" as an English article it will also say
 * "ay" – acceptable, since in maths output a standalone "a" is almost always
 * the variable.
 */
export function ttsPronunciation(text: string): string {
  return text.replace(/\ba\b/g, 'ay');
}

/**
 * Extension-relative path of SRE's bundled locale maps (written there by
 * scripts/copy-mathlive-assets.mjs). One constant for both places that need
 * it – the pre-import `SREfeature` seed in {@link loadSre} and the
 * `setupEngine` options – so the two can never drift apart.
 */
const SRE_MATHMAPS_PATH = 'sre/mathmaps';

let srePromise: Promise<SreModule | null> | null = null;
let configuredKey = '';
let desired: Settings | null = null;

/** Lazily import SRE once. Resolves to `null` if the import fails. */
function loadSre(): Promise<SreModule | null> {
  if (!srePromise) {
    // SRE reads the global `SREfeature` object as its module initialises and
    // starts loading locale data immediately – before any later
    // `setupEngine({ json })` call could redirect it. Point it at the bundled
    // mathmaps BEFORE the import, so the very first fetch is served from the
    // extension itself rather than SRE's CDN default (the offline invariant;
    // caught by the packaged-extension smoke lane, tests/ext).
    (globalThis as { SREfeature?: Record<string, string> }).SREfeature = {
      json: assetUrl(SRE_MATHMAPS_PATH),
    };
    srePromise = import('speech-rule-engine')
      // Interop: the pre-built bundle may surface its API as a default export.
      .then((mod) => (mod as { default?: SreModule }).default ?? mod)
      .catch((error: unknown) => {
        console.error('Failed to load Speech Rule Engine:', error);
        return null;
      });
  }
  return srePromise;
}

/** (Re)configure the SRE engine for the given settings if needed. */
async function ensureEngine(sre: SreModule, settings: Settings): Promise<void> {
  const options = speechEngineOptions(settings);
  const key = JSON.stringify(options);
  if (key === configuredKey) return;
  await sre.setupEngine(options);
  await sre.engineReady();
  configuredKey = key;
}

/**
 * Record the desired speech settings. Safe to call before SRE has loaded; the
 * settings are applied on the next speech request (or immediately if SRE is
 * already configured).
 */
export async function configureSpeech(settings: Settings): Promise<void> {
  desired = settings;
  if (!srePromise) return; // not loaded yet; will apply lazily on first use
  const sre = await loadSre();
  if (sre) {
    try {
      await ensureEngine(sre, settings);
    } catch (error) {
      console.error('Failed to configure SRE; will use fallback speech:', error);
    }
  }
}

/**
 * Generate a spoken-text string for the given MathML.
 *
 * Tries SRE first; on any failure (not loaded, engine error) calls `fallback`
 * – MathLive's built-in spoken text – so callers always get a usable string.
 */
async function generateSpeech(
  mathml: string,
  fallback: () => string,
): Promise<string> {
  try {
    const sre = await loadSre();
    if (sre) {
      if (desired) await ensureEngine(sre, desired);
      const spoken = sanitiseSpeech(sre.toSpeech(mathml));
      if (spoken) return spoken;
    }
  } catch (error) {
    console.error('SRE speech generation failed; using fallback:', error);
  }
  return sanitiseSpeech(fallback());
}

/**
 * Whether an utterance started here is currently playing, and its change
 * subscribers – drives the single Speak/Stop-speaking toggle in the panel.
 */
let speakingNow = false;
/** The utterance whose lifecycle currently drives the speaking state – a
 * cancelled predecessor's late `end` event must not flip the state of its
 * replacement. */
let currentUtterance: SpeechSynthesisUtterance | null = null;
const speakingListeners = new Set<(speaking: boolean) => void>();

/**
 * What the engine reported for the current utterance: audio began
 * (`start`), played to the end (`end`), or could not play (`error`). A
 * user's own Stop is not reported here – the caller already knows.
 */
export type SpeechEvent = 'start' | 'end' | 'error';
const eventListeners = new Set<(event: SpeechEvent) => void>();

function setSpeaking(next: boolean): void {
  if (next === speakingNow) return;
  speakingNow = next;
  for (const listener of speakingListeners) listener(next);
}

function emitSpeechEvent(event: SpeechEvent): void {
  for (const listener of eventListeners) listener(event);
}

/**
 * Subscribe to the engine's lifecycle events for utterances started here.
 * Returns an unsubscribe function.
 */
export function onSpeechEvent(listener: (event: SpeechEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

/** Subscribe to speaking-state changes. Returns an unsubscribe function. */
export function onSpeakingChange(listener: (speaking: boolean) => void): () => void {
  speakingListeners.add(listener);
  return () => speakingListeners.delete(listener);
}

/**
 * Read an equation aloud using the browser's local speech synthesis (offline;
 * no network). Returns the spoken string so callers can also announce it.
 * Any in-progress utterance is cancelled first. Playback itself is reported
 * through {@link onSpeechEvent}; the return value only says what was sent.
 */
export async function speakAloud(
  mathml: string,
  fallback: () => string,
): Promise<string> {
  const text = await generateSpeech(mathml, fallback);
  if (!text) return text;
  if (typeof speechSynthesis === 'undefined') {
    // No engine at all: the caller asked for audio and none can play.
    emitSpeechEvent('error');
    return text;
  }

  speechSynthesis.cancel();
  // The TTS-only rewrite goes to the utterance, never to the returned text.
  const utterance = new SpeechSynthesisUtterance(ttsPronunciation(text));
  utterance.lang = 'en-GB';
  // Pin an English voice when one is available. Without this the platform may
  // fall back to a non-English default that mis-says lone letters (e.g. "a").
  const voice = preferredEnglishVoice();
  if (voice) utterance.voice = voice;
  // Track playback for the Speak toggle. `end` fires on natural completion
  // AND after cancel(); `error` covers engines that reject instead. Only the
  // current utterance may flip the state back off or report its lifecycle:
  // a cancelled predecessor's late events are dropped here.
  currentUtterance = utterance;
  const isCurrent = (): boolean => currentUtterance === utterance;
  utterance.addEventListener('start', () => {
    if (isCurrent()) emitSpeechEvent('start');
  });
  utterance.addEventListener('end', () => {
    if (!isCurrent()) return;
    setSpeaking(false);
    emitSpeechEvent('end');
  });
  utterance.addEventListener('error', (event) => {
    if (!isCurrent()) return;
    setSpeaking(false);
    // An utterance cut short by another cancel() is speech that stopped,
    // not an engine that cannot play.
    const reason = (event as SpeechSynthesisErrorEvent).error;
    emitSpeechEvent(reason === 'interrupted' || reason === 'canceled' ? 'end' : 'error');
  });
  setSpeaking(true);
  speechSynthesis.speak(utterance);
  return text;
}

/**
 * Pick a locally-installed English voice, preferring en-GB then any English.
 * Returns null if the voice list has not populated yet (it loads
 * asynchronously), in which case the utterance's `lang` still steers selection.
 */
function preferredEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ??
    null
  );
}

/** Stop any in-progress spoken output. */
export function stopSpeaking(): void {
  // Report the state change immediately: some engines fire the cancelled
  // utterance's `end` event late (or not at all).
  currentUtterance = null;
  setSpeaking(false);
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/**
 * Warm up SRE in the background after first paint, so the first real speech
 * request is fast. Failure is non-fatal – the fallback covers it.
 */
export function warmUpSpeech(settings: Settings): void {
  desired = settings;
  void loadSre().then((sre) => {
    if (sre) void ensureEngine(sre, settings).catch(() => undefined);
  });
}
