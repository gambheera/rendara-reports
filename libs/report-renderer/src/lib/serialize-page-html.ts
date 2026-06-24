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
 * same shared style helpers.
 */

import { slotSize, type DocumentViewModel } from './document-view-model';
import {
  elementStyle,
  printableStyle,
  sheetStyle,
  tableCellStyle,
  tableContainerStyle,
  tableLabelStyle,
  tableRowStyle,
  type ElementBoxView,
  type ElementContentView,
  type PageViewModel,
  type ShapeContentView,
  type StyleMap,
  type TableRowView,
  type TableView,
} from './page-view-model';

/** Serializes a {@link StyleMap} to an inline `style` attribute value. */
function inlineStyle(style: StyleMap): string {
  return Object.entries(style)
    .map(([prop, value]) => `${prop}: ${value}`)
    .join('; ');
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
 * Renders one page view-model to a static `<div class="rdr-page">…</div>` string:
 * the sheet, its printable-area guide, and every positioned element box with its
 * content.
 */
export function serializePageToHtml(vm: PageViewModel): string {
  const boxes = vm.elements.map(serializeBox).join('');
  const tables = vm.tables.map(serializeTable).join('');

  return (
    `<div class="rdr-page" style="${escapeAttr(inlineStyle(sheetStyle(vm)))}">` +
    `<div class="rdr-printable" style="${escapeAttr(inlineStyle(printableStyle(vm)))}"></div>` +
    boxes +
    tables +
    `</div>`
  );
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
  const pages = vm.pages
    .map(
      (page) =>
        `<div class="rdr-page-slot" data-page-number="${page.pageNumber}" ` +
        `style="${escapeAttr(slotInline)}">${serializePageToHtml(page)}</div>`,
    )
    .join('');
  return `<div class="rdr-document">${pages}</div>`;
}

/** Serializes one element host box and its content. */
function serializeBox(box: ElementBoxView): string {
  return (
    `<div class="rdr-element" data-element-id="${escapeAttr(box.id)}" ` +
    `data-element-type="${escapeAttr(box.type)}" style="${escapeAttr(
      inlineStyle(elementStyle(box)),
    )}">${serializeContent(box.content)}</div>`
  );
}

/** Serializes the inner content of a box (text run / SVG shape / image / nothing). */
function serializeContent(content: ElementContentView): string {
  switch (content.kind) {
    case 'text':
      return `<div class="rdr-text" style="${escapeAttr(
        inlineStyle(content.textStyle),
      )}">${escapeText(content.text)}</div>`;
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

/** Serializes one table slice (E4-S3) as a positioned container of row tracks. */
function serializeTable(table: TableView): string {
  const rows = table.rows.map(serializeTableRow).join('');
  return (
    `<div class="rdr-table" data-table-id="${escapeAttr(table.elementId)}" ` +
    `style="${escapeAttr(inlineStyle(tableContainerStyle(table)))}">${rows}</div>`
  );
}

/** Serializes one table row: its per-column cells then an optional full-width band label. */
function serializeTableRow(row: TableRowView): string {
  const cells = row.cells
    .map(
      (cell) =>
        `<div class="rdr-table-cell" data-column-key="${escapeAttr(cell.columnKey)}" ` +
        `style="${escapeAttr(inlineStyle(tableCellStyle(cell)))}">${escapeText(cell.text)}</div>`,
    )
    .join('');
  const label = row.label
    ? `<div class="rdr-table-label" style="${escapeAttr(
        inlineStyle(tableLabelStyle(row.label)),
      )}">${escapeText(row.label.text)}</div>`
    : '';
  return (
    `<div class="rdr-table-row" data-row-kind="${escapeAttr(row.kind)}" ` +
    `style="${escapeAttr(inlineStyle(tableRowStyle(row)))}">${cells}${label}</div>`
  );
}
