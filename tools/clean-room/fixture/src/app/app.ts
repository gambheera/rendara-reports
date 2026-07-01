import { Component } from '@angular/core';
import { ReportViewer, type RenderedEvent, type ViewerError } from '@rendara/report-viewer';

import { SAMPLE_DATA, SAMPLE_TEMPLATE_JSON } from './report';

/**
 * The clean-room consumer — the README quick-start (E9-S6), verbatim in shape:
 * import the standalone `ReportViewer`, hand it a template (a JSON string here)
 * plus a data JSON, wire `(rendered)` / `(error)`. This is exactly what a host
 * app installs and writes, so a green smoke test proves the published tarball is
 * consumable outside the monorepo (E9-S7).
 */
@Component({
  selector: 'rdr-clean-root',
  imports: [ReportViewer],
  template: `
    <rdr-report-viewer
      [template]="template"
      [data]="data"
      (rendered)="onRendered($event)"
      (error)="onError($event)"
      style="display:block; height:100dvh"
    />
  `,
})
export class App {
  /** In a real app both come from the backend at runtime; here they are inlined. */
  protected readonly template: string = SAMPLE_TEMPLATE_JSON;
  protected readonly data: unknown = SAMPLE_DATA;

  protected onRendered(e: RenderedEvent): void {
    console.log(`rendered ${e.pageCount} page(s)`);
  }

  protected onError(e: ViewerError): void {
    console.error(e.message);
  }
}
