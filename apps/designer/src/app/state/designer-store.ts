import { computed } from '@angular/core';
import { signalStore, withComputed, withMethods, withState, patchState } from '@ngrx/signals';
import { paginate, type PaginatedDocument, type ResolvedDataTable } from '@rendara/report-engine';
import type { Frame, Page, RendaraTemplate, TemplateElement } from '@rendara/report-schema';
import {
  addElementToBody,
  addElementsToBody,
  collectElements,
  createEmptyTemplate,
  removeElementById,
  removeElementsById,
  setPageOf,
  updateElementById,
  updateElementsById,
} from './template-ops';
import {
  emptyHistory,
  pushHistory,
  redo as redoHistory,
  undo as undoHistory,
  type History,
  type HistorySnapshot,
} from './history';
import { cloneElementsForPaste } from './clipboard-ops';
import type { SampleData } from './sample-data';
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
import { alignFrames, distributeFrames, type AlignEdge, type DistributeAxis } from './align-ops';

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
  /**
   * Whether grid snapping and smart alignment guides are active during drag
   * (E5-S8). View-state, like {@link zoom}: it never persists on export and does
   * not mark the document dirty. A modifier key (Alt) bypasses it per-gesture in
   * the canvas without changing this flag.
   */
  readonly snapEnabled: boolean;
  /**
   * The command/history stack backing undo/redo (E5-S9). An entry is pushed only
   * when an edit actually changes the document slice ({@link DesignerState.template}
   * or {@link DesignerState.groups}); pure selection/zoom/snap changes never grow
   * it. See {@link History}.
   */
  readonly history: History;
  /**
   * The pre-edit snapshot captured while a continuous gesture (a drag-move or
   * resize) is open, or `null` when none is. It coalesces the gesture into a single
   * undo step: mutations during the gesture skip history, and {@link
   * DesignerStore.endInteraction} pushes this one snapshot if the document changed.
   */
  readonly interaction: HistorySnapshot | null;
  /**
   * The internal clipboard (E5-S9): elements captured by copy/cut, ready to paste.
   * App-local (not the OS clipboard) so paste is deterministic and carries no
   * injection surface. View-state — never persisted, never marks the document dirty.
   */
  readonly clipboard: readonly TemplateElement[];
  /**
   * The imported sample Data JSON, or `null` when none is loaded (E6-S6). This is
   * a designer aid — it powers the Data tab's field tree (and later drag-to-bind /
   * table sources) — held in view-state: it is never written into the template, so
   * importing it does not mark the document dirty and it is not undoable.
   */
  readonly sampleData: SampleData | null;
  /**
   * Resolved data-table rows + aggregates by element id (E6-S8), produced async
   * from the imported sample data by {@link TablePreviewService}. A view-state
   * preview cache — it feeds {@link paginatedDocument} so the canvas shows real
   * rows + totals, but never touches the template, the dirty flag or undo history.
   * Empty until sample data is imported and the first resolution lands; a table
   * absent from this map falls back to the header-only structural preview.
   */
  readonly resolvedTables: ReadonlyMap<string, ResolvedDataTable>;
}

