/**
 * Headless page serializer (E4-S1, content in E4-S2) — renders a
 * {@link PageViewModel} to a static HTML string using the **same** shared style
 * helpers ({@link sheetStyle}/{@link printableStyle}/{@link elementStyle}) and
 * the **same** content view the Angular {@link ReportRenderer} component uses. It
 * exists so the visual-regression harness can snapshot real renderer geometry +
 * content via `page.setContent()` without standing up Angular inside Playwright;
 * because both paths derive from one view-model, the serialized HTML matches the
 * component's DOM.
 *
 * Pure and Angular-free, so it is importable from the Node/Playwright context.
 * E4-S2 paints each box's content: text runs, inline-SVG shapes, and
 * (URL-sanitised) images — mirroring the component's template exactly. E4-S3 adds
 * the page's data-table slices (containers → rows → cells + band labels) with the
 * same shared style helpers. E4-S6 emits the additive design-mode selection anchors
 * ({@link designAnchorAttrs}) when the view-model's `mode` is `'design'` — the same
 * attributes the {@link RdrDesignAttrs} directive applies in the component, so the
 * two paths stay byte-for-byte identical in both modes. E4-S7 paints the optional
 * watermark overlay (a centred, rotated text/image layer behind the content) when
 * the page carries one — emitted only when configured, so a page with no watermark
 * is byte-stable.
 */

import { slotSize, type DocumentViewModel } from './document-view-model';
import {
  designAnchorAttrs,
  elementStyle,
  printableStyle,
  sheetStyle,
  tableCellRole,
  tableCellStyle,
  tableContainerStyle,
  tableLabelStyle,
  tableRowStyle,
  TABLE_ACCESSIBLE_NAME,
  type AttrMap,
  type ElementBoxView,
  type ElementContentView,
  type PageViewModel,
  type RenderMode,
  type ShapeContentView,
  type StyleMap,
  type TableRowView,
  type TableView,
  type TextSegment,
  type WatermarkView,
} from './page-view-model';

/** Serializes a {@link StyleMap} to an inline `style` attribute value. */
function inlineStyle(style: StyleMap): string {
  return Object.entries(style)
    .map(([prop, value]) => `${prop}: ${value}`)
    .join('; ');
}

/**
 * Serializes an attribute map (E4-S6 design anchors) to a leading-space-prefixed
 * attribute string, or `''` for `null` (view mode) — so view-mode output carries
 * no anchor bytes. Mirrors the {@link RdrDesignAttrs} directive exactly.
 */
function inlineAttrs(attrs: AttrMap | null): string {
  if (attrs === null) {
    return '';
  }
  return Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('');
}

/** Minimal HTML attribute-value escaping for the values we emit (ids, styles, urls). */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Escapes text content for placement between element tags. */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Serializes a resolved text value for E8-S6 search highlighting: when the value
 * carries {@link TextSegment}s (a query matched), each matched run is wrapped in a
 * `<mark class="rdr-mark">` exactly as the {@link ReportRenderer} template does;
 * otherwise (no query / no match) the plain escaped `text` is emitted, so
 * non-search output is byte-identical to before the feature.
 */
function serializeHighlightable(
  text: string,
  segments: readonly TextSegment[] | undefined,
): string {
  if (!segments) {
    return escapeText(text);
  }
  return segments
    .map((seg) =>
      seg.mark ? `<mark class="rdr-mark">${escapeText(seg.text)}</mark>` : escapeText(seg.text),
    )
    .join('');
}

/**
 * Renders one page view-model to a static `<div class="rdr-page">…</div>` string:
 * the sheet, its printable-area guide, and every positioned element box with its
 * content.
 */
export function serializePageToHtml(vm: PageViewModel): string {
  const mode = vm.mode;
  // The watermark is painted first so it sits behind the content (E4-S7); it is
  // emitted only when configured, so a page with no watermark stays byte-stable.
  const watermark = vm.watermark ? serializeWatermark(vm.watermark) : '';
  const boxes = vm.elements.map((box) => serializeBox(box, mode)).join('');
  const tables = vm.tables.map((table) => serializeTable(table, mode)).join('');
  // The page-mode marker is additive (design only), so view-mode output is byte-stable.
  const pageMode = mode === 'design' ? ' data-rdr-mode="design"' : '';

  return (
    `<div class="rdr-page" style="${escapeAttr(inlineStyle(sheetStyle(vm)))}"${pageMode}>` +
    `<div class="rdr-printable" style="${escapeAttr(inlineStyle(printableStyle(vm)))}"></div>` +
    watermark +
    boxes +
    tables +
    `</div>`
  );
}

/** Serializes the watermark overlay (E4-S7): a centred, rotated text caption or image. */
function serializeWatermark(watermark: WatermarkView): string {
  const layer = escapeAttr(inlineStyle(watermark.layerStyle));
  const inner = escapeAttr(inlineStyle(watermark.innerStyle));
  const content =
    watermark.kind === 'image' && watermark.src !== null
      ? `<img class="rdr-watermark-image" src="${escapeAttr(watermark.src)}" alt="" style="${inner}" />`
      : `<span class="rdr-watermark-text" style="${inner}">${escapeText(watermark.text ?? '')}</span>`;
  return `<div class="rdr-watermark" style="${layer}">${content}</div>`;
}

/**
 * Serializes a whole {@link DocumentViewModel} to a static
 * `<div class="rdr-document">…</div>` string (E4-S4): every page wrapped in a
 * `.rdr-page-slot` sized to the *scaled* box, mirroring the {@link ReportDocument}
 * component so the multi-page visual snapshot matches the live DOM. The slot
 * reserves the scaled layout box (the page's own `transform: scale` is visual
 * only), so pages stack correctly at the document's zoom.
 */
