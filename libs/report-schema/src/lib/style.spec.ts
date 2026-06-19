import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AlignmentStyle,
  BorderStyle,
  ElementStyle,
  FontWeight,
  LineStyle,
  PaddingMm,
  StrokeStyle,
  TextFont,
} from './style';
import {
  FONT_STYLES,
  FONT_WEIGHTS,
  HORIZONTAL_ALIGNS,
  LINE_STYLES,
  VERTICAL_ALIGNS,
  isValidStyle,
  validateStyle,
} from './style-validation';

/** A fully-populated, valid style touching every slot. */
const fullStyle = {
  font: { family: 'Inter', sizePt: 10, weight: 600, style: 'italic' },
  color: '#111827',
  fill: '#ffffff',
  border: {
    top: { widthMm: 0.25, style: 'solid', color: '#e5e7eb' },
    right: { widthMm: 0, style: 'none' },
    bottom: { widthMm: 0.5, style: 'dashed', color: 'rgb(79 70 229)' },
    left: { style: 'dotted', color: 'black' },
  },
  align: { horizontal: 'right', vertical: 'middle' },
  padding: { top: 2, right: 3, bottom: 2, left: 3 },
  stroke: { color: '#4F46E5', widthMm: 0.75, style: 'solid' },
  format: 'currency:USD',
} satisfies ElementStyle;

describe('style fixtures validate (E1-S4 QA)', () => {
  it('a fully-populated style is valid', () => {
    expect(validateStyle(fullStyle)).toEqual([]);
    expect(isValidStyle(fullStyle)).toBe(true);
  });

  it('an empty style is valid (every field is an optional override)', () => {
    expect(validateStyle({})).toEqual([]);
    expect(isValidStyle({})).toBe(true);
  });

  it('a null format token means "no formatting" and is valid', () => {
    expect(isValidStyle({ format: null })).toBe(true);
  });

  it('accepts every font weight', () => {
    for (const weight of FONT_WEIGHTS) {
      expect(isValidStyle({ font: { weight } })).toBe(true);
    }
  });

  it('accepts every line style on borders and strokes', () => {
    for (const style of LINE_STYLES) {
      expect(isValidStyle({ stroke: { style } })).toBe(true);
      expect(isValidStyle({ border: { top: { style } } })).toBe(true);
    }
  });

  it('accepts every alignment', () => {
    for (const horizontal of HORIZONTAL_ALIGNS) {
      expect(isValidStyle({ align: { horizontal } })).toBe(true);
    }
    for (const vertical of VERTICAL_ALIGNS) {
      expect(isValidStyle({ align: { vertical } })).toBe(true);
    }
  });

  it('publishes runtime mirrors of each literal union', () => {
    expect(FONT_WEIGHTS).toEqual(['normal', 'bold', 100, 200, 300, 400, 500, 600, 700, 800, 900]);
    expect(FONT_STYLES).toEqual(['normal', 'italic']);
    expect(LINE_STYLES).toEqual(['solid', 'dashed', 'dotted', 'double', 'none']);
    expect(HORIZONTAL_ALIGNS).toEqual(['left', 'center', 'right', 'justify']);
    expect(VERTICAL_ALIGNS).toEqual(['top', 'middle', 'bottom']);
  });
});

describe('font validation (E1-S4)', () => {
  it('rejects an empty font family', () => {
    expect(validateStyle({ font: { family: '' } })).toContainEqual(
      expect.objectContaining({ path: 'style.font.family' }),
    );
  });

  it('rejects a non-positive font size', () => {
    expect(validateStyle({ font: { sizePt: 0 } })).toContainEqual(
      expect.objectContaining({ path: 'style.font.sizePt' }),
    );
  });

  it('rejects an unknown font weight', () => {
    const bad = { font: { weight: 450 as never } } satisfies ElementStyle;
    expect(validateStyle(bad)).toContainEqual(
      expect.objectContaining({ path: 'style.font.weight' }),
    );
  });

  it('rejects an unknown font style', () => {
    const bad = { font: { style: 'oblique' as never } } satisfies ElementStyle;
    expect(validateStyle(bad)).toContainEqual(
      expect.objectContaining({ path: 'style.font.style' }),
    );
  });
});

