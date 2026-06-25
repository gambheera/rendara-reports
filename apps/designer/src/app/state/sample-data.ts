/**
 * Imported sample data (E6-S6) — the designer aid that powers the Data tab's
 * field tree and, later, drag-to-bind (E6-S7) and table sources (E6-S8).
 *
 * Sample data is a **designer-only convenience held in view-state**: it is never
 * written into the Template JSON (the template binds to data by *expression*, not
 * by value), so importing it does not mark the document dirty and it is dropped on
 * export. This module is pure TypeScript — `JSON.parse` plus the engine's
 * {@link introspect} — with no Angular and no `eval`/`new Function`.
 */

import { introspect, type FieldNode } from '@rendara/report-engine';

/** A parsed, introspected sample Data JSON document. */
export interface SampleData {
  /** Name of the imported file, shown in the Data tab header. */
  readonly fileName: string;
  /** The raw parsed JSON value (used later to preview resolved bindings). */
  readonly value: unknown;
  /** The field tree introspected from {@link value} (E2-S4). */
  readonly root: FieldNode;
  /** `true` when introspection hit a size/depth limit and the tree is partial. */
  readonly truncated: boolean;
}

/** Outcome of {@link parseSampleData}: a parsed document, or a friendly error. */
export type ParseSampleDataResult =
  | { readonly ok: true; readonly data: SampleData }
  | { readonly ok: false; readonly error: string };

/**
 * Parses `text` as JSON and introspects it into a {@link SampleData}. Never
 * throws: invalid JSON yields `{ ok: false, error }` with a human-readable
 * message, so the Data tab can show a clear inline error (story QA).
 */
export function parseSampleData(text: string, fileName: string): ParseSampleDataResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `That file isn't valid JSON: ${describeJsonError(error)}` };
  }
  const { root, truncated } = introspect(value);
  return { ok: true, data: { fileName, value, root, truncated } };
}

/** Extracts a concise reason from a `JSON.parse` failure for display. */
function describeJsonError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() === '' ? 'unexpected end of input.' : message;
}

/**
 * Filters a field tree to nodes matching `query` (case-insensitive substring of a
 * node's `name` or `path`), **keeping the ancestors** of every match so the tree
 * stays navigable. A node is also kept when any descendant matches. An empty /
 * whitespace query returns `root` unchanged; no match anywhere returns `null`.
 *
 * Pure and allocation-light: unmatched subtrees are pruned, matched ones are
 * returned by reference where their children are unchanged.
 */
export function filterFieldTree(root: FieldNode, query: string): FieldNode | null {
  const needle = query.trim().toLowerCase();
  if (needle === '') return root;
  return filterNode(root, needle);
}

/** True when a node's own name or path contains the (already-lowercased) needle. */
function selfMatches(node: FieldNode, needle: string): boolean {
  return node.name.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle);
}

/**
 * Returns `node` (possibly with pruned children) when it or a descendant matches,
 * else `null`. A self-match keeps the whole subtree; otherwise only the branches
 * leading to deeper matches are retained.
 */
function filterNode(node: FieldNode, needle: string): FieldNode | null {
  if (selfMatches(node, needle)) return node;
  if (node.children === undefined) return null;
  const kept = node.children.flatMap((child) => {
    const match = filterNode(child, needle);
    return match ? [match] : [];
  });
  return kept.length > 0 ? { ...node, children: kept } : null;
}
