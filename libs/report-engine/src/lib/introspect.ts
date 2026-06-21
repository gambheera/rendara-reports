/**
 * Sample-data introspection (E2-S4) — the engine's "what's in this JSON?" pass.
 * It walks an arbitrary imported sample Data JSON and produces a **field tree**:
 * a tree of paths annotated with their type (scalar / object / array). The
 * designer uses this to power drag-to-bind, to let an author pick an array as a
 * data table's `source.arrayExpr`, and to bind table columns to element fields
 * (brief §6 "Sample-data introspection").
 *
 * This module is pure TypeScript with **no Angular and no schema dependency** —
 * it only inspects shape, it does not evaluate expressions, so there is no
 * `eval`/`new Function` here (a project hard rule) and nothing to sandbox.
 *
 * ## Path conventions (so the tree drops straight into bindings)
 * Every node carries `path`, a JSONata path from the data root. For an
 * **array of objects** the element fields additionally carry `rowPath`, a path
 * **relative to a row** (`$`). These mirror the two binding forms in brief §5/§6
 * exactly:
 *
 * - `path` for an array-element field maps over the whole array
 *   (`invoice.lineItems.amount`) — the form aggregates use:
 *   `$sum(invoice.lineItems.amount)`.
 * - `rowPath` is the per-row form (`$.amount`) a table **column** `cell.expr`
 *   uses, where `$` is bound to the current row.
 *
 * ## Array element shapes (for table sources)
 * To suggest columns for a table bound to an array, the walk **samples** up to
 * {@link IntrospectOptions.arraySampleSize} elements and **merges** their object
 * keys into one representative element subtree. This handles **ragged** data
 * (elements with differing keys): a field absent from some sampled elements is
 * marked {@link FieldNode.optional}. An array whose elements are scalars is
 * described by a single scalar element node; an array of mixed kinds resolves to
 * the dominant kind across the sample (see {@link dominantKind}).
 *
 * ## Staying responsive (the huge-object guard)
 * Sample data is author-supplied and can be large or deep. The walk is bounded
 * on every axis: {@link IntrospectOptions.maxDepth} caps nesting,
 * {@link IntrospectOptions.maxKeys} caps the properties read per object,
 * {@link IntrospectOptions.arraySampleSize} caps how many elements are inspected
 * to infer an array's shape, and {@link IntrospectOptions.maxNodes} caps the
 * total nodes produced. When any limit stops the walk, the affected node is
 * flagged {@link FieldNode.truncated} and {@link IntrospectionResult.truncated}
 * is set, so a caller can show "…and more" without ever processing unbounded
 * input.
 *
 * Total — {@link introspect} never throws, whatever JSON it is handed.
 */

/** The concrete type of a scalar (leaf) value in the field tree. */
export type ScalarType = 'string' | 'number' | 'boolean' | 'null';

/** Structural kind of a field tree node. `null` counts as a scalar leaf. */
export type FieldKind = 'scalar' | 'object' | 'array';

/**
 * One node in the field tree.
 *
 * - **scalar** — a leaf; {@link scalarType} says which.
 * - **object** — {@link children} are its properties.
 * - **array** — {@link children} are the merged fields of its element shape (for
 *   an array of objects), or a single element node (array of scalars). Empty
 *   arrays have no children.
 */
export interface FieldNode {
  /** Key segment that reaches this node, or `'[]'` for an array's element. */
  readonly name: string;
  /** JSONata path from the data root, e.g. `invoice.customer.name`. */
  readonly path: string;
  /** Structural kind. */
  readonly kind: FieldKind;
  /** Present iff {@link kind} is `'scalar'`. */
  readonly scalarType?: ScalarType;
  /** Object properties, or an array element's merged fields. Absent for leaves. */
  readonly children?: readonly FieldNode[];
  /**
   * For descendants of an array element only: the path **relative to a row**
   * (`$`), e.g. `$.amount`. This is the form a table column `cell.expr` uses.
   */
  readonly rowPath?: string;
  /**
   * For array-element fields: `true` when the field was missing from at least
   * one sampled element (ragged data).
   */
  readonly optional?: boolean;
  /** `true` when a limit stopped the walk at this node (children may be partial). */
  readonly truncated?: boolean;
}

