import { computed } from '@angular/core';
import { signalStore, withComputed, withMethods, withState, patchState } from '@ngrx/signals';
import type { Page, RendaraTemplate, TemplateElement } from '@rendara/report-schema';
import {
  addElementToBody,
  collectElements,
  createEmptyTemplate,
  removeElementById,
  setPageOf,
  updateElementById,
} from './template-ops';

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
}

function initialState(): DesignerState {
  return {
    template: createEmptyTemplate(),
    selectedIds: [],
    zoom: DEFAULT_ZOOM,
    dirty: false,
  };
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Filters `ids` down to those that exist in `template`, removing duplicates and
 * preserving first-seen order. This is the single chokepoint that keeps the
 * selection invariant true after any selection or document change.
 */
function sanitizeSelection(
  template: RendaraTemplate,
  ids: readonly string[],
): readonly string[] {
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
    /** Zoom as an integer percentage for the status bar (e.g. 100). */
    zoomPercent: computed(() => Math.round(store.zoom() * 100)),
  })),
  withMethods((store) => ({
    /** Replaces the document, clearing selection and the dirty flag. */
    loadTemplate(template: RendaraTemplate): void {
      patchState(store, { template, selectedIds: [], dirty: false });
    },
    /** Resets to a fresh empty document. */
    resetDocument(): void {
      patchState(store, { template: createEmptyTemplate(), selectedIds: [], dirty: false });
    },
    /** Sets the canvas zoom (clamped). View state — does not mark dirty. */
    setZoom(zoom: number): void {
      patchState(store, { zoom: clampZoom(zoom) });
    },
    /** Replaces the selection with the given ids (sanitized to existing, deduped). */
    select(ids: readonly string[]): void {
      patchState(store, (state) => ({ selectedIds: sanitizeSelection(state.template, ids) }));
    },
    /** Selects exactly one element (or clears if it does not exist). */
    selectOne(id: string): void {
      patchState(store, (state) => ({ selectedIds: sanitizeSelection(state.template, [id]) }));
    },
    /** Adds the id to the selection if absent, removes it if already present. */
    toggleSelection(id: string): void {
      patchState(store, (state) => {
        const next = state.selectedIds.includes(id)
          ? state.selectedIds.filter((existing) => existing !== id)
          : [...state.selectedIds, id];
        return { selectedIds: sanitizeSelection(state.template, next) };
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
    /** Removes the element with `id`, pruning it from the selection. */
    removeElement(id: string): void {
      patchState(store, (state) => {
        const template = removeElementById(state.template, id);
        if (template === state.template) return {};
        return {
          template,
          selectedIds: sanitizeSelection(template, state.selectedIds),
          dirty: true,
        };
      });
    },
    /** Replaces the page model and marks the document dirty. */
    setPage(page: Page): void {
      patchState(store, (state) => ({ template: setPageOf(state.template, page), dirty: true }));
    },
    /** Marks the document clean (e.g. after a save/export). */
    markClean(): void {
      patchState(store, { dirty: false });
    },
  })),
);
