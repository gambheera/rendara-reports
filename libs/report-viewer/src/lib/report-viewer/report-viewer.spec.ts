import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/angular';
import { GOLDEN_FIXTURES, type RendaraTemplate } from '@rendara/report-schema';

import { ReportViewer } from './report-viewer';
import type { RenderedEvent, ViewerError } from './viewer-api';

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