/** Tuning for {@link introspect}; every field has a responsive default. */
export interface IntrospectOptions {
  /** Max nesting depth to descend (root is depth 0). Default {@link DEFAULT_MAX_DEPTH}. */
  readonly maxDepth?: number;
  /** Max nodes produced overall — the huge-object guard. Default {@link DEFAULT_MAX_NODES}. */
  readonly maxNodes?: number;
  /** Max object properties read per object. Default {@link DEFAULT_MAX_KEYS}. */
  readonly maxKeys?: number;
  /** Max array elements sampled to infer an array's shape. Default {@link DEFAULT_ARRAY_SAMPLE_SIZE}. */
  readonly arraySampleSize?: number;
}

/** Outcome of {@link introspect}. */
export interface IntrospectionResult {
  /** Root node, describing the top-level value. Its `path` is `''`. */
  readonly root: FieldNode;
  /** Total nodes in the tree (including the root). */
  readonly nodeCount: number;
  /** `true` if any limit was hit anywhere during the walk. */
  readonly truncated: boolean;
}

/** Default {@link IntrospectOptions.maxDepth}. */
export const DEFAULT_MAX_DEPTH = 8;
/** Default {@link IntrospectOptions.maxNodes}. */
export const DEFAULT_MAX_NODES = 1000;
/** Default {@link IntrospectOptions.maxKeys}. */
export const DEFAULT_MAX_KEYS = 200;
/** Default {@link IntrospectOptions.arraySampleSize}. */
export const DEFAULT_ARRAY_SAMPLE_SIZE = 20;

/** Resolved, non-optional limits used during a single walk. */
interface Limits {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxKeys: number;
  readonly arraySampleSize: number;
}

/** Mutable counters threaded through the recursive walk. */
interface WalkState {
  /** Nodes produced so far (the root is counted by the caller). */
  count: number;
  /** Set once any limit is hit anywhere. */
  truncated: boolean;
}

/**
 * Walks arbitrary JSON `data` into a {@link FieldNode} tree.
 *
 * Total and bounded: it never throws, and the configurable limits keep the walk
 * responsive on large or deeply-nested input (see the module doc). Pass partial
 * {@link IntrospectOptions} to override individual defaults.
 */
export function introspect(data: unknown, options?: IntrospectOptions): IntrospectionResult {
  const limits: Limits = {
    maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxNodes: options?.maxNodes ?? DEFAULT_MAX_NODES,
    maxKeys: options?.maxKeys ?? DEFAULT_MAX_KEYS,
    arraySampleSize: options?.arraySampleSize ?? DEFAULT_ARRAY_SAMPLE_SIZE,
  };
  const state: WalkState = { count: 1, truncated: false };

  const root = walk(data, { name: '$root', path: '', rowPath: undefined }, 0, limits, state);

  return { root, nodeCount: state.count, truncated: state.truncated };
}

/** Identity of a node being built: its display name and its two path forms. */
interface NodeIdentity {
  readonly name: string;
  readonly path: string;
  /** Row-relative path (`$.x`), set only inside an array element; else undefined. */
  readonly rowPath: string | undefined;
}

/**
 * Builds the node for `value` at the given identity and depth. Recurses into
 * object properties and array element shapes, respecting every limit in
 * `limits` and recording any truncation into `state`.
 */
function walk(
  value: unknown,
  id: NodeIdentity,
  depth: number,
  limits: Limits,
  state: WalkState,
): FieldNode {
  const base = baseNode(id);

  // Leaves: scalars (incl. null) never have children.
  if (!isObjectOrArray(value)) {
    return { ...base, kind: 'scalar', scalarType: scalarTypeOf(value) };
  }

  // Past the depth budget: keep the container's kind but stop descending.
  if (depth >= limits.maxDepth) {
    state.truncated = true;
    return { ...base, kind: Array.isArray(value) ? 'array' : 'object', truncated: true };
  }

  return Array.isArray(value)
    ? walkArray(value, id, depth, limits, state)
    : walkObject(value as Record<string, unknown>, id, depth, limits, state);
}

