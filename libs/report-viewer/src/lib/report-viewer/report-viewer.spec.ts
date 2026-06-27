import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/angular';
import { GOLDEN_FIXTURES, type RendaraTemplate } from '@rendara/report-schema';

import { ReportViewer } from './report-viewer';
import type { PageChangeEvent, PdfExportRequest, RenderedEvent, ViewerError } from './viewer-api';

/**
 * Component tests for the viewer (E7-S1 public API + E7-S2 render pipeline).
 * These assert the component mounts, applies the theme overrides (the SSR-safe
 * host `[style]` path), runs the validate → bind → paginate → render pipeline,
 * and emits `(rendered)` / `(error)` per the brief-§8 contract. The shared
 * baseline-fidelity of the rendered document is covered in
 * `report-pipeline.spec.ts`.
 */

const golden = GOLDEN_FIXTURES[0];

/** Waits for the async pipeline (resolution is a microtask) to settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The invoice golden with enough line items to paginate to several pages, so the
 * navigation controls have somewhere to go.
 */
const multiPageData = {
  invoice: {
    ...(golden.data as { invoice: Record<string, unknown> }).invoice,
    lineItems: Array.from({ length: 120 }, (_, i) => ({
      description: `Line item ${i + 1}`,
      quantity: 1,
      unitPrice: 100,
      amount: 100,
    })),
  },
};

describe('ReportViewer (E7-S1 API)', () => {
  it('applies theme overrides as --rdr-* custom properties on the host', async () => {
    const { fixture } = await render(ReportViewer, {
      inputs: { theme: { '--rdr-accent': '#123456', '--rdr-page-gap': '24px' } },
    });

    const el = fixture.nativeElement as HTMLElement;
    expect(el.classList.contains('rdr-report-viewer')).toBe(true);
    expect(el.style.getPropertyValue('--rdr-accent')).toBe('#123456');
    expect(el.style.getPropertyValue('--rdr-page-gap')).toBe('24px');
  });

  it('sets no inline custom properties when no theme is provided', async () => {
    const { fixture } = await render(ReportViewer);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.style.getPropertyValue('--rdr-accent')).toBe('');
  });

  it('paints nothing when no template is provided', async () => {
    const { container } = await render(ReportViewer);
    await flush();
    expect(container.querySelector('.rdr-page')).toBeNull();
  });
});

describe('ReportViewer (E7-S2 pipeline)', () => {
  it('renders a golden template+data and emits (rendered) with the page count', async () => {
    const rendered = vi.fn<(e: RenderedEvent) => void>();

    const { container, fixture } = await render(ReportViewer, {
      inputs: { template: golden.template, data: golden.data },
      on: { rendered },
    });
    await flush();
    fixture.detectChanges();

    expect(container.querySelector('.rdr-page')).toBeTruthy();
    expect(rendered).toHaveBeenCalledTimes(1);
    expect(rendered.mock.calls[0][0].pageCount).toBeGreaterThanOrEqual(1);
  });

  it('renders when the template is supplied as a raw JSON string', async () => {
    const { container, fixture } = await render(ReportViewer, {
      inputs: { template: JSON.stringify(golden.template), data: golden.data },
    });
    await flush();
    fixture.detectChanges();

    expect(container.querySelector('.rdr-page')).toBeTruthy();
  });

  it('emits (error) for an invalid template instead of throwing or rendering', async () => {
    const error = vi.fn<(e: ViewerError) => void>();

    const { container, fixture } = await render(ReportViewer, {
      inputs: { template: { schemaVersion: '1.0.0' } as unknown as RendaraTemplate },
      on: { error },
    });
    await flush();
    fixture.detectChanges();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0].kind).toBe('validation');
    expect(container.querySelector('.rdr-page')).toBeNull();
  });
});

