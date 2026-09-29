import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  onSpeakingChange,
  onSpeechEvent,
  sanitiseSpeech,
  speakAloud,
  speechEngineOptions,
  stopSpeaking,
  ttsPronunciation,
  type SpeechEvent,
} from './speech';

// Speech generation is exercised elsewhere; here the engine module is
// unavailable so every request falls back to the caller's spoken text.
vi.mock('speech-rule-engine', () => {
  throw new Error('unavailable in this test');
});
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from '../types';

const base: Settings = { ...DEFAULT_SETTINGS };

describe('speechEngineOptions', () => {
  it('uses the clearspeak domain with default style', () => {
    const o = speechEngineOptions({ ...base, speechRuleSet: 'clearspeak' });
    expect(o.domain).toBe('clearspeak');
    expect(o.style).toBe('default');
    expect(o.locale).toBe('en');
    expect(o.markup).toBe('none');
  });

  it('maps mathspeak verbosity to SRE styles', () => {
    const terse = speechEngineOptions({
      ...base,
      speechRuleSet: 'mathspeak',
      speechVerbosity: 'terse',
    });
    const medium = speechEngineOptions({
      ...base,
      speechRuleSet: 'mathspeak',
      speechVerbosity: 'medium',
    });
    const verbose = speechEngineOptions({
      ...base,
      speechRuleSet: 'mathspeak',
      speechVerbosity: 'verbose',
    });
    expect(terse.style).toBe('sbrief');
    expect(medium.style).toBe('brief');
    expect(verbose.style).toBe('default');
    expect(terse.domain).toBe('mathspeak');
  });
});

describe('sanitiseSpeech', () => {
  it("strips MathLive's quoted, uppercased identifiers so a lone letter reads naturally", () => {
    // MathLive's fallback spoken form of the variable `a`.
    expect(sanitiseSpeech(" 'A'")).toBe('A');
    expect(sanitiseSpeech(" 'A' plus 'B'")).toBe('A plus B');
  });

  it('collapses whitespace and trims', () => {
    expect(sanitiseSpeech('  a   plus  b ')).toBe('a plus b');
  });

  it('leaves clean SRE output unchanged', () => {
    expect(sanitiseSpeech('a plus b')).toBe('a plus b');
    expect(sanitiseSpeech('the fraction with numerator 1')).toBe(
      'the fraction with numerator 1',
    );
  });

  it('does not modify standalone "a" (TTS pronunciation layer handles it separately)', () => {
    expect(sanitiseSpeech('4 a c')).toBe('4 a c');
    expect(sanitiseSpeech('a c')).toBe('a c');
    expect(sanitiseSpeech('a')).toBe('a');
    expect(sanitiseSpeech('b squared minus 4 a c')).toBe('b squared minus 4 a c');
  });
});

describe('ttsPronunciation', () => {
  it('replaces standalone "a" with "ay" to avoid TTS misreading', () => {
    expect(ttsPronunciation('4 a c')).toBe('4 ay c');
    expect(ttsPronunciation('a')).toBe('ay');
    expect(ttsPronunciation('a plus b')).toBe('ay plus b');
    expect(ttsPronunciation('4 a m')).toBe('4 ay m');
  });

  it('does not replace "a" inside words', () => {
    expect(ttsPronunciation('am')).toBe('am');
    expect(ttsPronunciation('alpha')).toBe('alpha');
  });

  it('does not replace capital "A"', () => {
    expect(ttsPronunciation('A plus b')).toBe('A plus b');
  });

  it('handles mixed cases correctly', () => {
    expect(ttsPronunciation('b squared minus 4 a c')).toBe('b squared minus 4 ay c');
  });
});

/**
 * Playback lifecycle against a stubbed engine: the Speak toggle follows the
 * utterance, and audio starting, finishing and failing are each reported so
 * the panel can say what happened rather than what was requested.
 */
describe('speakAloud lifecycle', () => {
  type Handler = (event?: unknown) => void;
  let utterances: FakeUtterance[] = [];

  class FakeUtterance {
    text: string;
    lang = '';
    voice: unknown = null;
    private handlers = new Map<string, Handler[]>();
    constructor(text: string) {
      this.text = text;
    }
    addEventListener(type: string, handler: Handler): void {
      this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
    }
    fire(type: string, event?: unknown): void {
      for (const handler of this.handlers.get(type) ?? []) handler(event);
    }
  }

  const speak = () => speakAloud('<math><mi>x</mi></math>', () => 'x');

  beforeEach(() => {
    utterances = [];
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: () => [],
      speak: (utterance: FakeUtterance) => utterances.push(utterance),
    });
  });

  afterEach(() => {
    stopSpeaking();
    vi.unstubAllGlobals();
  });

  it('reports start and end, and turns the toggle off when playback ends', async () => {
    const events: SpeechEvent[] = [];
    const states: boolean[] = [];
    const stopEvents = onSpeechEvent((event) => events.push(event));
    const stopStates = onSpeakingChange((speaking) => states.push(speaking));
    await speak();
    expect(states).toEqual([true]);
    expect(events).toEqual([]); // requested, not yet playing
    utterances[0]!.fire('start');
    expect(events).toEqual(['start']);
    utterances[0]!.fire('end');
    expect(events).toEqual(['start', 'end']);
    expect(states).toEqual([true, false]);
    stopEvents();
    stopStates();
  });

  it('reports an engine failure as an error, distinct from a normal end', async () => {
    const events: SpeechEvent[] = [];
    const states: boolean[] = [];
    const stopEvents = onSpeechEvent((event) => events.push(event));
    const stopStates = onSpeakingChange((speaking) => states.push(speaking));
    await speak();
    utterances[0]!.fire('error', { error: 'synthesis-failed' });
    expect(events).toEqual(['error']);
    expect(states).toEqual([true, false]);
    stopEvents();
    stopStates();
  });

  it('treats an interrupted utterance as speech that ended, not a failure', async () => {
    const events: SpeechEvent[] = [];
    const stop = onSpeechEvent((event) => events.push(event));
    await speak();
    utterances[0]!.fire('error', { error: 'interrupted' });
    expect(events).toEqual(['end']);
    stop();
  });

  it('ignores the late events of an utterance the user has stopped', async () => {
    const events: SpeechEvent[] = [];
    const stop = onSpeechEvent((event) => events.push(event));
    await speak();
    stopSpeaking();
    utterances[0]!.fire('error', { error: 'canceled' });
    utterances[0]!.fire('end');
    expect(events).toEqual([]);
    stop();
  });

  it('reports an error when the browser has no speech engine at all', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    const events: SpeechEvent[] = [];
    const stop = onSpeechEvent((event) => events.push(event));
    await speak();
    expect(events).toEqual(['error']);
    stop();
  });
});
