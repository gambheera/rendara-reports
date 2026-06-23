import { Component } from '@angular/core';
import { DEFAULT_PAGE } from '@rendara/report-schema';
import { computePageGeometry, type PaginatedPage } from '@rendara/report-engine';
import { ReportRenderer } from '@rendara/report-renderer';

/**
 * Skeleton placeholder for the publishable viewer (E0-S2, rendering wired in
 * E4-S1). The real `<rdr-report-viewer>` (toolbar + public API, bundling
 * engine/renderer/schema) lands in Epics 7–9. For now it composes the shared
 * {@link ReportRenderer} over an empty default-A4 page, exercising the legal
 * viewer -> {renderer, engine, schema} dependencies (brief §4) and proving the
 * composition renders real output. A built-from-defaults page (not a golden
 * fixture) keeps fixture data out of the publishable bundle.
 */
const geometry = computePageGeometry(DEFAULT_PAGE);
const emptyPage: PaginatedPage = {
  index: 0,
  pageNumber: 1,
  header: [],
  elements: [],
  footer: [],
  tables: [],
};

@Component({
  selector: 'rdr-report-viewer',
  imports: [ReportRenderer],
  templateUrl: './report-viewer.html',
  styleUrl: './report-viewer.css',
})
export class ReportViewer {
  protected readonly page = emptyPage;
  protected readonly geometry = geometry;
}
