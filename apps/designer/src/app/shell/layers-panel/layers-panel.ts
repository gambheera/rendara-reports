import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import type { TemplateElement } from '@rendara/report-schema';
import { DesignerStore } from '../../state/designer-store';
import { groupOf } from '../../state/group-ops';
import type { ZOrderOp } from '../../state/z-order-ops';
import type { AlignEdge, DistributeAxis } from '../../state/align-ops';

/** One row in the layers list: the element, whether it is selected, and its group tag. */
interface LayerItem {
  readonly element: TemplateElement;
  readonly selected: boolean;
  /** A short group tag (e.g. "G1") when the element belongs to a group, else `null`. */
  readonly groupTag: string | null;
}

/** A human label for each element type, shown in the layers list. */
const TYPE_LABEL: Record<TemplateElement['type'], string> = {
  text: 'Text',
  shape: 'Shape',
  image: 'Image',
  dataTable: 'Data table',
};

/**
 * The **Layers** panel (E5-S7), shown in the palette's Layers tab. It lists the
 * body elements **top-first** (matching every layers panel and the canvas paint
 * order), lets the author select (click) or extend the selection (shift-click), and
 * exposes the **z-order** (to front / forward / backward / to back) and **group /
 * ungroup** actions over the current selection. It is the discoverable, fully
 * keyboard-operable home for these commands; the same operations also have canvas
 * keyboard shortcuts. All state and logic live in the store and its pure ops — this
 * component only renders the list and dispatches actions.
 */
@Component({
  selector: 'rdr-layers-panel',
  templateUrl: './layers-panel.html',
  styleUrl: './layers-panel.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-layers-panel' },
})
export class LayersPanel {
  protected readonly store = inject(DesignerStore);

  protected readonly typeLabel = TYPE_LABEL;

  /** The body elements as layer rows, top-first, tagged with selection + group. */
  protected readonly items = computed<readonly LayerItem[]>(() => {
    const selected = new Set(this.store.selectedIds());
    const groups = this.store.groups();
    const tagByGroup = new Map(groups.map((group, i) => [group, `G${i + 1}`]));
    return this.store.bodyStack().map((element) => {
      const group = groupOf(groups, element.id);
      return {
        element,
        selected: selected.has(element.id),
        groupTag: group ? (tagByGroup.get(group) ?? null) : null,
      };
    });
  });

  /** Selects one element, or extends/toggles the selection when Shift/Ctrl is held. */
  protected onRowClick(event: MouseEvent, id: string): void {
    if (event.shiftKey || event.ctrlKey || event.metaKey) this.store.toggleSelection(id);
    else this.store.selectOne(id);
  }

  /** Applies a z-order operation to the current selection. */
  protected reorder(op: ZOrderOp): void {
    this.store.reorderSelection(op);
  }

  protected group(): void {
    this.store.groupSelection();
  }

  protected ungroup(): void {
    this.store.ungroupSelection();
  }

  /** Aligns the current selection along an edge (E5-S8). */
  protected align(edge: AlignEdge): void {
    this.store.alignSelection(edge);
  }

  /** Distributes the current selection's centres along an axis (E5-S8). */
  protected distribute(axis: DistributeAxis): void {
    this.store.distributeSelection(axis);
  }
}
