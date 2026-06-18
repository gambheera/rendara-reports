import { Component } from '@angular/core';
import { ENGINE_TARGET_SCHEMA_VERSION } from '@rendara/report-engine';

/**
 * Skeleton placeholder for the shared renderer (E0-S2). The real
 * template+data -> paginated DOM renderer lands in Epic 4. The engine import
 * establishes the legal renderer -> engine dependency (brief §4).
 */
@Component({
  selector: 'rdr-report-renderer',
  imports: [],
  templateUrl: './report-renderer.html',
  styleUrl: './report-renderer.css',
})
export class ReportRenderer {
  protected readonly engineSchemaVersion = ENGINE_TARGET_SCHEMA_VERSION;
}
