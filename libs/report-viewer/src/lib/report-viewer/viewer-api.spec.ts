import { describe, expect, expectTypeOf, it } from 'vitest';
import { isSignal } from '@angular/core';
import { render } from '@testing-library/angular';

import { ReportViewer } from './report-viewer';
import {
  DEFAULT_VIEWER_CONFIG,
  type PageChangeEvent,
  type RenderedEvent,
  type ViewerConfig,
  type ViewerError,
  type ViewerPageMode,
  type ViewerTheme,
  type ViewerZoom,
} from './viewer-api';

/**
 * API contract test (E7-S1 QA). Asserts the component's public surface — the
 * exact signal **inputs** and **outputs** of brief §8 — plus compile-time typing
 * for the exported config/theme/event types, so TypeScript consumers integrate
 * against a stable, fully-typed contract.
 */
describe('report-viewer public API contract (E7-S1)', () => {
  it('exposes the brief-§8 inputs as signals and outputs as emitters', async () => {
    const { fixture } = await render(ReportViewer);
    const viewer = fixture.componentInstance;

    // Inputs are signal-based (brief §8 acceptance).
    for (const key of ['template', 'data', 'config', 'theme'] as const) {
      expect(isSignal(viewer[key]), `${key} should be a signal input`).toBe(true);
    }

    // Outputs are subscribable, emitting refs.
    for (const key of ['rendered', 'pageChange', 'error'] as const) {
      expect(typeof viewer[key].subscribe, `${key} should be subscribable`).toBe('function');
      expect(typeof viewer[key].emit, `${key} should be emittable`).toBe('function');
    }
  });

  it('defaults every optional config field to a concrete value', () => {
    expect(DEFAULT_VIEWER_CONFIG).toStrictEqual({
      locale: undefined,
      initialZoom: 'fit-width',
      toolbar: { visible: true },
      watermark: null,
      pageMode: 'continuous',
      pdfExporter: undefined,
      exportFilename: undefined,
      pdfMetadata: undefined,
      sourceFilename: undefined,
    });
  });

  it('types the public config, theme and event payloads (compile-time)', () => {
    expectTypeOf<ViewerZoom>().toEqualTypeOf<number | 'fit-width' | 'fit-page'>();
    expectTypeOf<ViewerPageMode>().toEqualTypeOf<'single' | 'continuous'>();
    expectTypeOf<RenderedEvent>().toEqualTypeOf<{ readonly pageCount: number }>();
    expectTypeOf<PageChangeEvent>().toEqualTypeOf<{
      readonly current: number;
      readonly total: number;
    }>();
    expectTypeOf<ViewerError['kind']>().toEqualTypeOf<'validation' | 'binding' | 'render'>();

    // A host-shaped config/theme is assignable to the public types.
    const config = {
      locale: 'en-US',
      initialZoom: 1,
      toolbar: { visible: false },
      watermark: null,
      pageMode: 'single',
    } satisfies ViewerConfig;
    const theme = { '--rdr-accent': '#4f46e5' } satisfies ViewerTheme;

    expect(config.pageMode).toBe('single');
    expect(theme['--rdr-accent']).toBe('#4f46e5');
  });
});
