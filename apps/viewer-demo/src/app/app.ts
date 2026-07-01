import { Component, computed, signal } from '@angular/core';
import {
  ReportViewer,
  type PageChangeEvent,
  type RenderedEvent,
  type ViewerConfig,
  type ViewerError,
  type ViewerTheme,
} from '@rendara/report-viewer';

import { INVALID_TEMPLATE_JSON, SAMPLE_DATA, SAMPLE_TEMPLATE_JSON } from './sample-report';

/**
 * Example host app — the real integration proof (E9-S4).
 *
 * It depends ONLY on `@rendara/report-viewer` (brief §4), and the app build
 * resolves that to the **built, self-contained package** in `dist/libs` (see
 * `tsconfig.app.json` + the `report-viewer:bundle` build dependency), not the
 * workspace source — so this exercises exactly what a host app installs.
 *
 * It wires every public output (brief §8) — `(rendered)`, `(pageChange)`,
 * `(error)` — and surfaces the latest value of each so the integration is
 * observable and assertable in e2e. A "Load invalid template" action swaps in a
 * schema-invalid template to demonstrate the surfaced (never thrown) `(error)`.
 */
@Component({
  imports: [ReportViewer],
  selector: 'rdr-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = 'viewer-demo';

  /** The template handed to the viewer; swappable to demonstrate `(error)`. */
  protected readonly template = signal(SAMPLE_TEMPLATE_JSON);
  protected readonly data = SAMPLE_DATA;
  protected readonly config: ViewerConfig = { pageMode: 'single', initialZoom: 'fit-width' };

  /** Latest payload from each public output, surfaced to the page. */
  protected readonly lastRendered = signal<RenderedEvent | null>(null);
  protected readonly lastPageChange = signal<PageChangeEvent | null>(null);
  protected readonly lastError = signal<ViewerError | null>(null);

  /**
   * The theming proof (E9-S5): a dark, brand-accented chrome expressed purely as
   * `--rdr-viewer-*` CSS custom properties — the README's theming example, live.
   * Applied through the viewer's `[theme]` input (host inline styles), so it
   * re-themes only this viewer and touches nothing else on the page.
   */
  private readonly darkTheme: ViewerTheme = {
    '--rdr-viewer-backdrop': '#0f172a',
    '--rdr-viewer-surface': '#111827',
    '--rdr-viewer-panel': '#1f2937',
    '--rdr-viewer-hairline': '#334155',
    '--rdr-viewer-text': '#e5e7eb',
    '--rdr-viewer-text-secondary': '#94a3b8',
    '--rdr-viewer-accent': '#818cf8',
  };

  /** Whether the dark theme override is active; toggled from the host controls. */
  protected readonly themed = signal(false);

  /** The `[theme]` handed to the viewer: the dark override when on, else `null`. */
  protected readonly theme = computed<ViewerTheme | null>(() =>
    this.themed() ? this.darkTheme : null,
  );

  protected onRendered(event: RenderedEvent): void {
    this.lastRendered.set(event);
    this.lastError.set(null);
  }

  protected onPageChange(event: PageChangeEvent): void {
    this.lastPageChange.set(event);
  }

  protected onError(error: ViewerError): void {
    this.lastError.set(error);
  }

  /** Swap in a schema-invalid template to demonstrate the `(error)` output. */
  protected loadInvalidTemplate(): void {
    this.lastRendered.set(null);
    this.lastPageChange.set(null);
    this.template.set(INVALID_TEMPLATE_JSON);
  }

  /** Restore the valid sample template. */
  protected loadSample(): void {
    this.lastError.set(null);
    this.template.set(SAMPLE_TEMPLATE_JSON);
  }

  /** Toggle the dark `--rdr-viewer-*` theme override (E9-S5 theming proof). */
  protected toggleTheme(): void {
    this.themed.update((on) => !on);
  }
}
