import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import type { RendaraTemplate, TemplateElement } from '@rendara/report-schema';
import { PreviewMode } from './preview-mode';
import { DesignerStore } from '../state/designer-store';
import { createEmptyTemplate } from '../state/template-ops';
import { parseSampleData } from '../state/sample-data';

/** A text element bound to `expr`, placed on the sheet. */
function boundText(expr: string): TemplateElement {
  return {
    id: 'el_text',
    type: 'text',
    text: 'Text',
    frame: { xMm: 15, yMm: 20, wMm: 80, hMm: 10 },
    z: 1,
    binding: { expr, format: null, fallback: '' },
  } as TemplateElement;
}

/**
 * Renders the preview, then seeds the store with `element` and (optionally) the
 * imported sample `data` and enters preview. The store is a root singleton, so the
 * component reacts to these signal changes after a `detectChanges()` — the same
 * render-first ordering the other designer component specs use.
 */
async function setup(
  element: TemplateElement,
  data: unknown | null,
  fileName = 'invoice-sample.json',
) {
  const view = await render(PreviewMode);
  const store = TestBed.inject(DesignerStore);
  store.addElement(element);
  if (data !== null) {
    const parsed = parseSampleData(JSON.stringify(data), fileName);
    if (!parsed.ok) throw new Error('seed parse failed');
    store.setSampleData(parsed.data);
  }
  store.enterPreview();
  view.detectChanges();
  return { view, store };
}

const INVOICE = { invoice: { customer: { name: 'Acme Corp' } } };

describe('PreviewMode', () => {
  it('renders the shared document and previews the resolved binding value', async () => {
    const { view } = await setup(boundText('invoice.customer.name'), INVOICE);

    // The shared renderer host is present (the very component the viewer uses).
    expect(view.container.querySelector('rdr-report-document')).not.toBeNull();
    // The bound value resolves against the sample data (async — JSONata).
    await waitFor(() => expect(screen.getByText('Acme Corp', { exact: true })).toBeTruthy());
  });

  it('renders in view mode — no design-mode selection anchors leak into the output', async () => {
    const { view } = await setup(boundText('invoice.customer.name'), INVOICE);

    await waitFor(() => expect(screen.getByText('Acme Corp', { exact: true })).toBeTruthy());
    // The viewer's view-mode output carries none of the design hit targets / markers.
    expect(view.container.querySelector('[data-rdr-hit]')).toBeNull();
    expect(view.container.querySelector('[data-rdr-mode="design"]')).toBeNull();
  });

  it('shows the PREVIEW badge, page counter and sample-data source hint', async () => {
    await setup(boundText('invoice.customer.name'), INVOICE, 'my-data.json');

    expect(screen.getByText('Preview')).toBeTruthy();
    expect(screen.getByText('1 / 1')).toBeTruthy();
    expect(screen.getByText('Rendered with my-data.json')).toBeTruthy();
  });

  it('notes when no sample data is imported', async () => {
    await setup(boundText('invoice.customer.name'), null);
    expect(screen.getByText('No sample data imported')).toBeTruthy();
  });

  it('returns to the editor when Back to editor is activated', async () => {
    const { store } = await setup(boundText('invoice.customer.name'), INVOICE);

    await fireEvent.click(screen.getByRole('button', { name: 'Back to editor' }));
    expect(store.previewMode()).toBe(false);
  });

  it('exits preview on Escape', async () => {
    const { view, store } = await setup(boundText('invoice.customer.name'), INVOICE);

    await fireEvent.keyDown(view.container.firstElementChild as Element, { key: 'Escape' });
    expect(store.previewMode()).toBe(false);
  });

  it('clamps page navigation to the single rendered page', async () => {
    await setup(boundText('invoice.customer.name'), INVOICE);

    const prev = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });
    // A one-page document has nothing before or after the current page.
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    expect((next as HTMLButtonElement).disabled).toBe(true);
  });

  /**
   * RTL preview (E10-S2): the preview derives the document direction from the
   * template's `metadata.locale`, so an Arabic template previews right-to-left —
   * the same direction the viewer will render for that template.
   */
  it('previews an Arabic-locale template right-to-left', async () => {
    const view = await render(PreviewMode);
    const store = TestBed.inject(DesignerStore);
    const arabic: RendaraTemplate = {
      ...createEmptyTemplate(),
      metadata: { ...createEmptyTemplate().metadata, locale: 'ar-EG' },
      body: {
        elements: [
          {
            id: 'el_ar',
            type: 'text',
            frame: { xMm: 15, yMm: 20, wMm: 80, hMm: 10 },
            z: 1,
            text: 'فاتورة',
          } as TemplateElement,
        ],
      },
    };
    store.loadTemplate(arabic);
    store.enterPreview();
    view.detectChanges();

    const page = view.container.querySelector<HTMLElement>('.rdr-page');
    expect(page?.getAttribute('dir')).toBe('rtl');
  });

  it('previews the default (en) template left-to-right (no dir marker)', async () => {
    const { view } = await setup(boundText('invoice.customer.name'), INVOICE);
    const page = view.container.querySelector<HTMLElement>('.rdr-page');
    expect(page?.getAttribute('dir')).toBeNull();
  });
});
