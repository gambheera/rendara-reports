/**
 * Headless page serializer (E4-S1) — renders a {@link PageViewModel} to a static
 * HTML string using the **same** shared style helpers
 * ({@link sheetStyle}/{@link printableStyle}/{@link elementStyle}) the Angular
 * {@link ReportRenderer} component uses. It exists so the visual-regression
 * harness can snapshot real renderer geometry via `page.setContent()` without
 * standing up Angular inside Playwright; because both paths derive from one
 * style source, the serialized HTML matches the component's DOM.
 *
 * Pure and Angular-free, so it is importable from the Node/Playwright context.
 * Like the component at E4-S1, it paints only positioned host boxes — element
 * **content** (text/shape/image) is E4-S2.
 */

import {
  elementStyle,
  printableStyle,
  sheetStyle,
  type PageViewModel,
  type StyleMap,
} from './page-view-model';

/** Serializes a {@link StyleMap} to an inline `style` attribute value. */
function inlineStyle(style: StyleMap): string {
  return Object.entries(style)
    .map(([prop, value]) => `${prop}: ${value}`)
    .join('; ');
}

/** Minimal HTML attribute-value escaping for the values we emit (ids, styles). */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Renders one page view-model to a static `<div class="rdr-page">…</div>` string:
 * the sheet, its printable-area guide, and every positioned element host box.
 */
export function serializePageToHtml(vm: PageViewModel): string {
  const boxes = vm.elements
    .map(
      (box) =>
        `<div class="rdr-element" data-element-id="${escapeAttr(box.id)}" ` +
        `data-element-type="${escapeAttr(box.type)}" style="${escapeAttr(
          inlineStyle(elementStyle(box)),
        )}"></div>`,
    )
    .join('');

  return (
    `<div class="rdr-page" style="${escapeAttr(inlineStyle(sheetStyle(vm)))}">` +
    `<div class="rdr-printable" style="${escapeAttr(inlineStyle(printableStyle(vm)))}"></div>` +
    boxes +
    `</div>`
  );
}