describe('ReportViewer (E7-S3 navigation)', () => {
  /** Renders the multi-page golden in the given page mode and settles the pipeline. */
  async function renderMultiPage(pageMode: 'single' | 'continuous', onPageChange = vi.fn()) {
    const harness = await render(ReportViewer, {
      inputs: { template: golden.template, data: multiPageData, config: { pageMode } },
      on: { pageChange: onPageChange as (e: PageChangeEvent) => void },
    });
    await flush();
    harness.fixture.detectChanges();
    return harness;
  }

  /** Queries a required element, failing the test (not a non-null assertion) if absent. */
  function query<T extends Element>(container: HTMLElement, selector: string): T {
    const found = container.querySelector<T>(selector);
    if (found === null) {
      throw new Error(`expected element matching "${selector}"`);
    }
    return found;
  }

  /** The `Page x of y` status text. */
  function statusText(container: HTMLElement): string {
    return container.querySelector('.rdr-viewer-status')?.textContent?.trim() ?? '';
  }

  /** The total page count parsed from the status. */
  function totalFromStatus(container: HTMLElement): number {
    return Number(statusText(container).match(/of (\d+)/)?.[1] ?? '0');
  }

  it('renders the navigation chrome and starts on page 1', async () => {
    const { container } = await renderMultiPage('single');

    expect(container.querySelector('.rdr-viewer-nav')).toBeTruthy();
    expect(container.querySelector('.rdr-viewer-rail')).toBeTruthy();
    expect(totalFromStatus(container)).toBeGreaterThan(1);
    expect(statusText(container)).toBe(`Page 1 of ${totalFromStatus(container)}`);
  });

  it('emits an initial (pageChange) of { current: 1, total }', async () => {
    const pageChange = vi.fn<(e: PageChangeEvent) => void>();
    const { container } = await renderMultiPage('single', pageChange);

    expect(pageChange).toHaveBeenCalled();
    expect(pageChange.mock.calls[0][0]).toEqual({ current: 1, total: totalFromStatus(container) });
  });

  it('renders one thumbnail per page in the rail', async () => {
    const { container } = await renderMultiPage('single');
    const thumbs = container.querySelectorAll('.rdr-viewer-thumb');
    expect(thumbs.length).toBe(totalFromStatus(container));
  });

  it('next / prev move the current page and emit (pageChange)', async () => {
    const pageChange = vi.fn<(e: PageChangeEvent) => void>();
    const { container } = await renderMultiPage('single', pageChange);
    const total = totalFromStatus(container);

    const next = query<HTMLButtonElement>(container, '[aria-label="Next page"]');
    const prev = query<HTMLButtonElement>(container, '[aria-label="Previous page"]');

    expect(prev.disabled).toBe(true);

    fireEvent.click(next);
    expect(statusText(container)).toBe(`Page 2 of ${total}`);
    expect(pageChange).toHaveBeenLastCalledWith({ current: 2, total });
    expect(prev.disabled).toBe(false);

    fireEvent.click(prev);
    expect(statusText(container)).toBe(`Page 1 of ${total}`);
    expect(pageChange).toHaveBeenLastCalledWith({ current: 1, total });
  });

  it('disables next on the last page (goto clamps past the end)', async () => {
    const { container } = await renderMultiPage('single');
    const total = totalFromStatus(container);

    const input = query<HTMLInputElement>(container, '#rdr-viewer-goto');
    input.value = String(total + 50);
    fireEvent.change(input);

    expect(statusText(container)).toBe(`Page ${total} of ${total}`);
    expect(query<HTMLButtonElement>(container, '[aria-label="Next page"]').disabled).toBe(true);
  });

  it('paints only the current page in single mode and swaps it on navigation', async () => {
    const { container } = await renderMultiPage('single');

    const mainPage = () =>
      container
        .querySelector('.rdr-viewer-scroll [data-page-number]')
        ?.getAttribute('data-page-number');
    expect(mainPage()).toBe('1');

    fireEvent.click(query<HTMLButtonElement>(container, '[aria-label="Next page"]'));
    expect(mainPage()).toBe('2');
  });

  it('navigates via the goto input', async () => {
    const { container } = await renderMultiPage('single');
    const total = totalFromStatus(container);

    const input = query<HTMLInputElement>(container, '#rdr-viewer-goto');
    input.value = '3';
    fireEvent.change(input);

    expect(statusText(container)).toBe(`Page 3 of ${total}`);
  });

  it('navigates with the keyboard (PageDown / PageUp / Home / End)', async () => {
    const { container } = await renderMultiPage('single');
    const total = totalFromStatus(container);
    const region = query<HTMLElement>(container, '.rdr-viewer-scroll');

    fireEvent.keyDown(region, { key: 'PageDown' });
    expect(statusText(container)).toBe(`Page 2 of ${total}`);

    fireEvent.keyDown(region, { key: 'End' });
    expect(statusText(container)).toBe(`Page ${total} of ${total}`);

    fireEvent.keyDown(region, { key: 'Home' });
    expect(statusText(container)).toBe(`Page 1 of ${total}`);

    fireEvent.keyDown(region, { key: 'PageUp' });
    expect(statusText(container)).toBe(`Page 1 of ${total}`);
  });

  it('does not hijack typing in the goto input', async () => {
    const { container } = await renderMultiPage('single');
    const input = query<HTMLInputElement>(container, '#rdr-viewer-goto');

    fireEvent.keyDown(input, { key: 'ArrowRight' });
    // Page is unchanged: the keystroke was left for the input to handle.
    expect(statusText(container)).toBe(`Page 1 of ${totalFromStatus(container)}`);
  });

  it('navigates by clicking a thumbnail and marks it current', async () => {
    const { container } = await renderMultiPage('single');
    const total = totalFromStatus(container);

    const secondThumb = container.querySelectorAll<HTMLButtonElement>('.rdr-viewer-thumb')[1];
    fireEvent.click(secondThumb);

    expect(statusText(container)).toBe(`Page 2 of ${total}`);
    expect(secondThumb.getAttribute('aria-current')).toBe('page');
    expect(secondThumb.classList.contains('rdr-viewer-thumb--active')).toBe(true);
  });
});

