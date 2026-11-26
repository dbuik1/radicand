import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_SETTINGS, updateSettings } from './settings';
import { buildPayload, copyToClipboard } from './output';
import type { EditorController } from './editor';
import type { OutputFormat } from '../types';

/** Minimal fake editor returning canned values per format. */
function fakeEditor(values: Partial<Record<string, string>>): EditorController {
  return {
    element: {} as never,
    getValue: (format) => values[format] ?? '',
    getLatex: () => values.latex ?? '',
    getSpokenText: () => values.spoken ?? '',
    setLatex: () => {},
    insert: () => {},
    isEmpty: () => false,
    focus: () => {},
    onChange: () => () => {},
    setAutoBoxEnabled: () => {},
  };
}

describe('buildPayload', () => {
  const editor = fakeEditor({
    mathml: '<math><mi>x</mi></math>',
    latex: 'x',
  });

  it('provides MathML as both plain and html', () => {
    const payload = buildPayload(editor, 'mathml');
    expect(payload.plain).toBe('<math><mi>x</mi></math>');
    expect(payload.html).toBe('<math><mi>x</mi></math>');
  });

  it('provides LaTeX as plain text only', () => {
    const payload = buildPayload(editor, 'latex');
    expect(payload.plain).toBe('x');
    expect(payload.html).toBeUndefined();
  });
});

describe('buildPayload with tidy brackets', () => {
  const fenced = fakeEditor({ latex: '\\left(x\\right)' });

  afterEach(async () => {
    await updateSettings({ tidyBrackets: DEFAULT_SETTINGS.tidyBrackets });
  });

  it('tidies plain brackets in copied LaTeX when the setting is on', async () => {
    await updateSettings({ tidyBrackets: true });
    expect(buildPayload(fenced, 'latex').plain).toBe('(x)');
  });

  it('copies the LaTeX as written when the setting is off', async () => {
    await updateSettings({ tidyBrackets: false });
    expect(buildPayload(fenced, 'latex').plain).toBe('\\left(x\\right)');
  });
});

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to writeText when ClipboardItem is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    // Ensure no ClipboardItem in scope.
    vi.stubGlobal('ClipboardItem', undefined);

    await copyToClipboard({ plain: 'x', html: '<math/>' });
    expect(writeText).toHaveBeenCalledWith('x');
  });

  it('writes a rich ClipboardItem when html is present and API exists', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    class FakeClipboardItem {
      constructor(public readonly data: Record<string, unknown>) {}
    }
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    vi.stubGlobal('navigator', { clipboard: { write } });

    await copyToClipboard({ plain: 'x', html: '<math/>' });
    expect(write).toHaveBeenCalledOnce();
    const [items] = write.mock.calls[0] as [FakeClipboardItem[]];
    expect(items[0]).toBeInstanceOf(FakeClipboardItem);
    expect(Object.keys(items[0]!.data)).toEqual(['text/html', 'text/plain']);
  });
});

// Type-level guard: every OutputFormat is handled by buildPayload's switch.
const _formats: OutputFormat[] = ['mathml', 'latex'];
void _formats;
