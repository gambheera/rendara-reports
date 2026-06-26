import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/angular';
import type { RendaraTemplate } from '@rendara/report-schema';

import { ReportViewer } from './report-viewer';

/**
 * Component tests for the public API surface (E7-S1). The render *pipeline*
 * (E7-S2) and event emission are out of scope here; these assert the component
 * mounts, accepts every brief-§8 input, and applies the theme overrides — the
 * SSR-safe host `[style]` path — as `--rdr-*` custom properties on its host.
 */

/** A minimal valid template, enough to set the `template` input as an object. */
function sampleTemplate(): RendaraTemplate {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Sample',
      id: 'fixture-viewer-0001',
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
    body: { elements: [] },
    footer: { elements: [] },
  };
}

describe('ReportViewer (E7-S1)', () => {
  it('renders the shared renderer it composes', async () => {
    const { container } = await render(ReportViewer);

    // The placeholder body composes <rdr-report-renderer>, which paints a page
    // sheet — proving the viewer -> renderer composition renders real output.
    expect(container.querySelector('.rdr-page')).toBeTruthy();
  });

  it('accepts every brief-§8 input (object template, data, config, theme)', async () => {
    const { container } = await render(ReportViewer, {
      inputs: {
        template: sampleTemplate(),
        data: { invoice: { number: 'INV-2042' } },
        config: { locale: 'en-GB', initialZoom: 'fit-page', pageMode: 'single' },
        theme: { '--rdr-accent': '#4f46e5' },
      },
    });
    expect(container.querySelector('.rdr-page')).toBeTruthy();
  });

  it('accepts a raw JSON string for the template input', async () => {
    const { container } = await render(ReportViewer, {
      inputs: { template: JSON.stringify(sampleTemplate()) },
    });
    expect(container.querySelector('.rdr-page')).toBeTruthy();
  });

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
});