/** Builds an `object` node, descending into up to `maxKeys` properties. */
function walkObject(
  value: Record<string, unknown>,
  id: NodeIdentity,
  depth: number,
  limits: Limits,
  state: WalkState,
): FieldNode {
  const keys = Object.keys(value);
  const children: FieldNode[] = [];
  let truncated = false;

  for (const key of keys) {
    if (children.length >= limits.maxKeys) {
      truncated = true;
      state.truncated = true;
      break;
    }
    if (state.count >= limits.maxNodes) {
      truncated = true;
      state.truncated = true;
      break;
    }
    state.count += 1;
    children.push(walk(value[key], childIdentity(id, key), depth + 1, limits, state));
  }

  return finishContainer(id, 'object', children, truncated);
}

/**
 * Builds an `array` node. Samples up to `arraySampleSize` elements to infer the
 * element shape: arrays of objects merge their keys (ragged-safe) into one
 * representative element subtree; arrays of scalars yield a single scalar
 * element; an empty array yields no children.
 */
function walkArray(
  value: readonly unknown[],
  id: NodeIdentity,
  depth: number,
  limits: Limits,
  state: WalkState,
): FieldNode {
  if (value.length === 0) {
    return finishContainer(id, 'array', [], false);
  }

  const truncated = value.length > limits.arraySampleSize;
  if (truncated) {
    state.truncated = true;
  }
  const sample = value.slice(0, limits.arraySampleSize);

  // The element node sits at `[]`; its descendants are row-relative (`$`).
  const elementId = elementIdentity(id);

  if (sample.every((el) => isPlainObjectValue(el))) {
    const element = mergeObjectElements(
      sample as readonly Record<string, unknown>[],
      elementId,
      depth,
      limits,
      state,
    );
    return finishContainer(id, 'array', element ? [element] : [], truncated || !element);
  }

  // Array of scalars (or mixed) — describe one element by its dominant kind.
  const kind = dominantKind(sample);
  if (state.count >= limits.maxNodes) {
    state.truncated = true;
    return finishContainer(id, 'array', [], true);
  }
  state.count += 1;
  const element =
    kind === 'scalar'
      ? { ...baseNode(elementId), kind: 'scalar' as const, scalarType: scalarTypeOf(sample[0]) }
      : walk(firstOfKind(sample, kind), elementId, depth + 1, limits, state);

  return finishContainer(id, 'array', [element], truncated);
}

/**
 * Merges the object elements of an array sample into one representative element
 * node. The union of keys across the sample becomes the element's children;
 * a key missing from any element is flagged {@link FieldNode.optional}. For each
 * key the first element that has it provides the value walked for its shape.
 * Returns `undefined` only when the node budget is exhausted before the element
 * node itself could be created.
 */
function mergeObjectElements(
  sample: readonly Record<string, unknown>[],
  elementId: NodeIdentity,
  depth: number,
  limits: Limits,
  state: WalkState,
): FieldNode | undefined {
  if (state.count >= limits.maxNodes) {
    state.truncated = true;
    return undefined;
  }
  state.count += 1; // the element node itself

  // Union of keys in first-seen order; track which keys every element has.
  const order: string[] = [];
  const presence = new Map<string, number>();
  for (const el of sample) {
    for (const key of Object.keys(el)) {
      if (!presence.has(key)) {
        order.push(key);
        presence.set(key, 0);
      }
      presence.set(key, (presence.get(key) ?? 0) + 1);
    }
  }

  const children: FieldNode[] = [];
  let truncated = false;
  for (const key of order) {
    if (children.length >= limits.maxKeys) {
      truncated = true;
      state.truncated = true;
      break;
    }
    if (state.count >= limits.maxNodes) {
      truncated = true;
      state.truncated = true;
      break;
    }
    state.count += 1;
    const source = sample.find((el) => Object.prototype.hasOwnProperty.call(el, key));
    const child = walk(
      source ? source[key] : undefined,
      childIdentity(elementId, key),
      depth + 2, // +1 for the array, +1 for the element
      limits,
      state,
    );
    const optional = (presence.get(key) ?? 0) < sample.length;
    children.push(optional ? { ...child, optional: true } : child);
  }

  return finishContainer(elementId, 'object', children, truncated);
}