describe('ReportViewer (E7-S5 states)', () => {
  /** Queries a required element, failing the test (not a non-null assertion) if absent. */
  function query<T extends Element>(container: HTMLElement, selector: string): T {
    const found = container.querySelector<T>(selector);
    if (found === null) {
      throw new Error(`expected element matching "${selector}"`);
    }
    return found;
  }

  it('shows the loading state while the pipeline is in flight', async () => {
    // Render but do NOT flush: the async pipeline has not resolved yet, so the
    // viewer should be showing its loading placeholder.
    const { container, fixture } = await render(ReportViewer, {
      inputs: { template: golden.template, data: golden.data },
    });

    const loading = query<HTMLElement>(container, '.rdr-viewer-state--loading');
    expect(loading.getAttribute('role')).toBe('status');
    expect(loading.textContent).toContain('Rendering report');
    expect(container.querySelector('.rdr-viewer-spinner')).toBeTruthy();
    expect(container.querySelector('.rdr-viewer-skeleton')).toBeTruthy();

    // Once it settles, the loading placeholder is gone and the report is painted.
    await flush();
    fixture.detectChanges();
    expect(container.querySelector('.rdr-viewer-state--loading')).toBeNull();
    expect(container.querySelector('.rdr-page')).toBeTruthy();
  });

  it('shows the empty state for a null template, without emitting (error)', async () => {
    const error = vi.fn<(e: ViewerError) => void>();
    const { container, fixture } = await render(ReportViewer, { on: { error } });
    await flush();
    fixture.detectChanges();

    const empty = query<HTMLElement>(container, '.rdr-viewer-state--empty');
    expect(empty.textContent).toContain('No data to display');
    expect(container.querySelector('.rdr-page')).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it('shows the empty state for a valid template with no data (missing-data fixture)', async () => {
    const error = vi.fn<(e: ViewerError) => void>();
    const { container, fixture } = await render(ReportViewer, {
      inputs: { template: golden.template, data: null },
      on: { error },
    });
    await flush();
    fixture.detectChanges();

    expect(query<HTMLElement>(container, '.rdr-viewer-state--empty').textContent).toContain(
      'No data to display',
    );
    expect(container.querySelector('.rdr-page')).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it('shows the error state and emits (error) for an invalid template', async () => {
    const error = vi.fn<(e: ViewerError) => void>();
    const { container, fixture } = await render(ReportViewer, {
      inputs: { template: { schemaVersion: '1.0.0' } as unknown as RendaraTemplate },
      on: { error },
    });
    await flush();
    fixture.detectChanges();

    const errorState = query<HTMLElement>(container, '.rdr-viewer-state--error');
    expect(errorState.getAttribute('role')).toBe('alert');
    expect(errorState.textContent).toContain("Couldn't render this report");
    expect(errorState.textContent).toContain('Template failed validation');
    expect(container.querySelector('.rdr-page')).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0].kind).toBe('validation');
  });

  it('toggles the View details disclosure on the error state', async () => {
    const { container, fixture } = await render(ReportViewer, {
      inputs: { template: { schemaVersion: '1.0.0' } as unknown as RendaraTemplate },
    });
    await flush();
    fixture.detectChanges();

    const toggle = query<HTMLButtonElement>(container, '.rdr-viewer-state-btn');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#rdr-viewer-error-details')).toBeNull();

    fireEvent.click(toggle);
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#rdr-viewer-error-details')).toBeTruthy();

    fireEvent.click(toggle);
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#rdr-viewer-error-details')).toBeNull();
  });
});

describe('ReportViewer (E7-S4 zoom)', () => {
  /** Renders the golden invoice in the given initial zoom and settles the pipeline. */
  async function renderViewer(initialZoom: 'fit-width' | 'fit-page' | number = 'fit-width') {
    const harness = await render(ReportViewer, {
      inputs: { template: golden.template, data: golden.data, config: { initialZoom } },
    });
    await flush();
    harness.fixture.detectChanges();
    return harness;
  }

  /** Queries a required element, failing the test (not a non-null assertion) if absent. */
  function query<T extends Element>(container: HTMLElement, selector: string): T {
    const found = container.querySelector<T>(selector);
    if (found === null) {
      throw new Error(`expected element matching "${selector}"`);
    }
    return found;
  }

  /** The zoom percent readout text. */
  function readout(container: HTMLElement): string {
    return container.querySelector('.rdr-viewer-zoom-readout')?.textContent?.trim() ?? '';
  }

  it('renders the zoom stepper, readout and fit-mode dropdown', async () => {
    const { container } = await renderViewer();

    expect(container.querySelector('[aria-label="Zoom in"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Zoom out"]')).toBeTruthy();
    expect(container.querySelector('#rdr-viewer-zoom')).toBeTruthy();
    // With no measured container (jsdom), a fit mode resolves to natural 100%.
    expect(readout(container)).toBe('100%');
  });

  it('zoom in / out step the readout through the level ladder', async () => {
    const { container, fixture } = await renderViewer();
    const zoomIn = query<HTMLButtonElement>(container, '[aria-label="Zoom in"]');
    const zoomOut = query<HTMLButtonElement>(container, '[aria-label="Zoom out"]');

    fireEvent.click(zoomIn);
    fixture.detectChanges();
    expect(readout(container)).toBe('125%');

    fireEvent.click(zoomIn);
    fixture.detectChanges();
    expect(readout(container)).toBe('150%');

    fireEvent.click(zoomOut);
    fixture.detectChanges();
    expect(readout(container)).toBe('125%');
  });

  it('disables zoom in at the maximum zoom', async () => {
    const { container } = await renderViewer(5);
    expect(query<HTMLButtonElement>(container, '[aria-label="Zoom in"]').disabled).toBe(true);
    expect(query<HTMLButtonElement>(container, '[aria-label="Zoom out"]').disabled).toBe(false);
  });

  it('disables zoom out at the minimum zoom', async () => {
    const { container } = await renderViewer(0.1);
    expect(query<HTMLButtonElement>(container, '[aria-label="Zoom out"]').disabled).toBe(true);
    expect(query<HTMLButtonElement>(container, '[aria-label="Zoom in"]').disabled).toBe(false);
  });

  it('selecting an explicit percent from the dropdown sets that zoom', async () => {
    const { container, fixture } = await renderViewer();
    const select = query<HTMLSelectElement>(container, '#rdr-viewer-zoom');

    select.value = '0.5';
    fireEvent.change(select);
    fixture.detectChanges();

    expect(readout(container)).toBe('50%');
  });

  it('the dropdown reflects and switches the fit mode', async () => {
    const { container, fixture } = await renderViewer('fit-width');
    const select = query<HTMLSelectElement>(container, '#rdr-viewer-zoom');
    expect(select.value).toBe('fit-width');

    select.value = 'fit-page';
    fireEvent.change(select);
    fixture.detectChanges();

    expect(select.value).toBe('fit-page');
  });

  it('seeds the zoom from config.initialZoom and reflects it in the dropdown', async () => {
    const { container } = await renderViewer(0.75);
    expect(readout(container)).toBe('75%');
    expect(query<HTMLSelectElement>(container, '#rdr-viewer-zoom').value).toBe('0.75');
  });
});

describe('ReportViewer (E8-S1 configurable toolbar)', () => {
  /** Renders the golden invoice with the given toolbar config and settles the pipeline. */
  async function renderViewer(toolbar?: Record<string, boolean>) {
    const harness = await render(ReportViewer, {
      inputs: {
        template: golden.template,
        data: golden.data,
        config: toolbar ? { toolbar } : {},
      },
    });
    await flush();
    harness.fixture.detectChanges();
    return harness;
  }

  /** Queries a required element, failing the test (not a non-null assertion) if absent. */
  function query<T extends Element>(container: HTMLElement, selector: string): T {
    const found = container.querySelector<T>(selector);
    if (found === null) {
      throw new Error(`expected element matching "${selector}"`);
    }
    return found;
  }

  it('renders a single role="toolbar" with all controls present by default', async () => {
    const { container } = await renderViewer();

    const toolbar = query<HTMLElement>(container, '[role="toolbar"]');
    expect(toolbar.getAttribute('aria-label')).toBe('Viewer toolbar');
    expect(container.querySelector('.rdr-viewer-title')).toBeTruthy();
    expect(container.querySelector('[aria-label="Previous page"]')).toBeTruthy();
    expect(container.querySelector('#rdr-viewer-zoom')).toBeTruthy();
    expect(container.querySelector('[aria-label="Print"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Export PDF"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Watermark"]')).toBeTruthy();
  });

  it('shows the document title from template metadata', async () => {
    const { container } = await renderViewer();
    expect(query<HTMLElement>(container, '.rdr-viewer-title').textContent?.trim()).toBe(
      golden.template.metadata.name,
    );
  });

  it('gives the action buttons accessible labels', async () => {
    const { container } = await renderViewer();
    for (const label of ['Print', 'Export PDF', 'Watermark']) {
      const btn = query<HTMLButtonElement>(container, `[aria-label="${label}"]`);
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('aria-label')).toBe(label);
    }
  });

  it('hides individual controls from the DOM via config.toolbar flags', async () => {
    const { container } = await renderViewer({
      title: false,
      navigation: false,
      zoom: false,
      print: false,
      export: false,
      watermark: false,
    });

    // The bar itself remains, but every flagged-off control is absent.
    expect(container.querySelector('[role="toolbar"]')).toBeTruthy();
    expect(container.querySelector('.rdr-viewer-title')).toBeNull();
    expect(container.querySelector('[aria-label="Previous page"]')).toBeNull();
    expect(container.querySelector('#rdr-viewer-zoom')).toBeNull();
    expect(container.querySelector('[aria-label="Print"]')).toBeNull();
    expect(container.querySelector('[aria-label="Export PDF"]')).toBeNull();
    expect(container.querySelector('[aria-label="Watermark"]')).toBeNull();
  });

  it('hides only the named button, leaving the others present', async () => {
    const { container } = await renderViewer({ print: false });
    expect(container.querySelector('[aria-label="Print"]')).toBeNull();
    expect(container.querySelector('[aria-label="Export PDF"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Watermark"]')).toBeTruthy();
  });

  it('removes the whole toolbar when visible is false, still rendering the report', async () => {
    const { container } = await renderViewer({ visible: false });
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
    expect(container.querySelector('.rdr-page')).toBeTruthy();
  });

  it('projects host content into the custom-action slot', async () => {
    const { container, fixture } = await render(
      `<rdr-report-viewer [template]="template" [data]="data">
         <button rdr-toolbar-actions aria-label="Refresh">Refresh</button>
       </rdr-report-viewer>`,
      {
        imports: [ReportViewer],
        componentProperties: { template: golden.template, data: golden.data },
      },
    );
    await flush();
    fixture.detectChanges();

    const custom = query<HTMLButtonElement>(container, '[rdr-toolbar-actions]');
    expect(custom.textContent?.trim()).toBe('Refresh');
    // The projected button lands inside the toolbar's end zone.
    expect(custom.closest('[role="toolbar"]')).toBeTruthy();
  });
});

describe('ReportViewer (E8-S2 print)', () => {
  /** Renders the multi-page golden in the given page mode and settles the pipeline. */
  async function renderViewer(pageMode: 'single' | 'continuous' = 'continuous') {
    const harness = await render(ReportViewer, {
      inputs: { template: golden.template, data: multiPageData, config: { pageMode } },
    });
    await flush();
    harness.fixture.detectChanges();
    return harness;
  }

  /** Queries a required element, failing the test (not a non-null assertion) if absent. */
  function query<T extends Element>(container: HTMLElement, selector: string): T {
    const found = container.querySelector<T>(selector);
    if (found === null) {
      throw new Error(`expected element matching "${selector}"`);
    }
    return found;
  }

  /** The total page count parsed from the bottom status. */
  function totalPages(container: HTMLElement): number {
    return Number(
      container.querySelector('.rdr-viewer-status')?.textContent?.match(/of (\d+)/)?.[1] ?? '0',
    );
  }

  it('wires the Print button to window.print()', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    try {
      const { container } = await renderViewer();
      fireEvent.click(query<HTMLButtonElement>(container, '[aria-label="Print"]'));
      expect(printSpy).toHaveBeenCalledTimes(1);
    } finally {
      printSpy.mockRestore();
    }
  });

  it('does not throw when window.print is unavailable (SSR-safe guard)', async () => {
    const original = window.print;
    // Simulate a runtime without a print implementation.
    (window as { print?: () => void }).print = undefined;
    try {
      const { container } = await renderViewer();
      expect(() =>
        fireEvent.click(query<HTMLButtonElement>(container, '[aria-label="Print"]')),
      ).not.toThrow();
    } finally {
      window.print = original;
    }
  });

  it('renders a hidden print mirror with every page at natural size', async () => {
    const { container } = await renderViewer('continuous');
    const total = totalPages(container);
    expect(total).toBeGreaterThan(1);

    const mirror = query<HTMLElement>(container, '.rdr-viewer-print');
    const pages = mirror.querySelectorAll('.rdr-viewer-print-page');
    expect(pages.length).toBe(total);
    // One rendered page slot per paper page, in order (the slot carries the
    // canonical page number; the inner sheet repeats it, so scope to the slot).
    const numbers = Array.from(mirror.querySelectorAll('.rdr-page-slot[data-page-number]')).map(
      (el) => el.getAttribute('data-page-number'),
    );
    expect(numbers).toEqual(Array.from({ length: total }, (_, i) => String(i + 1)));
  });

  it('mirrors every page even in single page mode (where the scroll shows one)', async () => {
    const { container } = await renderViewer('single');
    const total = totalPages(container);

    // The on-screen scroll shows only the current page in single mode...
    expect(container.querySelectorAll('.rdr-viewer-scroll .rdr-page-slot').length).toBe(1);
    // ...but the print mirror still carries all of them.
    expect(container.querySelectorAll('.rdr-viewer-print .rdr-page-slot').length).toBe(total);
  });

  it('renders each mirror page through the shared renderer (vector page sheets)', async () => {
    const { container } = await renderViewer('continuous');
    const mirror = query<HTMLElement>(container, '.rdr-viewer-print');
    // Each page is a real renderer sheet, not a rasterised image.
    expect(mirror.querySelectorAll('.rdr-page').length).toBe(totalPages(container));
    expect(mirror.querySelector('img.rdr-page')).toBeNull();
  });
});

