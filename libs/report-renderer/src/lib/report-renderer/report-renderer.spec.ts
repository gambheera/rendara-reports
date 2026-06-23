import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/angular';
import { goldenCertificateTemplate } from '@rendara/report-schema';
import { mmToPx, paginate, type PaginatedDocument } from '@rendara/report-engine';

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
