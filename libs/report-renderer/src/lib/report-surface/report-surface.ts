import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import type { PaginatedDocument } from '@rendara/report-engine';
import type { RendaraTemplate } from '@rendara/report-schema';

import { ReportDocument } from '../report-document/report-document';
import type { PageLayoutMode, ViewportSize, ZoomSpec } from '../document-view-model';
import {
  RENDERER_DOCUMENT_CSS,
  RENDERER_PAGE_CSS,
  RENDERER_THEME_CSS,
} from '../renderer-styles';

/**
 * Opt-in Shadow-DOM render surface (E4-S5) — the fully **style-isolated** way to
 * render a report inside another app (the embeddable viewer's mode; brief §3/§7).
 *
 * Unlike the default {@link ReportDocument}/{@link ReportRenderer} (which use
 * `ViewEncapsulation.Emulated` and rely on inline styles + a reset), this
 * component uses `ViewEncapsulation.ShadowDom`, so a real shadow boundary blocks
 * **every** host selector — including `!important` rules — from reaching the
 * report, and the shared reset in {@link RENDERER_THEME_CSS} neutralises the
 * inheritable typography that does cross a shadow boundary. The result is
 * unaffected by hostile host CSS, and (because nothing escapes the shadow root)
 * the renderer cannot leak styles back into the host.
 *
 * It simply wraps {@link ReportDocument}, forwarding every input/output verbatim,
 * so the rendered output is byte-identical to the emulated path (one renderer,
 * true WYSIWYG). The catch Angular imposes: an emulated child's styles live in the
 * document head and do **not** pierce a shadow boundary, so this surface re-declares
 * the page + document chrome ({@link RENDERER_PAGE_CSS} / {@link RENDERER_DOCUMENT_CSS})
 * inside its own (shadow-scoped) styles — there they match the nested
 * `.rdr-page`/`.rdr-document` DOM directly.
 *
 * Theming works exactly as on the emulated components: override any `--rdr-*`
 * token on `<rdr-report-surface>` (or an ancestor — inherited custom properties
 * cross the shadow boundary) to re-theme the chrome and table palette.
 *
 * Use this for the embedded viewer; the designer keeps the emulated
 * {@link ReportDocument} (it needs live, inspectable DOM for selection/design-mode
 * hooks in E4-S6).
 */
@Component({
  selector: 'rdr-report-surface',
  imports: [ReportDocument],
  template: `<rdr-report-document
    [document]="document()"
    [template]="template()"
    [resolvedValues]="resolvedValues()"
    [background]="background()"
    [zoom]="zoom()"
    [layout]="layout()"
    [currentPage]="currentPage()"
    [availableSize]="availableSize()"
    (zoomChange)="zoomChange.emit($event)"
  />`,
  styles: [RENDERER_THEME_CSS, RENDERER_PAGE_CSS, RENDERER_DOCUMENT_CSS],
  encapsulation: ViewEncapsulation.ShadowDom,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportSurface {
  /** The paginated document to render (forwarded to {@link ReportDocument}). */
  readonly document = input.required<PaginatedDocument>();
  /** Source template, forwarded to every page for content/style. */
  readonly template = input<RendaraTemplate | null>(null);
  /** Resolved binding display strings by element id, forwarded to every page. */
  readonly resolvedValues = input<ReadonlyMap<string, string>>(new Map());
  /** CSS colour for every page's sheet fill; `null` → white paper. */
  readonly background = input<string | null>(null);
  /** Zoom spec: an explicit scale factor or a fit mode. Defaults to `1` (100%). */
  readonly zoom = input<ZoomSpec>(1);
  /** Paint every page (`'continuous'`, default) or only the {@link currentPage}. */
  readonly layout = input<PageLayoutMode>('continuous');
  /** 1-based page to show in `'single'` layout; clamped to the document. */
  readonly currentPage = input<number>(1);
  /** Explicit viewport size for the fit zoom modes; `null` measures the host. */
  readonly availableSize = input<ViewportSize | null>(null);

  /** Emits the resolved scale factor whenever it changes (e.g. for a "100%" readout). */
  readonly zoomChange = output<number>();
}
