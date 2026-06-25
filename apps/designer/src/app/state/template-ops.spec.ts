import { describe, expect, it } from 'vitest';
import { isValidTemplate, type RendaraTemplate, type TextElement } from '@rendara/report-schema';
import {
  addElementToBody,
  collectElements,
  createEmptyTemplate,
  findElement,
  hasElement,
  removeElementById,
  setPageOf,
  updateElementById,
  updateElementsById,
} from './template-ops';

function textEl(id: string, text = 'hi'): TextElement {
  return {
    id,
    type: 'text',
    frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 },
    z: 1,
    text,
  };
}

/** A template with one element in each band, for cross-band lookups. */
function seeded(): RendaraTemplate {
  return {
    ...createEmptyTemplate(),
    header: { elements: [textEl('h1')] },
    body: { elements: [textEl('b1'), textEl('b2')] },
    footer: { elements: [textEl('f1')] },
  };
}

describe('createEmptyTemplate', () => {
  it('produces a schema-valid empty document', () => {
    const t = createEmptyTemplate();
    expect(isValidTemplate(t)).toBe(true);
    expect(t.header.elements).toEqual([]);
    expect(t.body.elements).toEqual([]);
    expect(t.footer.elements).toEqual([]);
  });

  it('generates a fresh id each call', () => {
    expect(createEmptyTemplate().metadata.id).not.toBe(createEmptyTemplate().metadata.id);
  });
});

describe('collectElements / findElement / hasElement', () => {
  it('collects across all bands in band order', () => {
    expect(collectElements(seeded()).map((el) => el.id)).toEqual(['h1', 'b1', 'b2', 'f1']);
  });

  it('finds elements in any band and reports absence', () => {
    const t = seeded();
    expect(findElement(t, 'h1')?.id).toBe('h1');
    expect(findElement(t, 'f1')?.id).toBe('f1');
    expect(findElement(t, 'nope')).toBeUndefined();
    expect(hasElement(t, 'b2')).toBe(true);
    expect(hasElement(t, 'nope')).toBe(false);
  });
});

describe('addElementToBody', () => {
  it('appends immutably, leaving the input untouched', () => {
    const t = createEmptyTemplate();
    const next = addElementToBody(t, textEl('new'));

    expect(next).not.toBe(t);
    expect(next.body).not.toBe(t.body);
    expect(next.body.elements).not.toBe(t.body.elements);
    expect(next.body.elements.map((el) => el.id)).toEqual(['new']);
    // Original is unchanged.
    expect(t.body.elements).toEqual([]);
  });
});

describe('updateElementById', () => {
  it('shallow-merges changes immutably in the owning band', () => {
    const t = seeded();
    const next = updateElementById(t, 'b1', { z: 99 });

    expect(next).not.toBe(t);
    expect(next.body).not.toBe(t.body);
    expect(findElement(next, 'b1')?.z).toBe(99);
    // Untouched siblings keep their reference.
    expect(next.body.elements[1]).toBe(t.body.elements[1]);
    // Original element is unchanged.
    expect(findElement(t, 'b1')?.z).toBe(1);
  });

  it('preserves the id and type discriminant', () => {
    const t = seeded();
    const next = updateElementById(t, 'b1', {
      id: 'hacked',
      type: 'image',
    } as unknown as Partial<TextElement>);
    const el = findElement(next, 'b1');
    expect(el?.id).toBe('b1');
    expect(el?.type).toBe('text');
  });

  it('returns the same template when the id is unknown', () => {
    const t = seeded();
    expect(updateElementById(t, 'nope', { z: 5 })).toBe(t);
  });
});

describe('updateElementsById', () => {
  it('patches several elements across bands in one new template', () => {
    const t = seeded();
    const next = updateElementsById(
      t,
      new Map([
        ['b1', { z: 5 }],
        ['f1', { z: 9 }],
      ]),
    );

    expect(next).not.toBe(t);
    expect(findElement(next, 'b1')?.z).toBe(5);
    expect(findElement(next, 'f1')?.z).toBe(9);
    // A band with no matched id keeps its reference.
    expect(next.header).toBe(t.header);
    // Originals untouched.
    expect(findElement(t, 'b1')?.z).toBe(1);
  });

  it('preserves id and type per patched element', () => {
    const t = seeded();
    const next = updateElementsById(
      t,
      new Map([['b1', { id: 'x', type: 'image' } as unknown as Partial<TextElement>]]),
    );
    expect(findElement(next, 'b1')?.type).toBe('text');
  });

  it('returns the same template for an empty map or all-unknown ids', () => {
    const t = seeded();
    expect(updateElementsById(t, new Map())).toBe(t);
    expect(updateElementsById(t, new Map([['nope', { z: 2 }]]))).toBe(t);
  });
});

describe('removeElementById', () => {
  it('removes from the owning band immutably', () => {
    const t = seeded();
    const next = removeElementById(t, 'b1');

    expect(next).not.toBe(t);
    expect(next.body.elements.map((el) => el.id)).toEqual(['b2']);
    expect(t.body.elements.map((el) => el.id)).toEqual(['b1', 'b2']);
  });

  it('returns the same template when the id is unknown', () => {
    const t = seeded();
    expect(removeElementById(t, 'nope')).toBe(t);
  });
});

describe('setPageOf', () => {
  it('replaces the page immutably', () => {
    const t = createEmptyTemplate();
    const page = { ...t.page, orientation: 'landscape' as const };
    const next = setPageOf(t, page);

    expect(next).not.toBe(t);
    expect(next.page.orientation).toBe('landscape');
    expect(t.page.orientation).toBe('portrait');
  });
});
