/**
 * A data binding attached to an element or a table cell/footer — the
 * value-producing slot referenced by the element models (brief §5, §6).
 *
 * STUB (E1-S3 → E1-S5): the full binding model — the `format` token and
 * `fallback`, the table `source`/group/aggregate bindings, and `visibleWhen`
 * resolution — is defined in **E1-S5**. It is kept minimal here (a required
 * JSONata `expr` plus an open property bag) so the element models in this story
 * have a legal, assignable binding slot without pre-empting E1-S5. The `expr` is
 * the binding's essence and is stable across that refinement.
 *
 * For a table column `cell`, `expr` is evaluated with `$` bound to the current
 * row; for a column `footer` it is an aggregate expression (e.g.
 * `$sum(invoice.lineItems.amount)`) — brief §6.
 */
export interface ElementBinding {
  /** JSONata expression producing the bound value. */
  readonly expr: string;
  readonly [property: string]: unknown;
}
