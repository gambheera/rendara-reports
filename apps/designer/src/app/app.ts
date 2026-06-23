import { Component } from '@angular/core';
import { DEFAULT_PAGE, SCHEMA_VERSION } from '@rendara/report-schema';
import {
  computePageGeometry,
  ENGINE_TARGET_SCHEMA_VERSION,
  type PaginatedPage,
} from '@rendara/report-engine';
import { ReportRenderer } from '@rendara/report-renderer';
import { Button } from '@rendara/ui-kit';

/**
 * Designer app shell (E0-S2 skeleton, renderer wired in E4-S1). The real
 * four-zone workspace lands in Epic 5. The imports above establish the legal
 * designer -> {schema, engine, renderer, ui-kit} dependencies (brief §4); the
 * ui-kit `Button` is the first token-driven control (E0-S8). The shared renderer
 * is mounted over an empty default-A4 page to prove WYSIWYG output renders.
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
  imports: [ReportRenderer, Button],
  selector: 'rdr-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = 'designer';
  protected readonly schemaVersion = SCHEMA_VERSION;
  protected readonly engineSchemaVersion = ENGINE_TARGET_SCHEMA_VERSION;
  protected readonly page = emptyPage;
  protected readonly geometry = geometry;
}