describe('colour validation (E1-S4)', () => {
  it('rejects an empty foreground colour', () => {
    expect(validateStyle({ color: '' })).toContainEqual(
      expect.objectContaining({ path: 'style.color' }),
    );
  });

  it('rejects a non-string fill colour', () => {
    const bad = { fill: 123 as never } satisfies ElementStyle;
    expect(validateStyle(bad)).toContainEqual(expect.objectContaining({ path: 'style.fill' }));
  });
});

describe('border validation (E1-S4)', () => {
  it('reports problems per side with the side in the path', () => {
    const bad = {
      border: {
        bottom: {
          widthMm: -1,
          style: 'groove' as never,
          color: '',
        },
      },
    } satisfies ElementStyle;
    const paths = validateStyle(bad).map((error) => error.path);
    expect(paths).toContain('style.border.bottom.widthMm');
    expect(paths).toContain('style.border.bottom.style');
    expect(paths).toContain('style.border.bottom.color');
  });

  it('accepts a single-side border (other sides absent)', () => {
    expect(isValidStyle({ border: { bottom: { widthMm: 0.25, style: 'solid' } } })).toBe(true);
  });
});

describe('alignment validation (E1-S4)', () => {
  it('rejects unknown horizontal and vertical alignments', () => {
    const bad = {
      align: { horizontal: 'around' as never, vertical: 'baseline' as never },
    } satisfies ElementStyle;
    const paths = validateStyle(bad).map((error) => error.path);
    expect(paths).toContain('style.align.horizontal');
    expect(paths).toContain('style.align.vertical');
  });
});

describe('padding validation (E1-S4)', () => {
  it('rejects a negative padding side', () => {
    expect(validateStyle({ padding: { left: -2 } })).toContainEqual(
      expect.objectContaining({ path: 'style.padding.left' }),
    );
  });

  it('accepts a partial padding (other sides absent)', () => {
    expect(isValidStyle({ padding: { top: 2 } })).toBe(true);
  });
});

describe('stroke validation (E1-S4)', () => {
  it('reports colour, width, and style problems', () => {
    const bad = {
      stroke: { color: 0 as never, widthMm: -0.5, style: 'wavy' as never },
    } satisfies ElementStyle;
    const paths = validateStyle(bad).map((error) => error.path);
    expect(paths).toContain('style.stroke.color');
    expect(paths).toContain('style.stroke.widthMm');
    expect(paths).toContain('style.stroke.style');
  });
});

describe('format token validation (E1-S4)', () => {
  it('rejects an empty format token', () => {
    expect(validateStyle({ format: '' })).toContainEqual(
      expect.objectContaining({ path: 'style.format' }),
    );
  });

  it('rejects a non-string format token', () => {
    const bad = { format: 42 as never } satisfies ElementStyle;
    expect(validateStyle(bad)).toContainEqual(expect.objectContaining({ path: 'style.format' }));
  });
});

describe('basePath (E1-S4)', () => {
  it('defaults to "style"', () => {
    expect(validateStyle({ color: '' })[0]?.path).toBe('style.color');
  });

  it('prefixes every reported path with the supplied basePath', () => {
    expect(validateStyle({ color: '' }, 'el_title.style')[0]?.path).toBe('el_title.style.color');
  });
});

/**
 * Type-level checks: the well-typed sub-shapes are what the renderer/engine will
 * consume. The typed locals are the compile-time assignability proof; they
 * compile only while the types match.
 */
describe('style model types (E1-S4)', () => {
  it('accepts well-typed sub-shapes', () => {
    const font: TextFont = { family: 'Inter', sizePt: 10, weight: 600, style: 'italic' };
    const border: BorderStyle = { bottom: { widthMm: 0.5, style: 'dashed', color: '#000' } };
    const align: AlignmentStyle = { horizontal: 'justify', vertical: 'top' };
    const padding: PaddingMm = { top: 1 };
    const stroke: StrokeStyle = { color: '#000', widthMm: 0.25, style: 'solid' };
    const style: ElementStyle = { font, border, align, padding, stroke, format: null };

    expect(isValidStyle(style)).toBe(true);
    expectTypeOf(style).toMatchTypeOf<ElementStyle>();
    expectTypeOf<FontWeight>().toEqualTypeOf<NonNullable<TextFont['weight']>>();
    expectTypeOf<LineStyle>().toEqualTypeOf<NonNullable<StrokeStyle['style']>>();
  });
});
