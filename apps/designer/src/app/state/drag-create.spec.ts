import { describe, expect, it } from 'vitest';
import { validateElement, type TemplateElement } from '@rendara/report-schema';
import {
  DEFAULT_ELEMENT_SIZES,
  PLACEHOLDER_IMAGE_SRC,
  createDefaultElement,
  frameForDefault,
  frameForDrop,
  type PaletteKind,
} from './drag-create';

/** A4 portrait sheet, the default page, used as the placement bounds. */
const A4_PORTRAIT = { widthMm: 210, heightMm: 297 };

const ALL_KINDS: readonly PaletteKind[] = ['text', 'image', 'line', 'rect', 'ellipse', 'dataTable'];

describe('createDefaultElement', () => {
  it('produces a schema-valid element for every palette kind', () => {
    for (const kind of ALL_KINDS) {
      const size = DEFAULT_ELEMENT_SIZES[kind];
      const element = createDefaultElement(
        kind,
        `el_${kind}`,
        { xMm: 20, yMm: 20, wMm: size.wMm, hMm: size.hMm },
        1,
      );
      // The factory's whole point: every dropped element is immediately valid.
      expect(validateElement(element)).toEqual([]);
    }
  });

  it('carries the id, frame and z it was given', () => {
    const frame = { xMm: 12, yMm: 34, wMm: 40, hMm: 10 };
    const element = createDefaultElement('text', 'el_42', frame, 7);

    expect(element.id).toBe('el_42');
    expect(element.frame).toEqual(frame);
    expect(element.z).toBe(7);
  });

  it('defaults a text element to the editable literal "Text"', () => {
    const element = createDefaultElement('text', 'el_t', { xMm: 0, yMm: 0, wMm: 40, hMm: 10 }, 1);

    expect(element.type).toBe('text');
    expect(element).toMatchObject({ type: 'text', text: 'Text' });
  });

  it('defaults an image to the visible placeholder source and contain fit', () => {
    const element = createDefaultElement('image', 'el_i', { xMm: 0, yMm: 0, wMm: 40, hMm: 30 }, 1);

    expect(element).toMatchObject({ type: 'image', src: PLACEHOLDER_IMAGE_SRC, fit: 'contain' });
    expect(PLACEHOLDER_IMAGE_SRC).toMatch(/^data:image\//);
  });

  it('maps each shape kind onto a shape element with a visible stroke', () => {
    for (const kind of ['line', 'rect', 'ellipse'] as const) {
      const element = createDefaultElement(
        kind,
        `el_${kind}`,
        { xMm: 0, yMm: 0, wMm: 40, hMm: 5 },
        1,
      );
      expect(element).toMatchObject({ type: 'shape', shape: kind });
      // A stroke is set so the shape is not painted as nothing.
      expect((element as Extract<TemplateElement, { type: 'shape' }>).style?.stroke).toBeDefined();
    }
  });

  it('defaults a data table to a placeholder array binding and starter columns', () => {
    const element = createDefaultElement(
      'dataTable',
      'el_tbl',
      { xMm: 0, yMm: 0, wMm: 120, hMm: null },
      1,
    );

    expect(element).toMatchObject({
      type: 'dataTable',
      source: { arrayExpr: 'items' },
      repeatHeaderOnEachPage: true,
      keepTogether: false,
    });
    expect(element).toHaveProperty('type', 'dataTable');
    if (element.type === 'dataTable') {
      expect(element.columns).toHaveLength(2);
    }
  });
});

describe('DEFAULT_ELEMENT_SIZES', () => {
  it('has a footprint for every palette kind, growing the data table', () => {
    for (const kind of ALL_KINDS) {
      expect(DEFAULT_ELEMENT_SIZES[kind].wMm).toBeGreaterThan(0);
    }
    expect(DEFAULT_ELEMENT_SIZES.dataTable.hMm).toBeNull();
  });
});

describe('frameForDrop', () => {
  it('centres the default footprint on the drop point', () => {
    const frame = frameForDrop({ wMm: 40, hMm: 10 }, { xMm: 105, yMm: 148.5 }, A4_PORTRAIT);
    expect(frame).toEqual({ xMm: 85, yMm: 143.5, wMm: 40, hMm: 10 });
  });

  it('clamps a drop near the top-left corner onto the page', () => {
    const frame = frameForDrop({ wMm: 40, hMm: 10 }, { xMm: 0, yMm: 0 }, A4_PORTRAIT);
    expect(frame).toEqual({ xMm: 0, yMm: 0, wMm: 40, hMm: 10 });
  });

  it('clamps a drop past the bottom-right so the element stays fully on the sheet', () => {
    const frame = frameForDrop({ wMm: 40, hMm: 10 }, { xMm: 210, yMm: 297 }, A4_PORTRAIT);
    // x ≤ 210 − 40 = 170; y ≤ 297 − 10 = 287.
    expect(frame).toEqual({ xMm: 170, yMm: 287, wMm: 40, hMm: 10 });
  });

  it('anchors a growing (null-height) element by its top edge', () => {
    const frame = frameForDrop({ wMm: 120, hMm: null }, { xMm: 105, yMm: 50 }, A4_PORTRAIT);
    expect(frame).toEqual({ xMm: 45, yMm: 50, wMm: 120, hMm: null });
  });
});

describe('frameForDefault', () => {
  it('centres the first element on the page', () => {
    const frame = frameForDefault({ wMm: 40, hMm: 10 }, A4_PORTRAIT, 0);
    expect(frame).toEqual({ xMm: 85, yMm: 143.5, wMm: 40, hMm: 10 });
  });

  it('cascades successive elements down and to the right', () => {
    const frame = frameForDefault({ wMm: 40, hMm: 10 }, A4_PORTRAIT, 1);
    expect(frame).toEqual({ xMm: 91, yMm: 149.5, wMm: 40, hMm: 10 });
  });

  it('wraps the cascade so it never marches off the page', () => {
    const first = frameForDefault({ wMm: 40, hMm: 10 }, A4_PORTRAIT, 0);
    const wrapped = frameForDefault({ wMm: 40, hMm: 10 }, A4_PORTRAIT, 6);
    expect(wrapped).toEqual(first);
  });
});
