import { describe, expect, it } from 'vitest';
import type { Frame, TextElement } from '@rendara/report-schema';
import { PASTE_OFFSET_MM, cloneElementsForPaste } from './clipboard-ops';
import type { PageSizeMm } from './drag-create';

const PAGE: PageSizeMm = { widthMm: 210, heightMm: 297 };

function textEl(id: string, frame: Frame, z = 1): TextElement {
  return {
    id,
    type: 'text',
    frame,
    z,
    text: `text-${id}`,
    style: { color: '#111' },
  } as TextElement;
}

/** Deterministic id factory so clone ids are predictable in assertions. */
function seqIds(): () => string {
  let n = 0;
  return () => `new${n++}`;
}

describe('cloneElementsForPaste', () => {
  it('returns an empty array for no sources', () => {
    expect(cloneElementsForPaste([], seqIds(), 5, PAGE)).toEqual([]);
  });

  it('gives each clone a fresh id and offsets the frame by the cascade amount', () => {
    const src = textEl('a', { xMm: 10, yMm: 20, wMm: 30, hMm: 8 });
    const [clone] = cloneElementsForPaste([src], seqIds(), 9, PAGE);
    expect(clone.id).toBe('new0');
    expect(clone.id).not.toBe(src.id);
    expect(clone.frame).toEqual({
      xMm: 10 + PASTE_OFFSET_MM,
      yMm: 20 + PASTE_OFFSET_MM,
      wMm: 30,
      hMm: 8,
    });
  });

  it('round-trips every non-positional property by value', () => {
    const src = textEl('a', { xMm: 10, yMm: 20, wMm: 30, hMm: 8 });
    const [clone] = cloneElementsForPaste([src], seqIds(), 1, PAGE) as TextElement[];
    expect(clone.type).toBe('text');
    expect(clone.text).toBe(src.text);
    expect(clone.style).toEqual(src.style);
  });

  it('assigns ascending z from startZ so the pasted set lands on top in order', () => {
    const a = textEl('a', { xMm: 0, yMm: 0, wMm: 10, hMm: 5 });
    const b = textEl('b', { xMm: 40, yMm: 40, wMm: 10, hMm: 5 });
    const clones = cloneElementsForPaste([a, b], seqIds(), 7, PAGE);
    expect(clones.map((c) => c.z)).toEqual([7, 8]);
  });

  it('preserves relative layout when offsetting a multi-element set as a group', () => {
    const a = textEl('a', { xMm: 10, yMm: 10, wMm: 10, hMm: 5 });
    const b = textEl('b', { xMm: 30, yMm: 25, wMm: 10, hMm: 5 });
    const clones = cloneElementsForPaste([a, b], seqIds(), 1, PAGE);
    const dx = clones[1].frame.xMm - clones[0].frame.xMm;
    const dy = clones[1].frame.yMm - clones[0].frame.yMm;
    expect(dx).toBe(30 - 10);
    expect(dy).toBe(25 - 10);
  });

  it('clamps the offset so a clone near the edge stays on the sheet', () => {
    // An element flush against the bottom-right cannot shift further.
    const src = textEl('a', { xMm: 200, yMm: 292, wMm: 10, hMm: 5 });
    const [clone] = cloneElementsForPaste([src], seqIds(), 1, PAGE);
    expect(clone.frame.xMm).toBe(200);
    expect(clone.frame.yMm).toBe(292);
  });
});
