import { describe, expect, it } from 'vitest';
import {
  goldenCertificateTemplate,
  goldenInvoiceData,
  goldenInvoiceTemplate,
  isDataTableElement,
  type RendaraTemplate,
} from '@rendara/report-schema';
import {
  mmToPx,
  paginate,
  resolveDataTable,
  type ResolvedDataTable,
  type Watermark,
} from '@rendara/report-engine';

import { buildPageViewModel } from './page-view-model';
import { serializePageToHtml } from './serialize-page-html';

/**
 * Serializer tests (E4-S1). The serializer feeds the visual-regression harness,
 * so it must emit the same positioned geometry as the component, derived from the
 * shared style helpers.
 */
describe('serializePageToHtml (E4-S1)', () => {
  function certificateHtml(): string {
    const doc = paginate(goldenCertificateTemplate, new Map());
    return serializePageToHtml(buildPageViewModel(doc.pages[0], doc.geometry));
  }

  it('emits a page sheet, a printable guide, and one box per element', () => {
    const html = certificateHtml();

    expect(html).toContain('class="rdr-page"');
    expect(html).toContain('class="rdr-printable"');

    const boxCount = (html.match(/class="rdr-element"/g) ?? []).length;
    expect(boxCount).toBe(goldenCertificateTemplate.body.elements.length);
  });

  it('positions an element box at its px coordinates with its id and type', () => {
    const html = certificateHtml();

    expect(html).toContain('data-element-id="el_cert_border"');
    expect(html).toContain('data-element-type="shape"');
    expect(html).toContain(`left: ${mmToPx(10)}px`);
    expect(html).toContain(`top: ${mmToPx(10)}px`);
  });

  it('escapes attribute values it interpolates', () => {
    const doc = paginate(goldenCertificateTemplate, new Map());
    const vm = buildPageViewModel(doc.pages[0], doc.geometry);
    const tampered = {
      ...vm,
      elements: [{ ...vm.elements[0], id: 'a"<b' }],
    };
    const html = serializePageToHtml(tampered);

    expect(html).toContain('data-element-id="a&quot;&lt;b"');
    expect(html).not.toContain('data-element-id="a"<b"');
  });
});

describe('serializePageToHtml content (E4-S2)', () => {
  function certificateContentHtml(): string {
    const doc = paginate(goldenCertificateTemplate, new Map());
    return serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenCertificateTemplate }),
    );
  }

  it('emits text runs, inline-SVG shapes and images', () => {
    const html = certificateContentHtml();
    expect(html).toContain('<div class="rdr-text"');
    expect(html).toContain('Certificate of Completion');
    expect(html).toContain('<svg class="rdr-shape"');
    expect(html).toContain('<rect');
    expect(html).toContain('<line');
    expect(html).toContain('<ellipse');
    expect(html).toContain('<img class="rdr-image"');
  });

  it('escapes text content it interpolates', () => {
    const doc = paginate(goldenCertificateTemplate, new Map());
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenCertificateTemplate,
    });
    const tampered = {
      ...vm,
      elements: [
        {
          ...vm.elements[0],
          content: { kind: 'text' as const, text: '<script>&', textStyle: {} },
        },
      ],
    };
    const html = serializePageToHtml(tampered);
    expect(html).toContain('&lt;script&gt;&amp;');
    expect(html).not.toContain('<script>&');
  });

  it('omits the <img> tag entirely for a malicious image URL', () => {
    const template: RendaraTemplate = {
      ...goldenCertificateTemplate,
      header: { elements: [] },
      footer: { elements: [] },
      body: {
        elements: [
          {
            id: 'el_evil',
            type: 'image',
            frame: { xMm: 10, yMm: 10, wMm: 20, hMm: 20 },
            src: 'javascript:alert(1)',
            fit: 'contain',
            z: 1,
          },
        ],
      },
    };
    const doc = paginate(template, new Map());
    const html = serializePageToHtml(buildPageViewModel(doc.pages[0], doc.geometry, { template }));

    expect(html).toContain('data-element-id="el_evil"');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
  });
});

