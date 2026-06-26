import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/angular';
import { GOLDEN_FIXTURES, type RendaraTemplate } from '@rendara/report-schema';

import { ReportViewer } from './report-viewer';
import type { PageChangeEvent, RenderedEvent, ViewerError } from './viewer-api';

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
