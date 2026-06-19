import type { TemplateElement } from './element';
import type { Page } from './page';

/** Identifying metadata for a template (brief §5). */
export interface TemplateMetadata {
  readonly name: string;
  /** Stable identifier (UUID). */
  readonly id: string;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** BCP-47 locale used as the formatting default (brief §6). */
  readonly locale: string;
}

/**
 * A band container holds a flat list of elements. Used for the page `header`
 * (repeats every page), `body` (the main flow), and `footer` (page numbers,
 * totals) — brief §5. Band-specific behavior (repeat-on-each-page, page tokens,
 * watermark) is layered on by the pagination/render epics.
 */
export interface Band {
  readonly elements: readonly TemplateElement[];
}

/**
 * The top-level Template JSON — the versioned contract between the Designer and
 * the Viewer (brief §5). Every other layer (engine, renderer, viewer) shares
 * this single model.
 */
export interface RendaraTemplate {
  /** Semver schema version; drives migrations (E1-S7). */
  readonly schemaVersion: string;
  readonly metadata: TemplateMetadata;
  readonly page: Page;
  readonly header: Band;
  readonly body: Band;
  readonly footer: Band;
}
