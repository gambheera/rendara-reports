import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/angular';
import {
  goldenCertificateData,
  goldenCertificateTemplate,
  type RendaraTemplate,
} from '@rendara/report-schema';
import {
  mmToPx,
  paginate,
  resolveElement,
  type PaginatedDocument,
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
