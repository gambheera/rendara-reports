import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/angular';
import {
  goldenCertificateData,
  goldenCertificateTemplate,
  goldenInvoiceData,
  goldenInvoiceTemplate,
  goldenTabularReportData,
  goldenTabularReportTemplate,
  isDataTableElement,
  type RendaraTemplate,
} from '@rendara/report-schema';
import {
  mmToPx,
  paginate,
  resolveDataTable,
  resolveElement,
  type PaginatedDocument,
  type ResolvedDataTable,
  type Watermark,
} from '@rendara/report-engine';

import { ReportRenderer } from './report-renderer';

/**
 * Component tests (E4-S1, QA: "component test asserts element positions").
 * Renders the certificate golden page and asserts the sheet frame, printable
 * area, background, zoom transform, and absolute element positions in the DOM.
 */

function certificatePage(): PaginatedDocument {
  return paginate(goldenCertificateTemplate, new Map());
}

async function renderCertificate(inputs?: { zoom?: number; background?: string | null }) {
  const doc = certificatePage();
  const { container } = await render(ReportRenderer, {
    inputs: {
      page: doc.pages[0],
      geometry: doc.geometry,
      ...(inputs ?? {}),
    },
  });
  return container;
}

/** Queries a required element, failing the test (not returning `null`) when absent. */
function el(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`expected to find "${selector}"`);
  return found;
}

describe('ReportRenderer (E4-S1)', () => {
  it('renders a page sheet sized in px with a default white background', async () => {
    const sheet = el(await renderCertificate(), '.rdr-page');

    expect(sheet.style.width).toBe(`${mmToPx(297)}px`);
    expect(sheet.style.height).toBe(`${mmToPx(210)}px`);
    expect(sheet.style.background).toBe('rgb(255, 255, 255)');
    expect(sheet.style.transform).toBe('scale(1)');
  });

  it('applies a supplied background and zoom', async () => {
    const sheet = el(await renderCertificate({ zoom: 1.5, background: '#102030' }), '.rdr-page');

    expect(sheet.style.transform).toBe('scale(1.5)');
    expect(sheet.style.background).toBe('rgb(16, 32, 48)');
  });

  it('renders the printable-area guide inset by the margins', async () => {
    const printable = el(await renderCertificate(), '.rdr-printable');

    expect(printable.style.left).toBe(`${mmToPx(15)}px`);
    expect(printable.style.top).toBe(`${mmToPx(20)}px`);
    expect(printable.style.width).toBe(`${mmToPx(297 - 15 - 15)}px`);
    expect(printable.style.height).toBe(`${mmToPx(210 - 20 - 20)}px`);
  });

  it('renders one absolutely-positioned host box per element, at its px position', async () => {
    const container = await renderCertificate();
    const boxes = container.querySelectorAll<HTMLElement>('.rdr-element');

    expect(boxes).toHaveLength(goldenCertificateTemplate.body.elements.length);

    const border = el(container, '[data-element-id="el_cert_border"]');
    expect(border.style.position).toBe('absolute');
    expect(border.style.left).toBe(`${mmToPx(10)}px`);
    expect(border.style.top).toBe(`${mmToPx(10)}px`);
    expect(border.style.width).toBe(`${mmToPx(277)}px`);
    expect(border.style.height).toBe(`${mmToPx(190)}px`);
    expect(border.getAttribute('data-element-type')).toBe('shape');

    const title = el(container, '[data-element-id="el_cert_title"]');
    expect(title.style.left).toBe(`${mmToPx(40)}px`);
    expect(title.style.top).toBe(`${mmToPx(44)}px`);
    expect(title.style.zIndex).toBe('2');
  });

  it('tags the sheet with the page number', async () => {
    const sheet = el(await renderCertificate(), '.rdr-page');
    expect(sheet.getAttribute('data-page-number')).toBe('1');
  });
});

/**
 * Element content (E4-S2, QA: "per-type" + "malicious image URL is neutralised").
 * Renders the certificate golden with its template + resolved bindings and
 * asserts text/shape/image content in the live DOM, plus the image-URL security.
 */
async function resolveCertificateValues(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const element of goldenCertificateTemplate.body.elements) {
    const resolved = await resolveElement(element, goldenCertificateData);
    if (resolved) map.set(element.id, resolved.formatted);
  }
  return map;
}

async function renderCertificateWithContent() {
  const doc = certificatePage();
  const { container } = await render(ReportRenderer, {
    inputs: {
      page: doc.pages[0],
      geometry: doc.geometry,
      template: goldenCertificateTemplate,
      resolvedValues: await resolveCertificateValues(),
    },
  });
  return container;
}

