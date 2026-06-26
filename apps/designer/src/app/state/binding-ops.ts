/**
 * Pure, framework-agnostic helpers backing the Properties panel's **Data Binding**
 * editor and the canvas drag-to-bind gesture (E6-S7). They turn raw editor inputs
 * (an expression string, a format token, a fallback) into an immutable
 * {@link ElementBinding} patch the designer store applies via `updateElement`, and
 * they flatten an introspected field tree into the autocomplete suggestions the
 * `FX` input offers.
 *
 * Everything here is pure so the component stays thin and the logic carries the
 * high coverage bar. Expression *validity* is delegated to the engine's sandboxed
 * {@link compileExpression} (JSONata) — there is no `eval`/`new Function` here (a
 * project hard rule); this module only maps a compile failure to a friendly,
 * inline message.
 */

import { compileExpression, type FieldNode } from '@rendara/report-engine';
import type {
  ElementBinding,
  ImageElement,
  TemplateElement,
  TextElement,
} from '@rendara/report-schema';

/** An element type that carries an {@link ElementBinding} value slot (brief §5). */
export type BindableElement = TextElement | ImageElement;

/** True when `element` has a `binding` slot (text or image) the editor targets. */
export function isBindable(element: TemplateElement): element is BindableElement {
  return element.type === 'text' || element.type === 'image';
}

/**
 * One choice in the Data Binding **Format** picker. The `token` is the engine
 * format-token string (resolved by the `Intl`-based formatting layer, E2-S2), or
 * `null` for "no formatting" (the renderer shows the raw value).
 */
export interface FormatOption {
  readonly token: string | null;
  readonly label: string;
}

/**
 * The curated format tokens offered in the Format picker. They mirror the engine
 * format grammar (E2-S2): a leading "None" plus the common number / currency /
 * percent / date presets. Authors needing an exotic token can still type it (the
 * picker is a convenience, not the only path), but these cover the brief's §6 set.
 */
export const FORMAT_OPTIONS: readonly FormatOption[] = [
  { token: null, label: 'None' },
  { token: 'number:0.00', label: 'Number (0.00)' },
  { token: 'number:#,##0.00', label: 'Number (grouped)' },
  { token: 'currency:USD', label: 'Currency (USD)' },
  { token: 'currency:EUR', label: 'Currency (EUR)' },
  { token: 'currency:GBP', label: 'Currency (GBP)' },
  { token: 'percent', label: 'Percent' },
  { token: 'date:short', label: 'Date (short)' },
  { token: 'date:medium', label: 'Date (medium)' },
  { token: 'date:long', label: 'Date (long)' },
];

/**
 * Flattens an introspected {@link FieldNode} tree into the de-duplicated list of
 * JSONata **paths** the `FX` autocomplete offers. Every reachable node
 * contributes its data-root `path` (e.g. `invoice.customer.name`,
 * `invoice.lineItems.amount`), in depth-first document order.
 *
 * The array **element placeholder** node (its `name` is `'[]'`, and its `path`
 * merely repeats the array's own path) is skipped so the list has no duplicates;
 * its descendant fields are still included via their full (array-mapping) `path`.
 * The root (`path === ''`) is skipped — it is not a bindable expression.
 */
export function collectFieldPaths(root: FieldNode): readonly string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const visit = (node: FieldNode): void => {
    if (node.path !== '' && node.name !== '[]' && !seen.has(node.path)) {
      seen.add(node.path);
      paths.push(node.path);
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(root);
  return paths;
}

/**
 * Builds an {@link ElementBinding} from the editor's three inputs, or `null` when
 * `expr` is blank — the signal to **clear** the binding and fall back to the
 * element's static value. The expression is trimmed; a blank/`null` `format` token
 * and a blank/`null` `fallback` are omitted (so a freshly-bound element carries
 * just `expr`, keeping exported JSON minimal and round-trips clean).
 */
export function buildBinding(
  expr: string,
  format: string | null,
  fallback: string | null,
): ElementBinding | null {
  const trimmedExpr = expr.trim();
  if (trimmedExpr === '') {
    return null;
  }
  const token = format === null ? '' : format.trim();
  const fb = fallback === null ? '' : fallback;
  return {
    expr: trimmedExpr,
    ...(token === '' ? {} : { format: token }),
    ...(fb === '' ? {} : { fallback: fb }),
  };
}

/**
 * Sets `expr` on an existing binding, **preserving** its `format`/`fallback`. Used
 * by drag-to-bind, where dropping a field swaps only the expression and keeps any
 * formatting the author already configured.
 */
export function withExpr(existing: ElementBinding | undefined, expr: string): ElementBinding {
  return { ...existing, expr: expr.trim() };
}

/**
 * The `{ binding }` patch that binds a text/image `element` to the field at
 * `path` (drag-to-bind), preserving any existing format/fallback. Returns `null`
 * for a non-bindable element (shape / data table) so the caller can no-op — a
 * field dropped on a shape does nothing.
 */
export function bindElementToPath(
  element: TemplateElement,
  path: string,
): { readonly binding: ElementBinding } | null {
  if (!isBindable(element)) {
    return null;
  }
  return { binding: withExpr(element.binding, path) };
}

/**
 * Validates an expression for the inline error state: `null` when it is blank
 * (an empty `FX` field is "no binding", not an error) or compiles cleanly, else a
 * short human-readable reason from the sandboxed {@link compileExpression}. Only
 * **syntax** (compile) errors are caught here — a well-formed expression over a
 * missing path is not an error, it resolves to the fallback (brief §6).
 */
export function expressionError(expr: string): string | null {
  if (expr.trim() === '') {
    return null;
  }
  const compiled = compileExpression(expr);
  return compiled.ok ? null : compiled.error.message;
}