// --- node helpers ------------------------------------------------------------

/** The common (name/path/rowPath) fields of a node from its identity. */
function baseNode(id: NodeIdentity): Pick<FieldNode, 'name' | 'path' | 'rowPath'> {
  return id.rowPath === undefined
    ? { name: id.name, path: id.path }
    : { name: id.name, path: id.path, rowPath: id.rowPath };
}

/** Assembles a container node, attaching `children`/`truncated` only when set. */
function finishContainer(
  id: NodeIdentity,
  kind: 'object' | 'array',
  children: readonly FieldNode[],
  truncated: boolean,
): FieldNode {
  const node: FieldNode = { ...baseNode(id), kind };
  return {
    ...node,
    ...(children.length > 0 ? { children } : {}),
    ...(truncated ? { truncated: true } : {}),
  };
}

/** Identity of an object property `key` under parent `id`. */
function childIdentity(id: NodeIdentity, key: string): NodeIdentity {
  return {
    name: key,
    path: joinPath(id.path, key),
    rowPath: id.rowPath === undefined ? undefined : joinPath(id.rowPath, key),
  };
}

/** Identity of an array's element node (`[]`), opening row-relative paths. */
function elementIdentity(id: NodeIdentity): NodeIdentity {
  return { name: '[]', path: id.path, rowPath: '$' };
}

/**
 * Joins a path segment, bracket-quoting keys that aren't bare JSONata
 * identifiers so the produced path stays valid (e.g. `a.b` → `a.`b``).
 */
function joinPath(prefix: string, key: string): string {
  const segment = isBareIdentifier(key) ? key : '`' + key + '`';
  if (prefix === '') {
    return segment;
  }
  if (prefix === '$') {
    return '$.' + segment;
  }
  return prefix + '.' + segment;
}

/** True for keys usable unquoted in a JSONata path. */
function isBareIdentifier(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

// --- value classification ----------------------------------------------------

/** True for a non-null object or array (i.e. has descendants to walk). */
function isObjectOrArray(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** True for a plain (non-array, non-null) object. */
function isPlainObjectValue(value: unknown): value is Record<string, unknown> {
  return isObjectOrArray(value) && !Array.isArray(value);
}

/** Concrete scalar type of a leaf value (`null` is its own scalar type). */
function scalarTypeOf(value: unknown): ScalarType {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      // strings and anything else exotic surface as 'string' for binding.
      return 'string';
  }
}

/**
 * The dominant {@link FieldKind} across a mixed array sample: the kind held by
 * the most elements, ties broken scalar > object > array (the most table-friendly
 * order). Used only when a sample is not uniformly objects.
 */
function dominantKind(sample: readonly unknown[]): FieldKind {
  let scalar = 0;
  let object = 0;
  let array = 0;
  for (const el of sample) {
    if (Array.isArray(el)) {
      array += 1;
    } else if (isObjectOrArray(el)) {
      object += 1;
    } else {
      scalar += 1;
    }
  }
  if (scalar >= object && scalar >= array) {
    return 'scalar';
  }
  return object >= array ? 'object' : 'array';
}

/** First element of `sample` matching `kind` (falls back to the first element). */
function firstOfKind(sample: readonly unknown[], kind: FieldKind): unknown {
  const match = sample.find((el) => kindOf(el) === kind);
  return match === undefined ? sample[0] : match;
}

/** Structural kind of a single value. */
function kindOf(value: unknown): FieldKind {
  if (Array.isArray(value)) {
    return 'array';
  }
  return isObjectOrArray(value) ? 'object' : 'scalar';
}
