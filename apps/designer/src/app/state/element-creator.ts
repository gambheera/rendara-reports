import { Injectable, inject } from '@angular/core';
import { DesignerStore } from './designer-store';
import {
  DEFAULT_ELEMENT_SIZES,
  createDefaultElement,
  frameForDefault,
  frameForDrop,
  type PaletteKind,
  type PointMm,
} from './drag-create';

/**
 * Turns a palette interaction into a new element in the document store (E5-S5).
 * It is the single seam shared by the two creation paths — the canvas **drop**
 * (positioned, {@link addAtPoint}) and the palette **click / keyboard add**
 * (centred + cascaded, {@link addAtDefault}, the WCAG 2.2 SC 2.5.7 single-pointer
 * alternative to dragging) — so both build identical defaults and stay in sync.
 *
 * The pure placement/factory logic lives in `drag-create`; this thin injectable
 * only supplies the stateful bits: a fresh element id, the next z-order (so a new
 * element lands on top), and the page bounds read from the store. Each add marks
 * the element the current selection, so the (future) properties panel focuses it.
 */
@Injectable({ providedIn: 'root' })
export class ElementCreator {
  private readonly store = inject(DesignerStore);

  /**
   * Creates a `kind` element centred on `atMm` (a page-absolute drop point),
   * clamped onto the sheet. Returns the new element's id.
   */
  addAtPoint(kind: PaletteKind, atMm: PointMm): string {
    const frame = frameForDrop(DEFAULT_ELEMENT_SIZES[kind], atMm, this.pageMm());
    return this.create(kind, frame);
  }

  /**
   * Creates a `kind` element at a default page-centred position, cascaded by the
   * current element count so repeated adds don't stack exactly. Returns the new
   * element's id. This is the non-drag path (click / Enter on a palette tile).
   */
  addAtDefault(kind: PaletteKind): string {
    const frame = frameForDefault(
      DEFAULT_ELEMENT_SIZES[kind],
      this.pageMm(),
      this.store.bodyElements().length,
    );
    return this.create(kind, frame);
  }

  /** Builds the element with a fresh id + top z, adds it to the body, and selects it. */
  private create(kind: PaletteKind, frame: ReturnType<typeof frameForDrop>): string {
    const id = `el_${crypto.randomUUID()}`;
    const element = createDefaultElement(kind, id, frame, this.nextZ());
    this.store.addElement(element);
    this.store.selectOne(id);
    return id;
  }

  /** The resolved sheet size (orientation-aware) the new frame is clamped within. */
  private pageMm() {
    return this.store.paginatedDocument().geometry.pageMm;
  }

  /** One above the highest current z, so a new element paints in front of the rest. */
  private nextZ(): number {
    let max = 0;
    for (const element of this.store.elementsById().values()) {
      max = Math.max(max, element.z);
    }
    return max + 1;
  }
}
