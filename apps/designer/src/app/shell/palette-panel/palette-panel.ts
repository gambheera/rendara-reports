import { Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { CdkDrag, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import { ElementCreator } from '../../state/element-creator';
import { CANVAS_DROP_LIST_ID, type PaletteKind } from '../../state/drag-create';

/** Left-panel tabs, canonical per brief §12.3.3. */
export type PaletteTab = 'insert' | 'layers' | 'data';

interface PaletteItem {
  readonly label: string;
  /** Decorative glyph; real icons arrive with the icon set. */
  readonly glyph: string;
  /** The element kind this tile creates when dragged or clicked. */
  readonly kind: PaletteKind;
}

/**
 * Left palette panel. Hosts the accessible Insert / Layers / Data tablist; the
 * Insert tab lists the v1 palette (brief §12.3.4) as **drag-to-create** tiles
 * (E5-S5) — each a `cdkDrag` whose `cdkDropList` connects to the canvas, so a tile
 * dropped on the sheet becomes an element at the drop point.
 *
 * Dragging is pointer-only, so each tile is also a real `<button>`: clicking it
 * (or activating it from the keyboard) adds the element at a default position —
 * the single-pointer alternative required by WCAG 2.2 SC 2.5.7. A {@link dragging}
 * guard stops the click that may trail a genuine drag from adding a second element.
 *
 * Layers and Data remain placeholders (their stories are E5-S7 / E6-S6).
 */
@Component({
  selector: 'rdr-palette-panel',
  imports: [CdkDropList, CdkDrag, CdkDragPlaceholder],
  templateUrl: './palette-panel.html',
  styleUrl: './palette-panel.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-palette-panel' },
})
export class PalettePanel {
  private readonly creator = inject(ElementCreator);

  /** Id of the canvas drop list the palette tiles connect to (drag target). */
  protected readonly canvasDropListId = CANVAS_DROP_LIST_ID;

  protected readonly activeTab = signal<PaletteTab>('insert');

  protected readonly tabs: readonly { id: PaletteTab; label: string }[] = [
    { id: 'insert', label: 'Insert' },
    { id: 'layers', label: 'Layers' },
    { id: 'data', label: 'Data' },
  ];

  /** v1 palette only — Text, Image, Line, Rectangle, Ellipse, Data Table. */
  protected readonly basicItems: readonly PaletteItem[] = [
    { label: 'Text', glyph: 'T', kind: 'text' },
    { label: 'Image', glyph: '\u{1F5BC}', kind: 'image' },
    { label: 'Line', glyph: '—', kind: 'line' },
    { label: 'Rectangle', glyph: '▭', kind: 'rect' },
    { label: 'Ellipse', glyph: '○', kind: 'ellipse' },
  ];
  protected readonly dataItems: readonly PaletteItem[] = [
    { label: 'Data Table', glyph: '☷', kind: 'dataTable' },
  ];

  /** True while a real drag is in flight, so the trailing click does not also add. */
  private dragging = false;

  protected select(tab: PaletteTab): void {
    this.activeTab.set(tab);
  }

  /** Each fresh pointer interaction starts clean; only a drag sets the guard. */
  protected onPointerDown(): void {
    this.dragging = false;
  }

  /** Movement past CDK's threshold became a drag — suppress the click it ends with. */
  protected onDragStarted(): void {
    this.dragging = true;
  }

  /**
   * Click / Enter / Space on a tile adds the element at a default position. A
   * click that merely concludes a real drag (the canvas drop already created the
   * element) is swallowed by the {@link dragging} guard.
   */
  protected addOnClick(kind: PaletteKind): void {
    if (this.dragging) {
      this.dragging = false;
      return;
    }
    this.creator.addAtDefault(kind);
  }
}
