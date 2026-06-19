import { assertType, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from './report-schema';
import type { ElementType, RendaraTemplate, TemplateElement } from '../index';

/**
 * E1-S1 QA: a hand-written fixture must be assignable to `RendaraTemplate`.
 *
 * The `satisfies RendaraTemplate` annotation is the compile-time assignability
 * proof (the story's primary acceptance), checked by `tsc`. The runtime
 * assertions below give Vitest real behavior to exercise and document the model.
 */
const fixture = {
  schemaVersion: SCHEMA_VERSION,
  metadata: {
    name: 'Invoice — Acme Corp',
    id: '00000000-0000-4000-8000-000000000000',
    createdAt: '2026-06-17T00:00:00.000Z',
    locale: 'en-US',
  },
  page: {
    size: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
    units: 'mm',
    defaultFont: { family: 'Inter', sizePt: 10 },
    background: null,
  },
  header: {
    elements: [
      {
        id: 'el_logo',
        type: 'image',
        frame: { xMm: 15, yMm: 10, wMm: 40, hMm: 12 },
        z: 1,
      },
    ],
  },
  body: {
    elements: [
      {
        id: 'el_title',
        type: 'text',
        frame: { xMm: 15, yMm: 30, wMm: 80, hMm: 8 },
        z: 1,
        visibleWhen: null,
      },
      {
        id: 'el_rule',
        type: 'shape',
        frame: { xMm: 15, yMm: 40, wMm: 180, hMm: 0 },
        z: 0,
      },
      {
        id: 'el_table',
        type: 'dataTable',
        // Growing element: height is computed by the paginator (hMm = null).
        frame: { xMm: 15, yMm: 60, wMm: 180, hMm: null },
        z: 1,
      },
    ],
  },
  footer: {
    elements: [
      {
        id: 'el_page_no',
        type: 'text',
        frame: { xMm: 15, yMm: 282, wMm: 180, hMm: 6 },
        z: 1,
      },
    ],
  },
} satisfies RendaraTemplate;

/** Exhaustive over `ElementType`: omitting a key fails to compile. */
const ELEMENT_LABELS = {
  text: 'Text',
  shape: 'Shape',
  image: 'Image',
  dataTable: 'Data table',
} satisfies Record<ElementType, string>;

const allElements: readonly TemplateElement[] = [
  ...fixture.header.elements,
  ...fixture.body.elements,
  ...fixture.footer.elements,
];

describe('core document model (E1-S1)', () => {
  it('accepts a hand-written fixture assignable to RendaraTemplate', () => {
    // Compile-time proof (no-op at runtime) that the fixture's type is the
    // contract type.
    assertType<RendaraTemplate>(fixture);
    expect(fixture.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('exposes the three page bands', () => {
    expect(fixture.header.elements.length).toBeGreaterThan(0);
    expect(fixture.body.elements.length).toBeGreaterThan(0);
    expect(fixture.footer.elements.length).toBeGreaterThan(0);
  });

  it('every element carries a known, labelled type', () => {
    for (const element of allElements) {
      expect(ELEMENT_LABELS[element.type]).toEqual(expect.any(String));
    }
  });

  it('exercises all four stubbed element types', () => {
    const present = new Set(allElements.map((element) => element.type));
    expect(present).toEqual(new Set<ElementType>(['text', 'shape', 'image', 'dataTable']));
  });

  it('models a growing data table with a null height', () => {
    const table = fixture.body.elements.find((element) => element.type === 'dataTable');
    expect(table?.frame.hMm).toBeNull();
  });
});