describe('ReportViewer (E8-S3 export PDF)', () => {
  /** Renders the multi-page golden with the given config and settles the pipeline. */
  async function renderViewer(config: Record<string, unknown> = {}) {
    const harness = await render(ReportViewer, {
      inputs: { template: golden.template, data: multiPageData, config },
    });
    await flush();
    harness.fixture.detectChanges();
    return harness;
  }

  function query<T extends Element>(container: HTMLElement, selector: string): T {
    const found = container.querySelector<T>(selector);
    if (found === null) {
      throw new Error(`expected element matching "${selector}"`);
    }
    return found;
  }

  /** Captures the request a swappable stub exporter is invoked with. */
  function stubExporter() {
    const calls: PdfExportRequest[] = [];
    const exporter = {
      export: vi.fn((request: PdfExportRequest) => {
        calls.push(request);
        return Promise.resolve({
          pageCount: request.document.pageCount,
          filename: request.filename,
        });
      }),
    };
    return { exporter, calls };
  }

  function openDialog(container: HTMLElement): void {
    fireEvent.click(query<HTMLButtonElement>(container, '[aria-label="Export PDF"]'));
  }

  it('opens the export dialog from the toolbar Export action', async () => {
    const { container } = await renderViewer();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    openDialog(container);
    const dialog = query<HTMLElement>(container, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Export PDF');
  });

  it('pre-fills the filename from the document title (slugified, .pdf)', async () => {
    const { container } = await renderViewer();
    openDialog(container);
    // golden invoice name "Invoice — Acme Corp" → "invoice-acme-corp.pdf".
    expect(query<HTMLInputElement>(container, '#rdr-export-filename').value).toBe(
      'invoice-acme-corp.pdf',
    );
  });

  it('honours config.exportFilename, ensuring a .pdf suffix', async () => {
    const { container } = await renderViewer({ exportFilename: 'statement' });
    openDialog(container);
    expect(query<HTMLInputElement>(container, '#rdr-export-filename').value).toBe('statement.pdf');
  });

  it('runs a swappable stub exporter with the resolved request and closes', async () => {
    const { exporter, calls } = stubExporter();
    const { container, fixture } = await renderViewer({ pdfExporter: exporter });

    openDialog(container);
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-export-btn--primary'));
    await flush();
    fixture.detectChanges();

    expect(exporter.export).toHaveBeenCalledTimes(1);
    expect(calls[0].filename).toBe('invoice-acme-corp.pdf');
    expect(calls[0].includeWatermark).toBe(false); // no watermark configured
    expect(calls[0].pages).toBeUndefined(); // "All" scope
    expect(calls[0].document).toBeTruthy();
    // The dialog closes after a successful export.
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('passes only the current page when the Current scope is chosen', async () => {
    const { exporter, calls } = stubExporter();
    const { container } = await renderViewer({ pdfExporter: exporter });

    // Move to page 2, then export the current page.
    fireEvent.click(query<HTMLButtonElement>(container, '[aria-label="Next page"]'));
    openDialog(container);
    const segs = container.querySelectorAll<HTMLButtonElement>(
      '[role="dialog"] button[aria-pressed]',
    );
    fireEvent.click(segs[1]); // Current
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-export-btn--primary'));

    expect(calls[0].pages).toEqual([2]);
  });

  it('forwards the watermark choice when a watermark is configured', async () => {
    const { exporter, calls } = stubExporter();
    const { container } = await renderViewer({
      pdfExporter: exporter,
      watermark: { type: 'text', text: 'DRAFT', opacity: 0.1, angleDeg: -45 },
    });

    openDialog(container);
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-export-btn--primary'));

    expect(calls[0].includeWatermark).toBe(true);
  });

  it('cancels without invoking the exporter', async () => {
    const { exporter } = stubExporter();
    const { container } = await renderViewer({ pdfExporter: exporter });

    openDialog(container);
    fireEvent.click(
      query<HTMLButtonElement>(container, '.rdr-export-btn:not(.rdr-export-btn--primary)'),
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(exporter.export).not.toHaveBeenCalled();
  });

  it('surfaces an exporter failure through (error) instead of throwing', async () => {
    const error = vi.fn();
    const failing = { export: vi.fn(() => Promise.reject(new Error('boom'))) };
    const { container, fixture } = await render(ReportViewer, {
      inputs: { template: golden.template, data: multiPageData, config: { pdfExporter: failing } },
      on: { error },
    });
    await flush();
    fixture.detectChanges();

    openDialog(container);
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-export-btn--primary'));
    await flush();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0].kind).toBe('render');
    expect(error.mock.calls[0][0].message).toContain('Failed to export PDF');
  });
});

describe('ReportViewer (E8-S4 watermark)', () => {
  /** Renders the multi-page golden with the given config and settles the pipeline. */
  async function renderViewer(config: Record<string, unknown> = {}) {
    const harness = await render(ReportViewer, {
      inputs: { template: golden.template, data: multiPageData, config },
    });
    await flush();
    harness.fixture.detectChanges();
    return harness;
  }

  function query<T extends Element>(container: HTMLElement, selector: string): T {
    const found = container.querySelector<T>(selector);
    if (found === null) {
      throw new Error(`expected element matching "${selector}"`);
    }
    return found;
  }

  /** Captures the request a swappable stub exporter is invoked with. */
  function stubExporter() {
    const calls: PdfExportRequest[] = [];
    const exporter = {
      export: vi.fn((request: PdfExportRequest) => {
        calls.push(request);
        return Promise.resolve({
          pageCount: request.document.pageCount,
          filename: request.filename,
        });
      }),
    };
    return { exporter, calls };
  }

  function openWatermark(container: HTMLElement): void {
    fireEvent.click(query<HTMLButtonElement>(container, '[aria-label="Watermark"]'));
  }

  it('opens the watermark dialog from the toolbar Watermark action', async () => {
    const { container } = await renderViewer();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    openWatermark(container);
    const dialog = query<HTMLElement>(container, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Watermark');
  });

  it('seeds the dialog from config.watermark', async () => {
    const { container } = await renderViewer({
      watermark: { type: 'text', text: 'DRAFT', opacity: 0.2, angleDeg: -45 },
    });
    openWatermark(container);
    expect(query<HTMLInputElement>(container, '#rdr-wm-text').value).toBe('DRAFT');
  });

  it('stamps an applied text watermark on every on-screen page', async () => {
    const { container, fixture } = await renderViewer();
    // No watermark configured → none painted.
    expect(container.querySelector('.rdr-watermark-text')).toBeNull();

    openWatermark(container);
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-toggle'));
    fireEvent.input(query<HTMLInputElement>(container, '#rdr-wm-text'), {
      target: { value: 'CONFIDENTIAL' },
    });
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-btn--primary'));
    await flush();
    fixture.detectChanges();

    // The dialog closed and the watermark now paints (screen pages + print mirror).
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const marks = container.querySelectorAll('.rdr-watermark-text');
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent).toContain('CONFIDENTIAL');
  });

  it('carries an applied watermark into the PDF export', async () => {
    const { exporter, calls } = stubExporter();
    const { container, fixture } = await renderViewer({ pdfExporter: exporter });

    // Apply a watermark through the dialog.
    openWatermark(container);
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-toggle'));
    fireEvent.input(query<HTMLInputElement>(container, '#rdr-wm-text'), {
      target: { value: 'PAID' },
    });
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-btn--primary'));
    await flush();
    fixture.detectChanges();

    // Then export — the export dialog defaults include-watermark on, and the
    // paginated document now carries the watermark.
    fireEvent.click(query<HTMLButtonElement>(container, '[aria-label="Export PDF"]'));
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-export-btn--primary'));
    await flush();

    expect(calls[0].includeWatermark).toBe(true);
    expect(calls[0].document.watermark).toMatchObject({ type: 'text', text: 'PAID' });
  });

  it('clears the watermark when applied with the toggle off', async () => {
    const { container, fixture } = await renderViewer({
      watermark: { type: 'text', text: 'DRAFT', opacity: 0.2, angleDeg: -45 },
    });
    expect(container.querySelector('.rdr-watermark-text')).toBeTruthy();

    openWatermark(container);
    // Turn the enable toggle off, then apply.
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-toggle'));
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-btn--primary'));
    await flush();
    fixture.detectChanges();

    expect(container.querySelector('.rdr-watermark-text')).toBeNull();
  });

  it('leaves the watermark unchanged when the dialog is cancelled', async () => {
    const { container, fixture } = await renderViewer();
    openWatermark(container);
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-toggle'));
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-btn:not(.rdr-wm-btn--primary)'));
    await flush();
    fixture.detectChanges();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('.rdr-watermark-text')).toBeNull();
  });
});

describe('ReportViewer (E8-S5 download source)', () => {
  // jsdom has no object-URL APIs by default; install spies and restore originals.
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  /** Renders the golden invoice with the given config and settles the pipeline. */
  async function renderViewer(config: Record<string, unknown> = {}) {
    const harness = await render(ReportViewer, {
      inputs: { template: golden.template, data: golden.data, config },
    });
    await flush();
    harness.fixture.detectChanges();
    return harness;
  }

  function query<T extends Element>(container: HTMLElement, selector: string): T {
    const found = container.querySelector<T>(selector);
    if (found === null) {
      throw new Error(`expected element matching "${selector}"`);
    }
    return found;
  }

  /**
   * Installs object-URL spies and records the blob + suggested filename each
   * anchor download is invoked with (the anchor click is stubbed). `createObjectURL`
   * receives the blob; the click that follows carries the anchor's `download` name.
   */
  function captureDownload() {
    const blobs: Blob[] = [];
    const filenames: string[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:mock';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filenames.push(this.download);
    });
    return { blobs, filenames };
  }

  it('renders the Download source action by default', async () => {
    const { container } = await renderViewer();
    const btn = query<HTMLButtonElement>(container, '[aria-label="Download source"]');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-label')).toBe('Download source');
  });

  it('hides the Download source action when config.toolbar.source is false', async () => {
    const { container } = await renderViewer({ toolbar: { source: false } });
    expect(container.querySelector('[aria-label="Download source"]')).toBeNull();
    // The other actions are untouched.
    expect(container.querySelector('[aria-label="Export PDF"]')).toBeTruthy();
  });

  it('downloads the template JSON named from the document title', async () => {
    const { blobs, filenames } = captureDownload();
    const { container } = await renderViewer();

    fireEvent.click(query<HTMLButtonElement>(container, '[aria-label="Download source"]'));

    expect(filenames).toHaveLength(1);
    // golden invoice name "Invoice — Acme Corp" → "invoice-acme-corp.json".
    expect(filenames[0]).toBe('invoice-acme-corp.json');
    // A non-empty JSON blob is downloaded; the exact round-trippable payload is
    // asserted in viewer-source.spec.ts (serializeTemplateSource).
    expect(blobs[0].type).toBe('application/json');
    expect(blobs[0].size).toBeGreaterThan(0);
  });

  it('honours config.sourceFilename, ensuring a .json suffix', async () => {
    const { filenames } = captureDownload();
    const { container } = await renderViewer({ sourceFilename: 'my-template' });

    fireEvent.click(query<HTMLButtonElement>(container, '[aria-label="Download source"]'));

    expect(filenames[0]).toBe('my-template.json');
  });

  it('shows no Download source action (and downloads nothing) before a document renders', async () => {
    const { filenames } = captureDownload();
    // No template → the empty state, so there is no toolbar / button to click and
    // nothing is downloaded.
    const { container } = await render(ReportViewer);
    await flush();
    expect(container.querySelector('[aria-label="Download source"]')).toBeNull();
    expect(filenames).toHaveLength(0);
  });
});