describe('serializePageToHtml tables (E4-S3)', () => {
  async function invoiceTableHtml(): Promise<string> {
    const resolved = new Map<string, ResolvedDataTable>();
    for (const element of goldenInvoiceTemplate.body.elements) {
      if (isDataTableElement(element)) {
        resolved.set(element.id, await resolveDataTable(element, goldenInvoiceData));
      }
    }
    const doc = paginate(goldenInvoiceTemplate, resolved);
    return serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenInvoiceTemplate }),
    );
  }

  it('emits a positioned table container with header, detail and footer rows', async () => {
    const html = await invoiceTableHtml();
    expect(html).toContain(
      'class="rdr-table" role="table" aria-label="Data table" data-table-id="el_inv_table"',
    );
    expect(html).toContain('data-row-kind="header"');
    expect(html).toContain('data-row-kind="detail"');
    expect(html).toContain('data-row-kind="columnFooter"');
    expect(html).toContain('data-column-key="amt"');
    expect(html).toContain('Design consultation'); // a detail cell
    expect(html).toContain('$3,060.00'); // the grand total
  });

  it('marks up the table with ARIA table semantics (E10-S1, WCAG 2.2 AA)', async () => {
    const html = await invoiceTableHtml();
    // Container is a table; header cells are columnheaders; data cells are cells.
    expect(html).toContain('role="table"');
    expect(html).toContain('<div class="rdr-table-row" role="row" data-row-kind="header"');
    expect(html).toContain('<div class="rdr-table-cell" role="columnheader"');
    expect(html).toContain('<div class="rdr-table-cell" role="cell"');
    // Every row track carries role="row"; every cell a header/data cell role — so a
    // role="table" never has a childless (invalid) row.
    const rows = (html.match(/class="rdr-table-row"/g) ?? []).length;
    const rowRoles = (html.match(/class="rdr-table-row" role="row"/g) ?? []).length;
    expect(rowRoles).toBe(rows);
  });

  it('escapes cell text it interpolates', () => {
    const doc = paginate(goldenCertificateTemplate, new Map());
    const vm = buildPageViewModel(doc.pages[0], doc.geometry);
    const tampered = {
      ...vm,
      tables: [
        {
          elementId: 'el_t',
          leftPx: 0,
          topPx: 0,
          widthPx: 100,
          heightPx: 20,
          zIndex: 1,
          rows: [
            {
              kind: 'detail' as const,
              topPx: 0,
              heightPx: 20,
              widthPx: 100,
              cells: [{ columnKey: 'a', text: '<b>&', leftPx: 0, widthPx: 100, cellStyle: {} }],
              label: null,
              rowStyle: {},
              continued: false,
            },
          ],
        },
      ],
    };
    const html = serializePageToHtml(tampered);
    expect(html).toContain('&lt;b&gt;&amp;');
    expect(html).not.toContain('<b>&');
  });
});

describe('serializePageToHtml watermark (E4-S7)', () => {
  const watermark: Watermark = {
    type: 'text',
    text: 'CONFIDENTIAL',
    opacity: 0.15,
    angleDeg: -45,
    color: '#9CA3AF',
  };

  function certificateDoc() {
    return paginate(goldenCertificateTemplate, new Map());
  }

  it('emits the watermark layer before the element boxes (behind content)', () => {
    const doc = certificateDoc();
    const html = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, {
        template: goldenCertificateTemplate,
        watermark,
      }),
    );

    expect(html).toContain('class="rdr-watermark"');
    expect(html).toContain('class="rdr-watermark-text"');
    expect(html).toContain('CONFIDENTIAL');
    expect(html).toContain('rotate(-45deg)');
    // The watermark is painted first (behind), so it precedes the first element box.
    expect(html.indexOf('class="rdr-watermark"')).toBeLessThan(html.indexOf('class="rdr-element"'));
  });

  it('emits an <img> for an image watermark with a sanitised src', () => {
    const doc = certificateDoc();
    const html = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, {
        watermark: {
          type: 'image',
          src: 'https://cdn.example/seal.png',
          opacity: 0.3,
          angleDeg: 0,
        },
      }),
    );
    expect(html).toContain('<img class="rdr-watermark-image"');
    expect(html).toContain('src="https://cdn.example/seal.png"');
  });

  it('escapes the watermark caption it interpolates', () => {
    const doc = certificateDoc();
    const html = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, {
        watermark: { ...watermark, text: '<b>&' },
      }),
    );
    expect(html).toContain('&lt;b&gt;&amp;');
    expect(html).not.toContain('<b>&');
  });

  it('keeps the page byte-stable when no watermark is configured', () => {
    const doc = certificateDoc();
    const noWatermark = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenCertificateTemplate }),
    );
    const nullWatermark = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, {
        template: goldenCertificateTemplate,
        watermark: null,
      }),
    );
    expect(nullWatermark).toBe(noWatermark);
    expect(noWatermark).not.toContain('rdr-watermark');
  });
});

