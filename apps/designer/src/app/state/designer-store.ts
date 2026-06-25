import { computed } from '@angular/core';
import { signalStore, withComputed, withMethods, withState, patchState } from '@ngrx/signals';
import { paginate, type PaginatedDocument, type ResolvedDataTable } from '@rendara/report-engine';
import type { Frame, Page, RendaraTemplate, TemplateElement } from '@rendara/report-schema';
import {
  addElementToBody,
  collectElements,
  createEmptyTemplate,
  removeElementById,
  setPageOf,
  updateElementById,
  updateElementsById,
} from './template-ops';
import {
  addGroup,
  anyGrouped,
  expandSelection,
  groupOf,
  removeGroupsTouching,
  sanitizeGroups,
  type Groups,
} from './group-ops';
import { planZOrder, stackOrder, type ZOrderOp } from './z-order-ops';
import { moveFramesAsGroup } from './frame-ops';

/** Zoom bounds for the canvas (1 = 100%). */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
export const DEFAULT_ZOOM = 1;

/** The shape of the designer's single source of truth (E5-S2). */
interface DesignerState {
  /** The document being edited — the versioned Template JSON (brief §5). */
  readonly template: RendaraTemplate;
  /** Ids of the currently selected elements. Invariants: deduped, and every id
   *  references an element that exists in {@link template}. */
  readonly selectedIds: readonly string[];
  /** Canvas zoom factor (1 = 100%), clamped to [{@link MIN_ZOOM}, {@link MAX_ZOOM}]. */
  readonly zoom: number;
  /** True when the document has unsaved changes since the last load/clean. */
  readonly dirty: boolean;
  /**
   * Element groups (E5-S7): each is a list of ≥2 element ids that select and move
   * as a unit. Grouping is a designer-editing convenience held in view-state — the
   * Template schema has no group concept — so it is not persisted on export and
   * does not mark the document dirty. Invariants (members exist, ≥2 per group, no
   * element in two groups) are kept by {@link sanitizeGroups}.
   */
  readonly groups: Groups;
}

