import { Component } from '@angular/core';
import { ReportViewer } from '@rendara/report-viewer';

/**
 * Example host app (E0-S2 skeleton). It proves the integration story by
 * depending ONLY on `@rendara/report-viewer` (brief §4). The real wiring of
 * template + data inputs lands in Epic 9.
 */
@Component({
  imports: [ReportViewer],
  selector: 'rdr-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = 'viewer-demo';
}
