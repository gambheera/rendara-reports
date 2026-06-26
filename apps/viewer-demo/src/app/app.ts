import { Component } from '@angular/core';
import { ReportViewer, type ViewerConfig } from '@rendara/report-viewer';

import { SAMPLE_DATA, SAMPLE_TEMPLATE_JSON } from './sample-report';

/**
 * Example host app (E0-S2 skeleton). It proves the integration story by
 * depending ONLY on `@rendara/report-viewer` (brief §4).
 *
 * E7-S3 wires a multi-page sample report so the page-navigation e2e has
 * something to navigate; the real template + data wiring (file open / host
 * inputs) lands in Epic 9.
 */
@Component({
  imports: [ReportViewer],
  selector: 'rdr-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = 'viewer-demo';

  /** Multi-page sample template (JSON string) + data driving the embedded viewer. */
  protected readonly template = SAMPLE_TEMPLATE_JSON;
  protected readonly data = SAMPLE_DATA;
  protected readonly config: ViewerConfig = { pageMode: 'single', initialZoom: 'fit-width' };
}
