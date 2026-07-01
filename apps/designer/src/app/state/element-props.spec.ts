import { describe, expect, it } from 'vitest';
import type { ElementStyle, Frame, TemplateElement } from '@rendara/report-schema';
import {
  DEFAULT_FILL_COLOR,
  DEFAULT_IMAGE_FIT,
  MAX_IMAGE_UPLOAD_BYTES,
  effectiveFill,
  effectiveFont,
  effectiveImageFit,
  effectiveStroke,
  imageUploadError,
  isBoldWeight,
  patchFrameField,
  patchStrokeWidth,
  roundMm,
  setShapeFill,
  setShapeStroke,
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

describe('setShapeStroke', () => {
  it('creates a stroke when the style has none', () => {
    expect(setShapeStroke(undefined, { color: '#FF0000' })).toEqual({
      stroke: { color: '#FF0000' },
    });
  });

  it('merges into an existing stroke without dropping sibling fields', () => {
    const style: ElementStyle = { fill: '#EEE', stroke: { widthMm: 0.5, style: 'solid' } };
    expect(setShapeStroke(style, { color: '#123456' })).toEqual({
      fill: '#EEE',
      stroke: { widthMm: 0.5, style: 'solid', color: '#123456' },
    });
  });

  it('does not mutate the input style', () => {
    const style: ElementStyle = { stroke: { widthMm: 1 } };
    setShapeStroke(style, { widthMm: 2 });
    expect(style).toEqual({ stroke: { widthMm: 1 } });
  });
});

describe('setShapeFill', () => {
  it('sets the fill colour, preserving other style fields', () => {
    const style: ElementStyle = { stroke: { color: '#000' } };
    expect(setShapeFill(style, '#ABCDEF')).toEqual({
      stroke: { color: '#000' },
      fill: '#ABCDEF',
    });
  });

  it('omits the fill key entirely when cleared (no `fill: undefined`)', () => {
    const style: ElementStyle = { fill: '#ABCDEF', stroke: { color: '#000' } };
    const cleared = setShapeFill(style, undefined);
    expect(cleared).toEqual({ stroke: { color: '#000' } });
    expect('fill' in cleared).toBe(false);
  });

  it('is a safe no-op shape when clearing an already-fill-less style', () => {
    expect(setShapeFill(undefined, undefined)).toEqual({});
  });

  it('does not mutate the input style', () => {
    const style: ElementStyle = { fill: '#FFF' };
    setShapeFill(style, '#000');
    expect(style).toEqual({ fill: '#FFF' });
  });
});

describe('patchStrokeWidth', () => {
  it('rounds a non-negative width to 0.1 mm', () => {
    expect(patchStrokeWidth(0.74)).toBe(0.7);
    expect(patchStrokeWidth(0)).toBe(0);
  });

  it('rejects a negative or non-finite width', () => {
    expect(patchStrokeWidth(-0.5)).toBeNull();
    expect(patchStrokeWidth(Number.NaN)).toBeNull();
  });
});

describe('effectiveStroke', () => {
  it('falls back to the renderer defaults when the shape has no stroke', () => {
    expect(effectiveStroke(undefined)).toEqual({
      color: '#000000',
      widthMm: 0.2,
      style: 'solid',
      enabled: true,
    });
  });

  it('reads stroke overrides, reporting a `none` style as disabled', () => {
    expect(
      effectiveStroke({ stroke: { color: '#1F2937', widthMm: 0.5, style: 'dashed' } }),
    ).toEqual({ color: '#1F2937', widthMm: 0.5, style: 'dashed', enabled: true });
    expect(effectiveStroke({ stroke: { style: 'none' } }).enabled).toBe(false);
  });
});

describe('effectiveFill', () => {
  it('returns the fill colour, or null when there is none', () => {
    expect(effectiveFill({ fill: '#FF00FF' })).toBe('#FF00FF');
    expect(effectiveFill({ stroke: { color: '#000' } })).toBeNull();
    expect(effectiveFill(undefined)).toBeNull();
  });

  it('exposes a sensible default fill colour for first enable', () => {
    expect(DEFAULT_FILL_COLOR).toBe('#FFFFFF');
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

function imageElement(overrides: Partial<TemplateElement> = {}): TemplateElement {
  return {
    id: 'el_img',
    type: 'image',
    frame: FRAME,
    z: 1,
    src: 'https://cdn.example.com/logo.png',
    fit: 'cover',
    ...overrides,
  } as TemplateElement;
}

describe('effectiveImageFit', () => {
  it("returns the image element's fit mode", () => {
    expect(effectiveImageFit(imageElement())).toBe('cover');
    expect(effectiveImageFit(imageElement({ fit: 'fill' } as Partial<TemplateElement>))).toBe(
      'fill',
    );
  });

  it('falls back to the default fit for a non-image element', () => {
    expect(effectiveImageFit(textElement())).toBe(DEFAULT_IMAGE_FIT);
    expect(DEFAULT_IMAGE_FIT).toBe('contain');
  });
});

describe('imageUploadError', () => {
  it('accepts an image file within the size cap', () => {
    expect(imageUploadError({ type: 'image/png', size: 1024 })).toBeNull();
    expect(imageUploadError({ type: 'image/svg+xml', size: MAX_IMAGE_UPLOAD_BYTES })).toBeNull();
  });

  it('rejects a non-image file', () => {
    expect(imageUploadError({ type: 'application/pdf', size: 10 })).toBe(
      'Please choose an image file.',
    );
    expect(imageUploadError({ type: '', size: 10 })).toBe('Please choose an image file.');
  });

  it('rejects an oversized image (large image handled)', () => {
    expect(imageUploadError({ type: 'image/png', size: MAX_IMAGE_UPLOAD_BYTES + 1 })).toBe(
      'Image is too large (max 2 MB).',
    );
  });
});