describe('serializePageToHtml design-mode hooks (E4-S6)', () => {
  async function invoiceDoc() {
    const resolved = new Map<string, ResolvedDataTable>();
    for (const element of goldenInvoiceTemplate.body.elements) {
      if (isDataTableElement(element)) {
        resolved.set(element.id, await resolveDataTable(element, goldenInvoiceData));
      }
    }
    return paginate(goldenInvoiceTemplate, resolved);
  }

  /** Strips every additive `data-rdr-*` design attribute the design path emits. */
  function stripDesignAttrs(html: string): string {
    return html.replace(/ data-rdr-[a-z]+="[^"]*"/g, '');
  }

  it('emits no design attributes in view mode (the default)', async () => {
    const doc = await invoiceDoc();
    const html = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenInvoiceTemplate }),
    );

    expect(html).not.toContain('data-rdr-mode');
    expect(html).not.toContain('data-rdr-hit');
    expect(html).not.toContain('data-rdr-x');
  });

  it('marks the page and exposes per-element + per-table hit anchors in design mode', async () => {
    const doc = await invoiceDoc();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenInvoiceTemplate,
      mode: 'design',
    });
    const html = serializePageToHtml(vm);

    expect(html).toContain('class="rdr-page"');
    expect(html).toContain('data-rdr-mode="design"');
    expect(html).toContain('data-rdr-hit="element"');
    expect(html).toContain('data-rdr-hit="table"');

    // The first element's anchor carries its natural-px frame.
    const box = vm.elements[0];
    expect(html).toContain(`data-rdr-x="${box.leftPx}"`);
    expect(html).toContain(`data-rdr-y="${box.topPx}"`);
    expect(html).toContain(`data-rdr-w="${box.widthPx}"`);
  });

  it('keeps view-mode output byte-stable: design mode is purely additive', async () => {
    const doc = await invoiceDoc();
    const viewHtml = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenInvoiceTemplate }),
    );
    const designHtml = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, {
        template: goldenInvoiceTemplate,
        mode: 'design',
      }),
    );

    // The design output differs only by the additive `data-rdr-*` anchors; remove
    // them and the bytes are identical to the view output.
    expect(designHtml).not.toBe(viewHtml);
    expect(stripDesignAttrs(designHtml)).toBe(viewHtml);
  });

  it('explicit view mode equals the default (no anchors)', async () => {
    const doc = await invoiceDoc();
    const defaultHtml = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenInvoiceTemplate }),
    );
    const explicitView = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, {
        template: goldenInvoiceTemplate,
        mode: 'view',
      }),
    );

    expect(explicitView).toBe(defaultHtml);
  });
});

describe('serializePageToHtml search highlighting (E8-S6)', () => {
  async function invoiceDoc() {
    const resolved = new Map<string, ResolvedDataTable>();
    for (const element of goldenInvoiceTemplate.body.elements) {
      if (isDataTableElement(element)) {
        resolved.set(element.id, await resolveDataTable(element, goldenInvoiceData));
      }
    }
    return paginate(goldenInvoiceTemplate, resolved);
  }

  it('is byte-identical to the default when no highlight query is supplied', async () => {
    const doc = await invoiceDoc();
    const defaultHtml = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenInvoiceTemplate }),
    );
    const emptyQuery = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, {
        template: goldenInvoiceTemplate,
        highlightQuery: '',
      }),
    );
    expect(emptyQuery).toBe(defaultHtml);
    // A query that matches nothing also leaves the output untouched.
    const noMatch = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, {
        template: goldenInvoiceTemplate,
        highlightQuery: 'zzzznomatch',
      }),
    );
    expect(noMatch).toBe(defaultHtml);
  });

  it('wraps matched runs in <mark class="rdr-mark"> for the title literal', async () => {
    const doc = await invoiceDoc();
    const html = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, {
        template: goldenInvoiceTemplate,
        highlightQuery: 'invoice',
      }),
    );
    // The title literal "INVOICE" is wrapped (case-insensitive match).
    expect(html).toContain('<mark class="rdr-mark">INVOICE</mark>');
  });

  it('escapes matched text inside the mark', () => {
    const doc = paginate(goldenCertificateTemplate, new Map());
    const vm = buildPageViewModel(doc.pages[0], doc.geometry);
    const tampered = {
      ...vm,
      elements: [
        {
          id: 'el_x',
          type: 'text' as const,
          leftPx: 0,
          topPx: 0,
          widthPx: 10,
          heightPx: 10,
          zIndex: 0,
          boxStyle: {},
          content: {
            kind: 'text' as const,
            text: '<b>x</b>',
            textStyle: {},
            segments: [{ text: '<b>x</b>', mark: true }],
          },
        },
      ],
    };
    const html = serializePageToHtml(tampered);
    expect(html).toContain('<mark class="rdr-mark">&lt;b&gt;x&lt;/b&gt;</mark>');
  });
});

/**
 * RTL serialization (E10-S2) — the serializer emits the same `dir="rtl"` marker
 * on the page sheet the Angular component binds, so the visual-regression harness
 * snapshots a real RTL page. The marker is additive: an LTR page never carries it,
 * so every existing golden stays byte-identical.
 */
describe('serializePageToHtml RTL (E10-S2)', () => {
  it('emits dir="rtl" and a right-to-left sheet direction for an rtl page', () => {
    const doc = paginate(goldenCertificateTemplate, new Map());
    const html = serializePageToHtml(
      buildPageViewModel(doc.pages[0], doc.geometry, { direction: 'rtl' }),
    );
    expect(html).toContain('class="rdr-page"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('direction: rtl');
  });

  it('omits the dir marker for an ltr page (byte-stable)', () => {
    const doc = paginate(goldenCertificateTemplate, new Map());
    const html = serializePageToHtml(buildPageViewModel(doc.pages[0], doc.geometry));
    expect(html).not.toContain('dir="rtl"');
    expect(html).not.toContain('direction: rtl');
  });
});