function initialState(): DesignerState {
  return {
    template: createEmptyTemplate(),
    selectedIds: [],
    zoom: DEFAULT_ZOOM,
    dirty: false,
    groups: [],
    snapEnabled: true,
    history: emptyHistory(),
    interaction: null,
    clipboard: [],
    sampleData: null,
    resolvedTables: new Map(),
  };
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * A header-only **structural preview** of every data-table element (E6-S4): the
 * paginator *skips* any table absent from its resolved map, so without an entry a
 * data table would render nothing and its columns could not be seen or edited on
 * the canvas. Each table is resolved as an empty body — `layoutTable` still emits
 * the column **header row**, so adding / removing / reordering / resizing columns
 * is live and WYSIWYG even before sample data is loaded.
 *
 * This is the fallback layer: {@link paginatedDocument} overlays the real
 * {@link DesignerState.resolvedTables} (E6-S8) on top, so a table bound against
 * imported sample data shows its detail rows + totals while an unbound (or
 * not-yet-resolved) table keeps the header-only preview.
 */
function placeholderResolvedTables(
  template: RendaraTemplate,
): ReadonlyMap<string, ResolvedDataTable> {
  const tables = new Map<string, ResolvedDataTable>();
  for (const element of collectElements(template)) {
    if (element.type === 'dataTable') {
      tables.set(element.id, { rows: [], columnFooters: [], errors: [], diagnostics: [] });
    }
  }
  return tables;
}

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

/** The set of all element ids in `template`, across every band. */
function existingIdsOf(template: RendaraTemplate): Set<string> {
  return new Set(collectElements(template).map((el) => el.id));
}

/** Captures the undoable slice of `state` (template + selection + grouping). */
function snapshotOf(state: DesignerState): HistorySnapshot {
  return { template: state.template, selectedIds: state.selectedIds, groups: state.groups };
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
    /** True when 2+ elements are selected, so they can be aligned (E5-S8). */
    canAlign: computed(() => store.selectedIds().length >= 2),
    /** True when 3+ elements are selected, so they can be distributed (E5-S8). */
    canDistribute: computed(() => store.selectedIds().length >= 3),
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
     * from, so both views stay consistent. Recomputed when the template or the
     * resolved-table preview changes. Each data table uses its resolved rows +
     * totals ({@link DesignerState.resolvedTables}, E6-S8) when available, falling
     * back to the header-only structural preview (E6-S4) otherwise.
     */
    paginatedDocument: computed<PaginatedDocument>(() => {
      const template = store.template();
      // Overlay the async-resolved tables over the header-only fallback so every
      // table has an entry (the paginator skips tables it can't find), unbound
      // tables keep their header preview, and bound ones show rows + totals.
      const resolved = new Map([
        ...placeholderResolvedTables(template),
        ...store.resolvedTables(),
      ]);
      return paginate(template, resolved);
    }),
  })),
  withComputed((store) => ({
    /** Page count of the rendered document (≥ 1). */
    pageCount: computed(() => store.paginatedDocument().pageCount),
    /** True when there is at least one edit to undo (E5-S9). */
    canUndo: computed(() => store.history().past.length > 0),
    /** True when there is at least one undone edit to redo (E5-S9). */
    canRedo: computed(() => store.history().future.length > 0),
    /** True when the clipboard holds elements that paste can place (E5-S9). */
    hasClipboard: computed(() => store.clipboard().length > 0),
    /** True when sample data is loaded, so the Data tab shows its field tree (E6-S6). */
    hasSampleData: computed(() => store.sampleData() !== null),
  })),
  withMethods((store) => {
    /**
     * Applies a document edit and records undo history (E5-S9). It runs `updater`,
     * then — if the edit actually changed the undoable slice (`template` or
     * `groups`) and no gesture is open — pushes the pre-edit snapshot onto the undo
     * stack (clearing redo). During an open interaction (a drag), history is left to
     * {@link endInteraction}, so the whole gesture coalesces into one undo step.
     * View-only methods (selection, zoom, snap) bypass this and patch directly.
     */
    const recordingPatch = (updater: (state: DesignerState) => Partial<DesignerState>): void => {
      patchState(store, (state) => {
        const changes = updater(state);
        const nextTemplate = changes.template ?? state.template;
        const nextGroups = changes.groups ?? state.groups;
        const docChanged = nextTemplate !== state.template || nextGroups !== state.groups;
        if (!docChanged || state.interaction !== null) return changes;
        return { ...changes, history: pushHistory(state.history, snapshotOf(state)) };
      });
    };

    /** Clones the current selection's elements onto the top of the body, selected. */
    const addClones = (sources: readonly TemplateElement[]): void => {
      if (sources.length === 0) return;
      recordingPatch((state) => {
        let maxZ = 0;
        for (const el of collectElements(state.template)) maxZ = Math.max(maxZ, el.z);
        const clones = cloneElementsForPaste(
          sources,
          () => `el_${crypto.randomUUID()}`,
          maxZ + 1,
          store.paginatedDocument().geometry.pageMm,
        );
        const template = addElementsToBody(state.template, clones);
        return { template, selectedIds: clones.map((el) => el.id), dirty: true };
      });
    };

    /** Copies the current selection's elements to the clipboard (no document change). */
    const copyToClipboard = (): void => {
      patchState(store, (state) => {
        const byId = new Map(collectElements(state.template).map((el) => [el.id, el]));
        const picked = state.selectedIds.flatMap((id) => {
          const el = byId.get(id);
          return el ? [el] : [];
        });
        return picked.length > 0 ? { clipboard: picked } : {};
      });
    };

    /** Deletes the current selection in one undo step; prunes selection and groups. */
    const deleteSelection = (): void => {
      recordingPatch((state) => {
        const template = removeElementsById(state.template, new Set(state.selectedIds));
        if (template === state.template) return {};
        return {
          template,
          selectedIds: [],
          groups: sanitizeGroups(state.groups, existingIdsOf(template)),
          dirty: true,
        };
      });
    };

    return {
      /** Replaces the document, clearing selection, grouping, history and dirty. */
      loadTemplate(template: RendaraTemplate): void {
        patchState(store, {
          template,
          selectedIds: [],
          groups: [],
          dirty: false,
          history: emptyHistory(),
          interaction: null,
          clipboard: [],
        });
      },
      /** Resets to a fresh empty document, clearing history and clipboard. */
      resetDocument(): void {
        patchState(store, {
          template: createEmptyTemplate(),
          selectedIds: [],
          groups: [],
          dirty: false,
          history: emptyHistory(),
          interaction: null,
          clipboard: [],
        });
      },
      /** Sets the canvas zoom (clamped). View state — does not mark dirty. */
      setZoom(zoom: number): void {
        patchState(store, { zoom: clampZoom(zoom) });
      },
      /** Enables/disables snapping + alignment guides (E5-S8). View state — not dirty. */
      setSnapEnabled(snapEnabled: boolean): void {
        patchState(store, { snapEnabled });
      },
      /** Flips the snapping toggle (E5-S8). View state — not dirty. */
      toggleSnap(): void {
        patchState(store, (state) => ({ snapEnabled: !state.snapEnabled }));
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
        recordingPatch((state) => ({
          template: addElementToBody(state.template, element),
          dirty: true,
        }));
      },
      /** Immutably patches the element with `id`; marks dirty when it exists. */
      updateElement(id: string, changes: Partial<TemplateElement>): void {
        recordingPatch((state) => {
          const template = updateElementById(state.template, id, changes);
          // Identity-unchanged means no such element; leave dirty untouched.
          if (template === state.template) return {};
          return { template, dirty: true };
        });
      },
      /** Removes the element with `id`, pruning it from the selection and any group. */
      removeElement(id: string): void {
        recordingPatch((state) => {
          const template = removeElementById(state.template, id);
          if (template === state.template) return {};
          return {
            template,
            selectedIds: sanitizeSelection(template, state.selectedIds),
            groups: sanitizeGroups(state.groups, existingIdsOf(template)),
            dirty: true,
          };
        });
      },
      /**
       * Removes every selected element in one step (E5-S9) — the "delete" command.
       * Prunes the selection and any group the removed elements touched, and records
       * a single undo entry. A no-op (nothing selected, or none still exist) leaves
       * the document and dirty flag untouched.
       */
      removeSelection(): void {
        deleteSelection();
      },
      /** Replaces the page model and marks the document dirty. */
      setPage(page: Page): void {
        recordingPatch((state) => ({ template: setPageOf(state.template, page), dirty: true }));
      },
      /**
       * Applies a z-order operation to the current selection within the body band
       * (E5-S7): bring-to-front / forward / backward / send-to-back. The pure
       * {@link planZOrder} renumbers the stack and returns only the changed `z`
       * values, so a no-op (already at the extreme, or nothing selected) leaves the
       * document untouched — including the dirty flag.
       */
      reorderSelection(op: ZOrderOp): void {
        recordingPatch((state) => {
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
        recordingPatch((state) => {
          const groups = addGroup(state.groups, state.selectedIds, existingIdsOf(state.template));
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
        recordingPatch((state) => {
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
        recordingPatch((state) => {
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
        recordingPatch((state) => {
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
      /**
       * Aligns the current selection along `edge` (E5-S8) — to the selection's
       * bounding box, via the pure {@link alignFrames}. Needs 2+ selected elements
       * (nothing to align a single element against); a no-op leaves the document and
       * dirty flag untouched.
       */
      alignSelection(edge: AlignEdge): void {
        recordingPatch((state) => {
          const byId = new Map(collectElements(state.template).map((el) => [el.id, el]));
          const selected = state.selectedIds.flatMap((id) => {
            const el = byId.get(id);
            return el ? [el] : [];
          });
          if (selected.length < 2) return {};
          const aligned = alignFrames(
            selected.map((el) => el.frame),
            edge,
          );
          const changesById = new Map(selected.map((el, i) => [el.id, { frame: aligned[i] }]));
          const template = updateElementsById(state.template, changesById);
          if (template === state.template) return {};
          return { template, dirty: true };
        });
      },
      /**
       * Distributes the current selection's centres evenly along `axis` (E5-S8) via
       * the pure {@link distributeFrames}. Needs 3+ selected elements (no interior to
       * space otherwise); a no-op leaves the document and dirty flag untouched.
       */
      distributeSelection(axis: DistributeAxis): void {
        recordingPatch((state) => {
          const byId = new Map(collectElements(state.template).map((el) => [el.id, el]));
          const selected = state.selectedIds.flatMap((id) => {
            const el = byId.get(id);
            return el ? [el] : [];
          });
          if (selected.length < 3) return {};
          const distributed = distributeFrames(
            selected.map((el) => el.frame),
            axis,
          );
          const changesById = new Map(selected.map((el, i) => [el.id, { frame: distributed[i] }]));
          const template = updateElementsById(state.template, changesById);
          if (template === state.template) return {};
          return { template, dirty: true };
        });
      },
      /** Marks the document clean (e.g. after a save/export). */
      markClean(): void {
        patchState(store, { dirty: false });
      },
      /**
       * Loads imported sample data (E6-S6), replacing any previous import. Sample
       * data is a designer aid (it feeds the Data tab's field tree and later
       * binding), held in view-state — it never touches the template, the dirty
       * flag or undo history.
       */
      setSampleData(sampleData: SampleData): void {
        patchState(store, { sampleData });
      },
      /** Clears the imported sample data (E6-S6). View state — not dirty/undoable. */
      clearSampleData(): void {
        patchState(store, { sampleData: null });
      },
      /**
       * Sets the resolved data-table preview cache (E6-S8) — the rows + aggregates
       * {@link TablePreviewService} resolves async from sample data, consumed by
       * {@link paginatedDocument}. View state: it never touches the template, the
       * dirty flag or undo history.
       */
      setResolvedTables(resolvedTables: ReadonlyMap<string, ResolvedDataTable>): void {
        patchState(store, { resolvedTables });
      },
      /**
       * Opens a continuous-gesture transaction (E5-S9): captures the pre-gesture
       * snapshot so the drag's many intermediate edits coalesce into one undo step.
       * Idempotent — a second call while one is open is ignored.
       */
      beginInteraction(): void {
        patchState(store, (state) =>
          state.interaction !== null ? {} : { interaction: snapshotOf(state) },
        );
      },
      /**
       * Closes the gesture transaction (E5-S9): if the document changed since
       * {@link beginInteraction}, pushes the captured snapshot as one undo entry;
       * otherwise (a click with no move) records nothing. Always clears the pending
       * snapshot.
       */
      endInteraction(): void {
        patchState(store, (state) => {
          const pending = state.interaction;
          if (pending === null) return {};
          const docChanged = state.template !== pending.template || state.groups !== pending.groups;
          return {
            interaction: null,
            ...(docChanged ? { history: pushHistory(state.history, pending) } : {}),
          };
        });
      },
      /**
       * Undoes the last document edit (E5-S9): restores the previous snapshot's
       * template, selection and grouping (both sanitized against the restored
       * document) and pushes the current state onto the redo stack. A no-op when
       * there is nothing to undo. Marks the document dirty — it differs from the
       * last save (undo back to a freshly-loaded document is an accepted exception).
       */
      undo(): void {
        patchState(store, (state) => {
          const step = undoHistory(state.history, snapshotOf(state));
          if (step === null) return {};
          const { snapshot, history } = step;
          const existing = existingIdsOf(snapshot.template);
          return {
            template: snapshot.template,
            selectedIds: sanitizeSelection(snapshot.template, snapshot.selectedIds),
            groups: sanitizeGroups(snapshot.groups, existing),
            history,
            dirty: true,
          };
        });
      },
      /** Redoes the last undone edit (E5-S9). A no-op when there is nothing to redo. */
      redo(): void {
        patchState(store, (state) => {
          const step = redoHistory(state.history, snapshotOf(state));
          if (step === null) return {};
          const { snapshot, history } = step;
          const existing = existingIdsOf(snapshot.template);
          return {
            template: snapshot.template,
            selectedIds: sanitizeSelection(snapshot.template, snapshot.selectedIds),
            groups: sanitizeGroups(snapshot.groups, existing),
            history,
            dirty: true,
          };
        });
      },
      /**
       * Copies the current selection's elements to the clipboard (E5-S9). No document
       * change, so it is not undoable and does not mark dirty. A no-op when nothing is
       * selected (the clipboard keeps its prior contents).
       */
      copySelection(): void {
        copyToClipboard();
      },
      /** Copies the selection to the clipboard, then deletes it (E5-S9) — one undo step. */
      cutSelection(): void {
        copyToClipboard();
        deleteSelection();
      },
      /**
       * Pastes the clipboard's elements (E5-S9): fresh ids, cascaded onto the sheet,
       * placed on top and selected — one undo step. A no-op when the clipboard is empty.
       */
      paste(): void {
        addClones(store.clipboard());
      },
      /**
       * Duplicates the current selection in place (E5-S9): like paste but sourced from
       * the selection and **without touching the clipboard** (standard Ctrl/⌘+D). A
       * no-op when nothing is selected.
       */
      duplicateSelection(): void {
        const byId = store.elementsById();
        const sources = store.selectedIds().flatMap((id) => {
          const el = byId.get(id);
          return el ? [el] : [];
        });
        addClones(sources);
      },
    };
  }),
);