function initialState(): DesignerState {
  return {
    template: createEmptyTemplate(),
    selectedIds: [],
    zoom: DEFAULT_ZOOM,
    dirty: false,
    groups: [],
  };
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * No resolved data tables yet: data binding and table resolution are E6, so the
 * canvas paginates the current document with an empty table map. An empty
 * template (and any v1 fixed elements) paginates without needing this.
 */
const NO_TABLES: ReadonlyMap<string, ResolvedDataTable> = new Map();

/**
 * Filters `ids` down to those that exist in `template`, removing duplicates and
 * preserving first-seen order. This is the single chokepoint that keeps the
 * selection invariant true after any selection or document change.
 */
function sanitizeSelection(template: RendaraTemplate, ids: readonly string[]): readonly string[] {
  const existing = new Set(collectElements(template).map((el) => el.id));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (existing.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

/**
 * The designer document store (E5-S2): the single source of truth for the
 * template model, selection, zoom and dirty flag. All updates are immutable —
 * mutations go through {@link patchState} and the pure helpers in
 * `template-ops`, so every change yields new object references and the prior
 * state is never touched. Selectors are exposed as signals via `withComputed`.
 *
 * Document mutations (`addElement`, `updateElement`, `removeElement`,
 * `setPage`) set the dirty flag; selection and zoom are view state and do not.
 * The store is `providedIn: 'root'` — the designer edits one document at a time.
 */
export const DesignerStore = signalStore(
  { providedIn: 'root' },
  withState<DesignerState>(initialState()),
  withComputed((store) => ({
    /** The document's page model (size/orientation/margins/units). */
    page: computed(() => store.template().page),
    /** Elements in the main body flow. */
    bodyElements: computed(() => store.template().body.elements),
    /** All elements across every band, keyed by id. */
    elementsById: computed(() => {
      const map = new Map<string, TemplateElement>();
      for (const el of collectElements(store.template())) map.set(el.id, el);
      return map;
    }),
    /** The selected elements, in selection order. */
    selectedElements: computed(() => {
      const byId = new Map<string, TemplateElement>(
        collectElements(store.template()).map((el) => [el.id, el]),
      );
      return store.selectedIds().flatMap((id) => {
        const el = byId.get(id);
        return el ? [el] : [];
      });
    }),
    /** The first selected element, or `undefined` when nothing is selected. */
    primarySelection: computed(() => {
      const [first] = store.selectedIds();
      if (first === undefined) return undefined;
      return collectElements(store.template()).find((el) => el.id === first);
    }),
    hasSelection: computed(() => store.selectedIds().length > 0),
    selectionCount: computed(() => store.selectedIds().length),
    /** True when 2+ elements are selected, so they can be grouped (E5-S7). */
    canGroup: computed(() => store.selectedIds().length >= 2),
    /** True when any selected element belongs to a group, so "ungroup" can act. */
    canUngroup: computed(() => anyGrouped(store.groups(), store.selectedIds())),
    /**
     * Body elements in visual stack order, **top first** — the order the Layers
     * panel lists them (E5-S7). Topmost (highest paint depth) sits at the top of
     * the list, matching the convention of every layers panel.
     */
    bodyStack: computed(() => {
      const elements = store.template().body.elements;
      const byId = new Map(elements.map((el) => [el.id, el]));
      return [...stackOrder(elements)].reverse().flatMap((id) => {
        const el = byId.get(id);
        return el ? [el] : [];
      });
    }),
    /** Zoom as an integer percentage for the status bar (e.g. 100). */
    zoomPercent: computed(() => Math.round(store.zoom() * 100)),
    /**
     * The current document paginated by the shared engine — the single derived
     * model the canvas renders (in design mode) and the status bar counts pages
     * from, so both views stay consistent. Recomputed only when the template
     * changes. Tables resolve in E6; for now no data tables are supplied.
     */
    paginatedDocument: computed<PaginatedDocument>(() => paginate(store.template(), NO_TABLES)),
  })),
  withComputed((store) => ({
    /** Page count of the rendered document (≥ 1). */
    pageCount: computed(() => store.paginatedDocument().pageCount),
  })),
  withMethods((store) => ({
    /** Replaces the document, clearing selection, grouping and the dirty flag. */
    loadTemplate(template: RendaraTemplate): void {
      patchState(store, { template, selectedIds: [], groups: [], dirty: false });
    },
    /** Resets to a fresh empty document. */
    resetDocument(): void {
      patchState(store, {
        template: createEmptyTemplate(),
        selectedIds: [],
        groups: [],
        dirty: false,
      });
    },
    /** Sets the canvas zoom (clamped). View state — does not mark dirty. */
    setZoom(zoom: number): void {
      patchState(store, { zoom: clampZoom(zoom) });
    },
    /**
     * Replaces the selection with the given ids — **group-expanded** (selecting a
     * grouped element pulls in its whole group), then sanitized to existing/deduped.
     * Used by marquee select, which passes the raw intersected ids.
     */
    select(ids: readonly string[]): void {
      patchState(store, (state) => ({
        selectedIds: sanitizeSelection(state.template, expandSelection(state.groups, ids)),
      }));
    },
    /** Selects one element and its group-mates (or clears if it does not exist). */
    selectOne(id: string): void {
      patchState(store, (state) => ({
        selectedIds: sanitizeSelection(state.template, expandSelection(state.groups, [id])),
      }));
    },
    /**
     * Toggles an element (and its whole group) into or out of the selection —
     * the shift-click multi-select gesture (E5-S7). Removing when the element is
     * already selected drops every group-mate too, so a group toggles as a unit.
     */
    toggleSelection(id: string): void {
      patchState(store, (state) => {
        const members = groupOf(state.groups, id) ?? [id];
        const next = state.selectedIds.includes(id)
          ? state.selectedIds.filter((existing) => !members.includes(existing))
          : [...state.selectedIds, ...members];
        return {
          selectedIds: sanitizeSelection(state.template, expandSelection(state.groups, next)),
        };
      });
    },
    /** Clears the selection. */
    clearSelection(): void {
      patchState(store, { selectedIds: [] });
    },
    /** Appends an element to the body band and marks the document dirty. */
    addElement(element: TemplateElement): void {
      patchState(store, (state) => ({
        template: addElementToBody(state.template, element),
        dirty: true,
      }));
    },
    /** Immutably patches the element with `id`; marks dirty when it exists. */
    updateElement(id: string, changes: Partial<TemplateElement>): void {
      patchState(store, (state) => {
        const template = updateElementById(state.template, id, changes);
        // Identity-unchanged means no such element; leave dirty untouched.
        if (template === state.template) return {};
        return { template, dirty: true };
      });
    },
    /** Removes the element with `id`, pruning it from the selection and any group. */
    removeElement(id: string): void {
      patchState(store, (state) => {
        const template = removeElementById(state.template, id);
        if (template === state.template) return {};
        const existing = new Set(collectElements(template).map((el) => el.id));
        return {
          template,
          selectedIds: sanitizeSelection(template, state.selectedIds),
          groups: sanitizeGroups(state.groups, existing),
          dirty: true,
        };
      });
    },
    /** Replaces the page model and marks the document dirty. */
    setPage(page: Page): void {
      patchState(store, (state) => ({ template: setPageOf(state.template, page), dirty: true }));
    },
    /**
     * Applies a z-order operation to the current selection within the body band
     * (E5-S7): bring-to-front / forward / backward / send-to-back. The pure
     * {@link planZOrder} renumbers the stack and returns only the changed `z`
     * values, so a no-op (already at the extreme, or nothing selected) leaves the
     * document untouched — including the dirty flag.
     */
    reorderSelection(op: ZOrderOp): void {
      patchState(store, (state) => {
        const changes = planZOrder(state.template.body.elements, state.selectedIds, op);
        if (changes.size === 0) return {};
        const changesById = new Map([...changes].map(([id, z]) => [id, { z }]));
        return { template: updateElementsById(state.template, changesById), dirty: true };
      });
    },
    /**
     * Groups the current selection (E5-S7): 2+ selected elements become a group
     * that selects and moves as a unit. Regrouping moves members out of any prior
     * group. Grouping is view-state, so it does not mark the document dirty; the
     * selection expands to the full new group.
     */
    groupSelection(): void {
      patchState(store, (state) => {
        const existing = new Set(collectElements(state.template).map((el) => el.id));
        const groups = addGroup(state.groups, state.selectedIds, existing);
        if (groups === state.groups) return {};
        return {
          groups,
          selectedIds: sanitizeSelection(
            state.template,
            expandSelection(groups, state.selectedIds),
          ),
        };
      });
    },
    /** Ungroups any group touched by the current selection (view-state, not dirty). */
    ungroupSelection(): void {
      patchState(store, (state) => {
        if (!anyGrouped(state.groups, state.selectedIds)) return {};
        return { groups: removeGroupsTouching(state.groups, state.selectedIds) };
      });
    },
    /**
     * Commits a batch of new {@link Frame}s by element id in one immutable update
     * (E5-S7) — the seam a multi-element drag-move writes through, so the whole
     * selection moves in a single new template reference. A no-op (no id matches)
     * leaves the document and dirty flag untouched.
     */
    setFrames(framesById: ReadonlyMap<string, Frame>): void {
      patchState(store, (state) => {
        const changesById = new Map([...framesById].map(([id, frame]) => [id, { frame }]));
        const template = updateElementsById(state.template, changesById);
        if (template === state.template) return {};
        return { template, dirty: true };
      });
    },
    /**
     * Moves the whole current selection by `(dxMm, dyMm)` as a rigid unit, clamped
     * onto the sheet (E5-S7) — used by keyboard nudge. Relative offsets are
     * preserved, so a multi-selection or group keeps its shape.
     */
    moveSelection(dxMm: number, dyMm: number): void {
      const pageMm = store.paginatedDocument().geometry.pageMm;
      patchState(store, (state) => {
        const byId = new Map(collectElements(state.template).map((el) => [el.id, el]));
        const selected = state.selectedIds.flatMap((id) => {
          const el = byId.get(id);
          return el ? [el] : [];
        });
        if (selected.length === 0) return {};
        const moved = moveFramesAsGroup(
          selected.map((el) => el.frame),
          dxMm,
          dyMm,
          pageMm,
        );
        const changesById = new Map(selected.map((el, i) => [el.id, { frame: moved[i] }]));
        return { template: updateElementsById(state.template, changesById), dirty: true };
      });
    },
    /** Marks the document clean (e.g. after a save/export). */
    markClean(): void {
      patchState(store, { dirty: false });
    },
  })),
);
