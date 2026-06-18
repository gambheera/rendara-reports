import { Component } from '@angular/core';
import { ReportRenderer } from '@rendara/report-renderer';

/**
 * Skeleton placeholder for the publishable viewer (E0-S2). The real
 * `<rdr-report-viewer>` (toolbar + public API, bundling engine/renderer/schema)
 * lands in Epics 7–9. Importing the renderer establishes the legal
 * viewer -> renderer dependency (brief §4).
 */
@Component({
  selector: 'rdr-report-viewer',
  imports: [ReportRenderer],
  templateUrl: './report-viewer.html',
  styleUrl: './report-viewer.css',
})
export class ReportViewer {}
