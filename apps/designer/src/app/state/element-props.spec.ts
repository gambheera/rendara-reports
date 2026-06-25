import { describe, expect, it } from 'vitest';
import type { Frame, TemplateElement } from '@rendara/report-schema';
import {
  effectiveFont,
  isBoldWeight,
  patchFrameField,
  roundMm,
  setTextFont,
} from './element-props';

const FRAME: Frame = { xMm: 15, yMm: 30, wMm: 40, hMm: 10 };
const DEFAULT_FONT = { family: 'Inter', sizePt: 10 } as const;

function textElement(overrides: Partial<TemplateElement> = {}): TemplateElement {
  return {
    id: 'el_1',
    type: 'text',
    frame: FRAME,
    z: 1,
    text: 'Hello',
    ...overrides,
  } as TemplateElement;
}

describe('roundMm', () => {
  it('rounds to 0.1 mm', () => {
    expect(roundMm(12.34)).toBe(12.3);
    expect(roundMm(12.36)).toBe(12.4);
    expect(roundMm(20)).toBe(20);
  });
});

describe('patchFrameField', () => {
  it('sets x/y to a rounded value, allowing negatives', () => {
    expect(patchFrameField(FRAME, 'xMm', 22.34)).toEqual({ ...FRAME, xMm: 22.3 });
    expect(patchFrameField(FRAME, 'yMm', -5)).toEqual({ ...FRAME, yMm: -5 });
  });

  it('sets width only when positive', () => {
    expect(patchFrameField(FRAME, 'wMm', 80)).toEqual({ ...FRAME, wMm: 80 });
    expect(patchFrameField(FRAME, 'wMm', 0)).toBeNull();
    expect(patchFrameField(FRAME, 'wMm', -3)).toBeNull();
  });

  it('sets height only when non-negative', () => {
    expect(patchFrameField(FRAME, 'hMm', 0)).toEqual({ ...FRAME, hMm: 0 });
    expect(patchFrameField(FRAME, 'hMm', 12.5)).toEqual({ ...FRAME, hMm: 12.5 });
    expect(patchFrameField(FRAME, 'hMm', -1)).toBeNull();
  });

  it('never edits a growing (null-height) element through hMm', () => {
    const growing: Frame = { ...FRAME, hMm: null };
    expect(patchFrameField(growing, 'hMm', 20)).toBeNull();
  });

  it('rejects a non-finite (blank) value for any field', () => {
    expect(patchFrameField(FRAME, 'xMm', Number.NaN)).toBeNull();
    expect(patchFrameField(FRAME, 'wMm', Number.NaN)).toBeNull();
  });

  it('does not mutate the input frame', () => {
    const copy = { ...FRAME };
    patchFrameField(FRAME, 'xMm', 99);
    expect(FRAME).toEqual(copy);
  });
});

describe('setTextFont', () => {
  it('creates a font when the style has none', () => {
    expect(setTextFont(undefined, { sizePt: 24 })).toEqual({ font: { sizePt: 24 } });
  });

  it('merges into an existing font without dropping sibling fields', () => {
    const style = { color: '#111', font: { family: 'Inter', weight: 'bold' as const } };
    expect(setTextFont(style, { sizePt: 18 })).toEqual({
      color: '#111',
      font: { family: 'Inter', weight: 'bold', sizePt: 18 },
    });
  });

  it('does not mutate the input style', () => {
    const style = { font: { sizePt: 10 } };
    setTextFont(style, { sizePt: 20 });
    expect(style).toEqual({ font: { sizePt: 10 } });
  });
});

describe('effectiveFont', () => {
  it('falls back to the document default when unstyled', () => {
    expect(effectiveFont(textElement(), DEFAULT_FONT)).toEqual({
      family: 'Inter',
      sizePt: 10,
      bold: false,
    });
  });

  it('reads element overrides over the default', () => {
    const el = textElement({ style: { font: { family: 'Georgia', sizePt: 24, weight: 'bold' } } });
    expect(effectiveFont(el, DEFAULT_FONT)).toEqual({ family: 'Georgia', sizePt: 24, bold: true });
  });
});

describe('isBoldWeight', () => {
  it('treats the bold keyword and numeric steps >= 600 as bold', () => {
    expect(isBoldWeight('bold')).toBe(true);
    expect(isBoldWeight(700)).toBe(true);
    expect(isBoldWeight(600)).toBe(true);
  });

  it('treats normal / light weights and undefined as not bold', () => {
    expect(isBoldWeight('normal')).toBe(false);
    expect(isBoldWeight(400)).toBe(false);
    expect(isBoldWeight(undefined)).toBe(false);
  });
});
