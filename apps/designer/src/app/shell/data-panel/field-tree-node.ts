import { Component, ViewEncapsulation, computed, input, signal } from '@angular/core';
import type { FieldNode, ScalarType } from '@rendara/report-engine';

/** Human label for each scalar type, shown as the node's type chip. */
const SCALAR_LABEL: Record<ScalarType, string> = {
  string: 'String',
  number: 'Number',
  boolean: 'Boolean',
  null: 'Null',
};

/**
 * One row of the Data tab's field tree (E6-S6) — a single {@link FieldNode}
 * rendered as an ARIA `treeitem`, recursing into its children. Scalars show a
 * type chip (`String`/`Number`/…), arrays an `[ ]` chip, and objects an
 * expand/collapse twisty; a node missing from some sampled array items (ragged
 * data) is marked optional. The drag grip is decorative here — **drag-to-bind is
 * E6-S7**; this story only displays and filters the tree.
 *
 * Containers start expanded so an imported document (and any filter match) is
 * visible at a glance. The component self-references for recursion.
 */
@Component({
  selector: 'rdr-field-tree-node',
  imports: [FieldTreeNode],
  templateUrl: './field-tree-node.html',
  styleUrl: './field-tree-node.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: {
    role: 'treeitem',
    class: 'rdr-field',
    '[attr.aria-level]': 'level()',
    '[attr.aria-expanded]': 'hasChildren() ? expanded() : null',
  },
})
export class FieldTreeNode {
  /** The field tree node this row renders. */
  readonly node = input.required<FieldNode>();
  /** 1-based depth, for `aria-level` and indentation. */
  readonly level = input(1);

  /** Whether the children group is shown (containers only). Starts open. */
  protected readonly expanded = signal(true);

  /** True when the node has children to expand (a non-empty object or array). */
  protected readonly hasChildren = computed(() => (this.node().children?.length ?? 0) > 0);

  /** Indentation (px) for the row, deepening one step per level. */
  protected readonly indentPx = computed(() => (this.level() - 1) * 14);

  /**
   * The type chip text: the scalar type for a leaf (`String`/…), `[ ]` for an
   * array, or `null` for an object (whose nature reads from its twisty + children).
   */
  protected readonly chip = computed<string | null>(() => {
    const node = this.node();
    if (node.kind === 'array') return '[ ]';
    if (node.kind === 'scalar') return SCALAR_LABEL[node.scalarType ?? 'string'];
    return null;
  });

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }
}