export function serializeDocumentToHtml(vm: DocumentViewModel): string {
  const slot = slotSize(vm.sheet, vm.zoom);
  const slotInline = inlineStyle({ width: `${slot.widthPx}px`, height: `${slot.heightPx}px` });
  // Each slot is a labelled `group` (E10-S1) so a screen reader announces "Page N"
  // as it enters each sheet; the roles mirror the component template and paint
  // nothing, so the multi-page visual snapshot is unchanged (ADR 0020).
  const pages = vm.pages
    .map(
      (page) =>
        `<div class="rdr-page-slot" role="group" aria-roledescription="page" ` +
        `aria-label="Page ${page.pageNumber}" data-page-number="${page.pageNumber}" ` +
        `style="${escapeAttr(slotInline)}">${serializePageToHtml(page)}</div>`,
    )
    .join('');
  return `<div class="rdr-document">${pages}</div>`;
}

/** Serializes one element host box and its content. */
function serializeBox(box: ElementBoxView, mode: RenderMode): string {
  const anchor = inlineAttrs(designAnchorAttrs('element', box, mode));
  return (
    `<div class="rdr-element" data-element-id="${escapeAttr(box.id)}" ` +
    `data-element-type="${escapeAttr(box.type)}" style="${escapeAttr(
      inlineStyle(elementStyle(box)),
    )}"${anchor}>${serializeContent(box.content)}</div>`
  );
}

/** Serializes the inner content of a box (text run / SVG shape / image / nothing). */
function serializeContent(content: ElementContentView): string {
  switch (content.kind) {
    case 'text':
      return `<div class="rdr-text" style="${escapeAttr(
        inlineStyle(content.textStyle),
      )}">${serializeHighlightable(content.text, content.segments)}</div>`;
    case 'shape':
      return serializeShape(content);
    case 'image':
      return content.src === null
        ? ''
        : `<img class="rdr-image" src="${escapeAttr(content.src)}" alt="" style="${escapeAttr(
            inlineStyle(content.imageStyle),
          )}" />`;
    case 'empty':
      return '';
  }
}

/** Serializes a shape as an inline `<svg>` with the same primitives the component binds. */
function serializeShape(content: ShapeContentView): string {
  const open =
    `<svg class="rdr-shape" width="${content.svgWidthPx}" height="${content.svgHeightPx}" ` +
    `style="overflow: visible; display: block">`;
  return `${open}${serializeShapePrimitive(content)}</svg>`;
}

/** Emits the `<line>`/`<rect>`/`<ellipse>` primitive for a shape. */
function serializeShapePrimitive(content: ShapeContentView): string {
  const stroke = content.stroke;
  const strokeAttrs =
    `stroke="${escapeAttr(stroke?.color ?? 'none')}" stroke-width="${stroke?.widthPx ?? 0}"` +
    (stroke?.dashArray ? ` stroke-dasharray="${escapeAttr(stroke.dashArray)}"` : '') +
    (stroke?.lineCap ? ` stroke-linecap="${stroke.lineCap}"` : '');

  switch (content.shape) {
    case 'line': {
      const l = content.line;
      return l ? `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" ${strokeAttrs} />` : '';
    }
    case 'rect': {
      const r = content.rect;
      return r
        ? `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" ` +
            `fill="${escapeAttr(content.fill ?? 'none')}" ${strokeAttrs} />`
        : '';
    }
    case 'ellipse': {
      const e = content.ellipse;
      return e
        ? `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" ` +
            `fill="${escapeAttr(content.fill ?? 'none')}" ${strokeAttrs} />`
        : '';
    }
  }
}

/**
 * Serializes one table slice (E4-S3) as a positioned container of row tracks. The
 * additive ARIA table roles (E10-S1) mirror the component template exactly so the
 * headless output — and thus the visual-regression fixtures — announce a real
 * table to assistive tech (see ADR 0020); they paint nothing, so the snapshots are
 * unchanged.
 */
function serializeTable(table: TableView, mode: RenderMode): string {
  const rows = table.rows.map(serializeTableRow).join('');
  const anchor = inlineAttrs(designAnchorAttrs('table', table, mode));
  return (
    `<div class="rdr-table" role="table" aria-label="${escapeAttr(TABLE_ACCESSIBLE_NAME)}" ` +
    `data-table-id="${escapeAttr(table.elementId)}" ` +
    `style="${escapeAttr(inlineStyle(tableContainerStyle(table)))}"${anchor}>${rows}</div>`
  );
}

/** Serializes one table row: its per-column cells then an optional full-width band label. */
function serializeTableRow(row: TableRowView): string {
  // Header cells are `columnheader` so a screen reader ties each data cell to its
  // column; every other row's cells (and band labels) are plain `cell` (E10-S1).
  const cellRole = tableCellRole(row.kind);
  const cells = row.cells
    .map(
      (cell) =>
        `<div class="rdr-table-cell" role="${cellRole}" data-column-key="${escapeAttr(
          cell.columnKey,
        )}" ` +
        `style="${escapeAttr(inlineStyle(tableCellStyle(cell)))}">${serializeHighlightable(
          cell.text,
          cell.segments,
        )}</div>`,
    )
    .join('');
  const label = row.label
    ? `<div class="rdr-table-label" role="cell" style="${escapeAttr(
        inlineStyle(tableLabelStyle(row.label)),
      )}">${serializeHighlightable(row.label.text, row.label.segments)}</div>`
    : '';
  return (
    `<div class="rdr-table-row" role="row" data-row-kind="${escapeAttr(row.kind)}" ` +
    `style="${escapeAttr(inlineStyle(tableRowStyle(row)))}">${cells}${label}</div>`
  );
}
