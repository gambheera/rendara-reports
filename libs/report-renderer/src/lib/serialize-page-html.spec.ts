import { describe, expect, it } from 'vitest';
import { goldenCertificateTemplate, type RendaraTemplate } from '@rendara/report-schema';
import { mmToPx, paginate } from '@rendara/report-engine';

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
