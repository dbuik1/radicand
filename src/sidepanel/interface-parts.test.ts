// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INTERFACE_PARTS,
  INTERFACE_PARTS,
  interfacePartSpec,
  normaliseInterfaceParts,
} from './interface-parts';
import { DEFAULT_SETTINGS } from './settings';

describe('the interface-part table', () => {
  it('names every flag in the settings, and no flag that is not one', () => {
    const listed = INTERFACE_PARTS.map((spec) => spec.part).sort();
    const flags = Object.keys(DEFAULT_SETTINGS.parts).sort();
    expect(listed).toEqual(flags);
  });

  it('gives each piece a label and a hint, and lists it once', () => {
    const seen = new Set<string>();
    for (const spec of INTERFACE_PARTS) {
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.hint.length).toBeGreaterThan(0);
      expect(seen.has(spec.part)).toBe(false);
      seen.add(spec.part);
      expect(interfacePartSpec(spec.part)).toBe(spec);
    }
  });

  it('does not offer the equation field: it is the one thing always on screen', () => {
    const labels = INTERFACE_PARTS.map((spec) => spec.label.toLowerCase());
    expect(labels).not.toContain('equation field');
    expect(INTERFACE_PARTS.some((spec) => spec.part === ('field' as never))).toBe(false);
  });

  it('shows everything by default', () => {
    expect(Object.values(DEFAULT_INTERFACE_PARTS).every(Boolean)).toBe(true);
  });

  it('keeps the two headings for assistive technology rather than removing them', () => {
    expect(interfacePartSpec('equationHeading').mode).toBe('hide-visually');
    expect(interfacePartSpec('copy').mode).toBe('remove');
  });
});

describe('reading stored part flags', () => {
  it('fills a missing piece in, so one added later starts on screen', () => {
    const parts = normaliseInterfaceParts({ speak: false });
    expect(parts.speak).toBe(false);
    expect(parts.copy).toBe(true);
  });

  it('drops unknown keys and non-boolean values', () => {
    const parts = normaliseInterfaceParts({ nonsense: false, copy: 'no' });
    expect('nonsense' in parts).toBe(false);
    expect(parts.copy).toBe(true);
  });

  it('honours the pre-`parts` symbolsOpen key when the newer one is absent', () => {
    expect(normaliseInterfaceParts(undefined, false).symbols).toBe(false);
    expect(normaliseInterfaceParts({}, false).symbols).toBe(false);
    expect(normaliseInterfaceParts({ symbols: true }, false).symbols).toBe(true);
  });

  it('reads nothing at all as everything shown', () => {
    expect(normaliseInterfaceParts(null)).toEqual(DEFAULT_INTERFACE_PARTS);
  });
});
