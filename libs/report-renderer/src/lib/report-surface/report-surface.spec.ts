import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/angular';
import { goldenCertificateTemplate, type RendaraTemplate } from '@rendara/report-schema';
import { paginate, type PaginatedDocument, type ResolvedDataTable } from '@rendara/report-engine';

import { ReportSurface } from './report-surface';

/**
 * Component tests for the opt-in Shadow-DOM surface (E4-S5). They assert the
 * surface renders into a real shadow root (the isolation boundary), injects the
 * shared reset/theme/chrome stylesheet into that root, forwards its inputs to the
 * nested {@link ReportDocument} (page count, single-page selection, zoom), and
 * re-emits `zoomChange`. The shadow boundary itself (host CSS cannot cross) is
 * covered end-to-end by the style-isolation e2e.
 */

/** The certificate golden paginates to a single, table-free page — enough to assert isolation. */
function certificateDoc(): PaginatedDocument {
  return paginate(goldenCertificateTemplate, new Map());
}

/** A minimal A4-portrait template with one table that grows across pages. */
function syntheticTemplate(): RendaraTemplate {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Surface Doc',
      id: 'fixture-surface-0001',
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
    header: { elements: [] },
    body: {
      elements: [
        {
          id: 'el_surface_table',
          type: 'dataTable',
          frame: { xMm: 15, yMm: 30, wMm: 180, hMm: null },
          source: { arrayExpr: 'rows' },
          columns: [{ key: 'a', header: 'A', cell: { expr: '$.a' }, widthMm: 180 }],
          repeatHeaderOnEachPage: true,
          keepTogether: false,
          z: 1,
        },
      ],
    },
    footer: { elements: [] },
  };
}

/** Paginates the synthetic table with enough pre-resolved rows to span multiple pages. */
function multiPageDoc(rowCount = 70): { doc: PaginatedDocument; template: RendaraTemplate } {
  const template = syntheticTemplate();
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    index: i,
    data: {},
    cells: [{ columnKey: 'a', value: { raw: `Item ${i}`, formatted: `Item ${i}` } }],
  }));
  const resolved: ResolvedDataTable = { rows, columnFooters: [], errors: [], diagnostics: [] };
  return { doc: paginate(template, new Map([['el_surface_table', resolved]])), template };
}

/** Returns the surface's shadow root, failing the test if it is absent. */
async function renderSurface(inputs: Record<string, unknown>): Promise<ShadowRoot> {
  const { fixture } = await render(ReportSurface, { inputs });
  const host = fixture.nativeElement as HTMLElement;
  if (host.shadowRoot === null) throw new Error('expected the surface to attach a shadow root');
  return host.shadowRoot;
}

describe('ReportSurface (E4-S5)', () => {
  it('renders the document into a real shadow root', async () => {
    const shadow = await renderSurface({ document: certificateDoc() });
    // The nested document/page live inside the shadow boundary, not the light DOM.
    expect(shadow.querySelector('rdr-report-document')).not.toBeNull();
    expect(shadow.querySelector('.rdr-page')).not.toBeNull();
  });

  it('injects the reset + theme + chrome stylesheet into the shadow root', async () => {
    const shadow = await renderSurface({ document: certificateDoc() });
    const css = Array.from(shadow.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    // The reset/tokens and the tokenised chrome are present inside the boundary,
    // so the report is styled even though the emulated child styles do not pierce.
    expect(css).toContain('--rdr-text-color');
    expect(css).toContain('box-shadow: var(--rdr-page-shadow);');
  });

  it('forwards the document so every page is painted (continuous)', async () => {
    const { doc, template } = multiPageDoc();
    expect(doc.pageCount).toBeGreaterThanOrEqual(2);
    const shadow = await renderSurface({ document: doc, template });
    expect(shadow.querySelectorAll('.rdr-page-slot')).toHaveLength(doc.pageCount);
  });

  it('forwards single-page layout + currentPage', async () => {
    const { doc, template } = multiPageDoc();
    const shadow = await renderSurface({
      document: doc,
      template,
      layout: 'single',
      currentPage: 2,
    });
    const slots = shadow.querySelectorAll<HTMLElement>('.rdr-page-slot');
    expect(slots).toHaveLength(1);
    expect(slots[0].getAttribute('data-page-number')).toBe('2');
  });

  it('forwards the zoom spec and re-emits the resolved factor', async () => {
    const { doc, template } = multiPageDoc();
    const zoomChange = vi.fn();
    const { fixture } = await render(ReportSurface, {
      inputs: { document: doc, template, zoom: 0.5 },
      on: { zoomChange },
    });
    const host = fixture.nativeElement as HTMLElement;
    const sheet = host.shadowRoot?.querySelector<HTMLElement>('.rdr-page');
    expect(sheet?.style.transform).toBe('scale(0.5)');
    expect(zoomChange).toHaveBeenCalledWith(0.5);
  });
});
