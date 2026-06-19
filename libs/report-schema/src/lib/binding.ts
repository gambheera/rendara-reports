/**
 * A data binding attached to an element or a table cell/footer/group — the
 * value-producing slot referenced by the element models (brief §5, §6).
 *
 * This is the structured binding model (E1-S5): a required JSONata {@link expr},
 * an optional {@link format} token, and an optional {@link fallback} for missing
 * data. The same shape is reused at every binding location — element
 * `binding`, table column `cell`/`footer`, and group-band `label`/aggregates —
 * so one validator (`./binding-validation`) covers them all.
 *
 * Scope: this is the *schema* slot only. The actual evaluation
 * (`evaluate(expr, scope)`), `Intl`-based formatting, and fallback substitution
 * live in the engine epics (**E2-S1**, **E2-S2**, **E2-S6**). Raw boolean/array/key
 * expressions that carry no `format`/`fallback` — `ElementBase.visibleWhen`,
 * `DataTableSource.arrayExpr`, `DataTableGroup.groupBy` — stay bare expression
 * strings rather than an `ElementBinding`.
 *
 * For a table column `cell`, `expr` is evaluated with `$` bound to the current
 * row; for a column `footer` (grand total) or a group-band aggregate (subtotal)
 * it is an aggregate expression (e.g. `$sum(invoice.lineItems.amount)`,
 * `$sum($.amount)`) — brief §6.
 */
export interface ElementBinding {
  /** JSONata expression producing the bound value. Required and non-empty. */
  readonly expr: string;
  /**
   * Number/date format token (e.g. `currency:USD`, `date:medium`, `number:0.00`,
   * `percent`), or `null` for no formatting. The token *grammar* is resolved by
   * the `Intl`-based formatting layer (**E2-S2**); this is just the slot.
   *
   * Mirrors {@link ElementStyle.format}; when an element carries both, the
   * binding-level token takes precedence (resolved by the engine).
   */
  readonly format?: string | null;
  /**
   * Literal display value substituted when {@link expr} resolves to
   * `null`/`undefined`/missing (brief §6; **E2-S6**). `null` or absent means "no
   * fallback" (the renderer shows blank). An empty string `''` is a *legal*
   * fallback — an explicit "show nothing" — and is distinct from a missing slot.
   */
  readonly fallback?: string | null;
}
