import {
  Component,
  ElementRef,
  ViewEncapsulation,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { mmToPx, pxToMm } from '@rendara/report-engine';
import type { Frame, TemplateElement } from '@rendara/report-schema';
import { DesignerStore } from '../../state/designer-store';
import type { PageSizeMm } from '../../state/drag-create';
import {
  RESIZE_HANDLES,
  type ResizeHandle,
  type SelectionBoxPx,
  boundingFrame,
  moveFramesAsGroup,
  nudgeStepMm,
  resizeFrame,
  selectionBoxPx,
} from '../../state/frame-ops';
import {
  GRID_MM,
  type SnapLine,
  computeSnap,
  snapResizedFrame,
  snapTargets,
} from '../../state/snapping';

/** The live coordinate/size readout shown in the single-selection badge. */
interface CoordBadge {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One selected element's id and the on-screen box (scaled px) the overlay paints. */
interface ElementBox {
  readonly id: string;
  readonly box: SelectionBoxPx;
}

/**
 * Direct-manipulation overlay for the canvas (E5-S6 / E5-S7). It paints the
 * **selection model** and turns pointer/keyboard gestures into immutable frame
 * updates on the store.
 *
 * - **Single selection** — an indigo rectangle, **8 resize handles** and a floating
 *   `x/y · w×h mm` **coordinate badge** (brief §12.2); drag to move, grips to
 *   resize, arrows to nudge.
 * - **Multi selection** (E5-S7) — a draggable indigo box around **each** selected
 *   element (resize is single-selection only) and an `N selected` badge; dragging or
 *   nudging any box moves the **whole selection as a unit** (a grouped selection
 *   therefore moves together). Empty space between the boxes stays click-through, so
 *   marquee/clear still work between elements.
 *
 * Every box derives purely from the element's mm {@link Frame} scaled by zoom
 * ({@link selectionBoxPx}), so it stays a true mirror of the model; a growing/zero
 * -height element (data table, line) has no authored height, so its box height is
 * measured from the rendered node. All placement/transform maths lives in the pure
 * `frame-ops` module; this component only wires the stateful concerns — pointer drag
 * loops, keyboard nudging (arrows = 1 mm, Shift = 10 mm, Escape deselects) and moving
 * focus to the primary box when the selection changes (WCAG 2.2 keyboard path).
 *
 * The layer itself is click-through (`pointer-events: none`); only the boxes and
 * handles are interactive, so clicking *outside* the selection passes through to the
 * canvas hit-test beneath.
 */
@Component({
  selector: 'rdr-selection-overlay',
  templateUrl: './selection-overlay.html',
  styleUrl: './selection-overlay.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-selection-overlay' },
})
export class SelectionOverlay {
  private readonly store = inject(DesignerStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The eight resize grips, for the template `@for`. */
  protected readonly handles = RESIZE_HANDLES;

  /** Screen distance (px) within which an edge snaps to a guide — a constant feel
   *  regardless of zoom (converted to mm at the live zoom for the pure core). */
  private readonly snapThresholdPx = 6;

  /** The live alignment guides to paint during a snapping drag-move (E5-S8). */
  protected readonly guides = signal<readonly SnapLine[]>([]);

  private readonly boxRef = viewChild<ElementRef<HTMLElement>>('box');

  /** Measured pixel heights (scaled) of rendered nodes, by id, for auto-/zero-height elements. */
  private readonly measuredHeightById = signal<ReadonlyMap<string, number>>(new Map());

  /** The selected elements, in selection order (empty when nothing is selected). */
  protected readonly selectedElements = computed<readonly TemplateElement[]>(() =>
    this.store.selectedElements(),
  );

  /** Number of selected elements — drives the single- vs multi-selection rendering. */
  protected readonly count = computed(() => this.selectedElements().length);

  /** True for exactly one selected element (the resize-capable case). */
  protected readonly isSingle = computed(() => this.count() === 1);

  /** The on-screen box (scaled px, sheet-relative) for every selected element. */
  protected readonly elementBoxes = computed<readonly ElementBox[]>(() => {
    const zoom = this.store.zoom();
    const heights = this.measuredHeightById();
    return this.selectedElements().map((el) => ({
      id: el.id,
      box: selectionBoxPx(el.frame, zoom, heights.get(el.id) ?? 0),
    }));
  });

  /** The live coordinate/size readout (mm) for the single-selection badge. */
  protected readonly badge = computed<CoordBadge | null>(() => {
    if (!this.isSingle()) return null;
    const element = this.selectedElements()[0];
    const { frame } = element;
    const heights = this.measuredHeightById();
    const hMm =
      frame.hMm === null || frame.hMm === 0
        ? Math.round(pxToMm((heights.get(element.id) ?? 0) / this.store.zoom()))
        : frame.hMm;
    return { x: frame.xMm, y: frame.yMm, w: frame.wMm, h: hMm };
  });

  /** A spoken description of the current selection, for assistive tech. */
  protected readonly ariaLabel = computed(() => {
    const elements = this.selectedElements();
    if (elements.length === 0) return 'No selection';
    if (elements.length > 1) {
      return `${elements.length} elements selected. Use arrow keys to move them together.`;
    }
    const coords = this.badge();
    const [element] = elements;
    if (coords === null) return 'No selection';
    return `${element.type} element at ${coords.x} by ${coords.y} millimetres, ${coords.w} by ${coords.h} millimetres. Use arrow keys to move.`;
  });

  constructor() {
    // Measure rendered node heights for auto-/zero-height selected elements (a data
    // table grows; a line has no height), re-running after each render and when the
    // selection, zoom or document changes. Only writes when a value actually changed,
    // so the effect settles rather than looping.
    afterRenderEffect(() => {
      const elements = this.selectedElements();
      this.store.zoom();
      this.store.paginatedDocument();
      const next = new Map<string, number>();
      for (const el of elements) {
        if (el.frame.hMm !== null && el.frame.hMm !== 0) continue;
        const node = this.findRenderedNode(el.id);
        next.set(el.id, node ? node.getBoundingClientRect().height : 0);
      }
      const current = this.measuredHeightById();
      if (next.size !== current.size || [...next].some(([id, h]) => current.get(id) !== h)) {
        this.measuredHeightById.set(next);
      }
    });

    // Move focus to the primary selection box when the selection changes, so the
    // arrow-key nudge works immediately after a click, marquee or palette add.
    let lastPrimary: string | undefined;
    effect(() => {
      const primary = this.selectedElements()[0]?.id;
      if (primary !== undefined && primary !== lastPrimary) {
        this.boxRef()?.nativeElement.focus({ preventScroll: true });
      }
      lastPrimary = primary;
    });
  }

  /**
   * Starts a drag-move from any selection box — moves the whole selection as a
   * unit, with **snapping + alignment guides** (E5-S8). After the raw translation,
   * the moved selection's bounding box is snapped: an edge/centre within the
   * pixel threshold of another element, a page edge, a margin or a centre line
   * pulls the group into alignment and paints an indigo guide; otherwise the group
   * origin falls back to the grid. Snapping is skipped when it is toggled off or
   * while Alt is held (a per-gesture free-move bypass). Guides clear on release.
   */
  protected onBoxPointerDown(event: PointerEvent): void {
    const elements = this.selectedElements();
    if (event.button !== 0 || elements.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    // Coalesce the whole drag into one undo step (E5-S9).
    this.store.beginInteraction();
    const startFrames = elements.map((el) => el.frame);
    const ids = new Set(elements.map((el) => el.id));
    const orderedIds = elements.map((el) => el.id);
    const others = this.store.bodyElements().filter((el) => !ids.has(el.id));
    const geometry = this.store.paginatedDocument().geometry;
    const targets = snapTargets(
      others.map((el) => el.frame),
      geometry,
    );
    const pageMm = geometry.pageMm;
    const startX = event.clientX;
    const startY = event.clientY;
    const zoom = this.store.zoom();
    const onMove = (move: PointerEvent): void => {
      const rawDx = pxToMm((move.clientX - startX) / zoom);
      const rawDy = pxToMm((move.clientY - startY) / zoom);
      let moved = moveFramesAsGroup(startFrames, rawDx, rawDy, pageMm);
      if (this.store.snapEnabled() && !move.altKey) {
        const thresholdMm = pxToMm(this.snapThresholdPx / zoom);
        const snap = computeSnap(this.movingRect(moved), targets, thresholdMm, GRID_MM, true);
        if (snap.dxMm !== 0 || snap.dyMm !== 0) {
          moved = moveFramesAsGroup(startFrames, rawDx + snap.dxMm, rawDy + snap.dyMm, pageMm);
        }
        this.guides.set(snap.guides);
      } else {
        this.guides.set([]);
      }
      this.store.setFrames(new Map(orderedIds.map((id, i) => [id, moved[i]])));
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      this.guides.set([]);
      this.store.endInteraction();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /** Starts a resize from one of the eight handles (single selection only). */
  protected onHandlePointerDown(event: PointerEvent, handle: ResizeHandle): void {
    const element = this.selectedElements()[0];
    if (event.button !== 0 || !this.isSingle() || element === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    // Coalesce the whole resize into one undo step (E5-S9).
    this.store.beginInteraction();
    const startFrame = element.frame;
    const pageMm = this.pageMm();
    const startX = event.clientX;
    const startY = event.clientY;
    const zoom = this.store.zoom();
    const onMove = (move: PointerEvent): void => {
      const dxMm = pxToMm((move.clientX - startX) / zoom);
      const dyMm = pxToMm((move.clientY - startY) / zoom);
      let frame = resizeFrame(startFrame, handle, dxMm, dyMm, pageMm);
      // Grid-snap the dragged edge unless snapping is off or Alt bypasses it.
      if (this.store.snapEnabled() && !move.altKey) {
        frame = snapResizedFrame(frame, handle, GRID_MM);
      }
      this.store.updateElement(element.id, { frame });
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      this.store.endInteraction();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /** Keyboard nudge / deselect when a box is focused (WCAG 2.2 keyboard path). */
  protected onKeyDown(event: KeyboardEvent): void {
    if (this.count() === 0) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.store.clearSelection();
      return;
    }
    const step = nudgeStepMm(event.shiftKey);
    let dxMm = 0;
    let dyMm = 0;
    switch (event.key) {
      case 'ArrowLeft':
        dxMm = -step;
        break;
      case 'ArrowRight':
        dxMm = step;
        break;
      case 'ArrowUp':
        dyMm = -step;
        break;
      case 'ArrowDown':
        dyMm = step;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.store.moveSelection(dxMm, dyMm);
  }

  /** Inline position styles for a selection box. */
  protected boxStyle(box: SelectionBoxPx): Record<string, string> {
    return {
      left: `${box.leftPx}px`,
      top: `${box.topPx}px`,
      width: `${box.widthPx}px`,
      height: `${box.heightPx}px`,
    };
  }

  /** Inline position styles for an alignment guide (mm → scaled px, sheet-relative). */
  protected guideStyle(guide: SnapLine): Record<string, string> {
    const zoom = this.store.zoom();
    const posPx = mmToPx(guide.posMm) * zoom;
    const startPx = mmToPx(guide.startMm) * zoom;
    const lengthPx = mmToPx(guide.endMm - guide.startMm) * zoom;
    return guide.axis === 'x'
      ? { left: `${posPx}px`, top: `${startPx}px`, height: `${lengthPx}px` }
      : { top: `${posPx}px`, left: `${startPx}px`, width: `${lengthPx}px` };
  }

  /** The moving selection's bounding box as a {@link RectMm} (growing height → 0). */
  private movingRect(frames: readonly Frame[]): {
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
  } {
    const bounds = boundingFrame(frames) ?? { xMm: 0, yMm: 0, wMm: 0, hMm: 0 };
    return { xMm: bounds.xMm, yMm: bounds.yMm, wMm: bounds.wMm, hMm: bounds.hMm ?? 0 };
  }

  /** The element's rendered hit node (element box or table) within the canvas. */
  private findRenderedNode(id: string): HTMLElement | null {
    const root = this.host.nativeElement.parentElement ?? this.host.nativeElement;
    return root.querySelector<HTMLElement>(`[data-element-id="${id}"], [data-table-id="${id}"]`);
  }

  /** The resolved sheet size (orientation-aware) that frames are clamped within. */
  private pageMm(): PageSizeMm {
    return this.store.paginatedDocument().geometry.pageMm;
  }
}