describe('ReportRenderer content (E4-S2)', () => {
  it('paints a static text element with its resolved styles', async () => {
    const container = await renderCertificateWithContent();
    const box = el(container, '[data-element-id="el_cert_title"]');
    const text = el(box, '.rdr-text');

    expect(text.textContent).toBe('Certificate of Completion');
    expect(text.style.textAlign).toBe('center');
    expect(text.style.fontWeight).toBe('bold');
    expect(box.style.display).toBe('flex');
  });

  it('paints a data-bound text element from the resolved values', async () => {
    const container = await renderCertificateWithContent();
    const box = el(container, '[data-element-id="el_cert_recipient"]');
    expect(el(box, '.rdr-text').textContent).toBe('Jane A. Smith');
  });

  it('paints each shape as an inline SVG with stroke/fill', async () => {
    const container = await renderCertificateWithContent();

    const rect = el(container, '[data-element-id="el_cert_border"] svg rect');
    expect(rect.getAttribute('stroke')).toBe('#4F46E5');

    const line = el(container, '[data-element-id="el_cert_rule"] svg line');
    expect(line.getAttribute('x1')).toBe('0');

    const ellipse = el(container, '[data-element-id="el_cert_seal"] svg ellipse');
    expect(ellipse.getAttribute('fill')).toBe('#EEF2FF');
  });

  it('paints an image with object-fit and a sanitised src', async () => {
    const container = await renderCertificateWithContent();
    const img = el(container, '[data-element-id="el_cert_logo"] img');
    expect(img.getAttribute('src')).toBe('https://assets.rendara.dev/rendara-academy.png');
    expect(img.style.objectFit).toBe('contain');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('neutralises a malicious image URL (no img is rendered)', async () => {
    const template: RendaraTemplate = {
      ...goldenCertificateTemplate,
      header: { elements: [] },
      footer: { elements: [] },
      body: {
        elements: [
          {
            id: 'el_evil_img',
            type: 'image',
            frame: { xMm: 20, yMm: 20, wMm: 40, hMm: 20 },
            src: 'javascript:alert(document.cookie)',
            fit: 'contain',
            z: 1,
          },
        ],
      },
    };
    const doc = paginate(template, new Map());
    const { container } = await render(ReportRenderer, {
      inputs: { page: doc.pages[0], geometry: doc.geometry, template },
    });

    const box = el(container, '[data-element-id="el_evil_img"]');
    // The dangerous URL is dropped entirely — no <img> with a javascript: src.
    expect(box.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
  });
});

/**
 * Data-table rendering (E4-S3, QA: "renders the paginated table model … incl.
 * repeated headers, group headers/footers, aggregates, alignment"). Drives the
 * real engine over the invoice (plain) and tabular (grouped) goldens and asserts
 * the live table DOM: container, rows by kind, cells, alignment, and band labels.
 */
async function paginateWithTables(
  template: RendaraTemplate,
  data: unknown,
): Promise<PaginatedDocument> {
  const resolved = new Map<string, ResolvedDataTable>();
  for (const element of template.body.elements) {
    if (isDataTableElement(element)) {
      resolved.set(element.id, await resolveDataTable(element, data));
    }
  }
  return paginate(template, resolved);
}

async function renderInvoiceTable() {
  const doc = await paginateWithTables(goldenInvoiceTemplate, goldenInvoiceData);
  const { container } = await render(ReportRenderer, {
    inputs: { page: doc.pages[0], geometry: doc.geometry, template: goldenInvoiceTemplate },
  });
  return container;
}

describe('ReportRenderer tables (E4-S3)', () => {
  it('renders a positioned table container at its element frame left', async () => {
    const container = await renderInvoiceTable();
    const table = el(container, '.rdr-table[data-table-id="el_inv_table"]');
    expect(table.style.position).toBe('absolute');
    expect(table.style.left).toBe(`${mmToPx(15)}px`);
  });

  it('renders header, detail and grand-total rows with cell text', async () => {
    const container = await renderInvoiceTable();
    const table = el(container, '.rdr-table[data-table-id="el_inv_table"]');

    const header = el(table, '.rdr-table-row[data-row-kind="header"]');
    const headerTexts = Array.from(header.querySelectorAll('.rdr-table-cell')).map((c) =>
      c.textContent?.trim(),
    );
    expect(headerTexts).toEqual(['Description', 'Qty', 'Unit Price', 'Amount']);

    const details = table.querySelectorAll('.rdr-table-row[data-row-kind="detail"]');
    expect(details).toHaveLength(goldenInvoiceData.invoice.lineItems.length);

    const footer = el(table, '.rdr-table-row[data-row-kind="columnFooter"]');
    const amountCell = el(footer, '.rdr-table-cell[data-column-key="amt"]');
    expect(amountCell.textContent?.trim()).toBe('$3,060.00');
  });

  it('right-aligns numeric columns via the cell style', async () => {
    const container = await renderInvoiceTable();
    const table = el(container, '.rdr-table[data-table-id="el_inv_table"]');
    const header = el(table, '.rdr-table-row[data-row-kind="header"]');
    expect(el(header, '.rdr-table-cell[data-column-key="desc"]').style.textAlign).toBe('left');
    expect(el(header, '.rdr-table-cell[data-column-key="amt"]').style.textAlign).toBe('right');
  });

  it('renders a group header band label and subtotal footer (grouped)', async () => {
    const doc = await paginateWithTables(goldenTabularReportTemplate, goldenTabularReportData);
    const { container } = await render(ReportRenderer, {
      inputs: { page: doc.pages[0], geometry: doc.geometry, template: goldenTabularReportTemplate },
    });
    const table = el(container, '.rdr-table[data-table-id="el_rpt_table"]');

    const groupHeader = el(table, '.rdr-table-row[data-row-kind="groupHeader"]');
    expect(el(groupHeader, '.rdr-table-label').textContent?.trim()).toBe('Region: North');

    const groupFooter = el(table, '.rdr-table-row[data-row-kind="groupFooter"]');
    expect(el(groupFooter, '.rdr-table-cell[data-column-key="units"]').textContent?.trim()).toBe(
      '244',
    );
  });
});

/**
 * Design-mode hooks (E4-S6, QA: "view-mode DOM is byte-stable regardless of design
 * hooks"). View mode (the default) emits no selection anchors; design mode marks the
 * page and exposes per-element + per-table hit targets with their natural-px frame.
 */
describe('ReportRenderer design-mode hooks (E4-S6)', () => {
  async function renderInvoice(mode?: 'view' | 'design') {
    const doc = await paginateWithTables(goldenInvoiceTemplate, goldenInvoiceData);
    const { container } = await render(ReportRenderer, {
      inputs: {
        page: doc.pages[0],
        geometry: doc.geometry,
        template: goldenInvoiceTemplate,
        ...(mode ? { mode } : {}),
      },
    });
    return container;
  }

  it('emits no design anchors in view mode (the default)', async () => {
    const container = await renderInvoice();

    expect(el(container, '.rdr-page').hasAttribute('data-rdr-mode')).toBe(false);
    expect(container.querySelector('[data-rdr-hit]')).toBeNull();
  });

  it('marks the page and every element/table as a hit target in design mode', async () => {
    const container = await renderInvoice('design');

    expect(el(container, '.rdr-page').getAttribute('data-rdr-mode')).toBe('design');

    const elementHits = container.querySelectorAll('.rdr-element[data-rdr-hit="element"]');
    expect(elementHits.length).toBe(
      container.querySelectorAll('.rdr-element').length,
    );
    expect(container.querySelector('.rdr-table[data-rdr-hit="table"]')).not.toBeNull();
  });

  it("exposes an element's natural-px frame on its anchor", async () => {
    const container = await renderInvoice('design');
    // el_inv_title sits at the page's first body text element; assert its frame
    // metadata mirrors the inline geometry the renderer positioned it with.
    const box = el(container, '.rdr-element[data-element-id="el_inv_title"]');
    expect(box.getAttribute('data-rdr-hit')).toBe('element');
    expect(box.getAttribute('data-rdr-x')).toBe(`${parseFloat(box.style.left)}`);
    expect(box.getAttribute('data-rdr-y')).toBe(`${parseFloat(box.style.top)}`);
    expect(box.getAttribute('data-rdr-w')).toBe(`${parseFloat(box.style.width)}`);
  });

  it('keeps view-mode DOM free of any design-hook bytes (explicit view)', async () => {
    // Byte-for-byte equality of view vs design output is pinned by the headless
    // serializer spec; here we confirm the live component emits no `data-rdr-*`
    // when view mode is asked for explicitly.
    const container = await renderInvoice('view');
    expect(container.innerHTML).not.toContain('data-rdr-');
  });
});

/**
 * Watermark (E4-S7, QA: "visual snapshot with watermark"). Confirms the live
 * component paints the centred, rotated overlay behind the content when a
 * watermark is supplied, sanitises an image watermark, and renders nothing extra
 * when none is configured.
 */
describe('ReportRenderer watermark (E4-S7)', () => {
  const watermark: Watermark = {
    type: 'text',
    text: 'CONFIDENTIAL',
    opacity: 0.15,
    angleDeg: -45,
    color: '#9CA3AF',
  };

  async function renderWith(watermarkInput: Watermark | null) {
    const doc = certificatePage();
    const { container } = await render(ReportRenderer, {
      inputs: {
        page: doc.pages[0],
        geometry: doc.geometry,
        template: goldenCertificateTemplate,
        watermark: watermarkInput,
      },
    });
    return container;
  }

  it('paints a rotated text watermark behind the content', async () => {
    const container = await renderWith(watermark);
    const layer = el(container, '.rdr-watermark');
    expect(layer.style.pointerEvents).toBe('none');
    expect(layer.style.opacity).toBe('0.15');

    const caption = el(layer, '.rdr-watermark-text');
    expect(caption.textContent?.trim()).toBe('CONFIDENTIAL');
    expect(caption.style.transform).toBe('rotate(-45deg)');
    expect(caption.style.color).toBe('rgb(156, 163, 175)');
  });

  it('sanitises an image watermark src', async () => {
    const doc = certificatePage();
    const { container } = await render(ReportRenderer, {
      inputs: {
        page: doc.pages[0],
        geometry: doc.geometry,
        watermark: { type: 'image', src: 'javascript:alert(1)', opacity: 0.3, angleDeg: 0 },
      },
    });
    // The blocked src yields no watermark view at all → no overlay element.
    expect(container.querySelector('.rdr-watermark')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('renders no watermark overlay when none is configured', async () => {
    const container = await renderWith(null);
    expect(container.querySelector('.rdr-watermark')).toBeNull();
  });
});
