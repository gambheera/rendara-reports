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
import { pxToMm } from '@rendara/report-engine';
import type { Frame, TemplateElement } from '@rendara/report-schema';
import { DesignerStore } from '../../state/designer-store';
import type { PageSizeMm } from '../../state/drag-create';
import {
  RESIZE_HANDLES,
  type ResizeHandle,
  moveFrame,
  nudgeFrame,
  nudgeStepMm,
  resizeFrame,
  selectionBoxPx,
} from '../../state/frame-ops';

/** The live coordinate/size readout shown in the floating badge. */
interface CoordBadge {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Direct-manipulation overlay for the canvas (E5-S6). It paints the **selection
 * model** over the primary selected element — an indigo rectangle, **8 resize
 * handles** and a floating `x/y · w×h mm` **coordinate badge** (brief §12.2) —
 * and turns pointer/keyboard gestures into immutable frame updates on the store.
 *
 * The overlay derives its box purely from the element's mm {@link Frame} scaled
 * by zoom ({@link selectionBoxPx}), so it stays a true mirror of the model: every
 * move/resize commits through `DesignerStore.updateElement`, and the box re-derives
 * from the new frame. A growing/zero-height element (a data table or line) has no
 * authored height, so its box height is measured from the rendered node.
 *
 * All placement/transform math lives in the pure `frame-ops` module; this
 * component only wires the stateful concerns: pointer drag loops (move + resize),
 * keyboard nudging (arrows = 1 mm, Shift = 10 mm, Escape deselects) and moving
 * focus to the box when the selection changes, so the canvas is keyboard-operable
 * (WCAG 2.2 AA). Multi-select is E5-S7; this drives the single primary selection.
 *
 * The layer itself is click-through (`pointer-events: none`); only the box and
 * handles are interactive, so clicking an *unselected* element passes through to
 * the canvas hit-test beneath.
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

  private readonly boxRef = viewChild<ElementRef<HTMLElement>>('box');

  /** Measured pixel height of the rendered node, for auto-/zero-height elements. */
  private readonly measuredHeightPx = signal(0);

  /** The element the overlay is anchored to, or `undefined` when nothing is selected. */
  protected readonly selected = computed<TemplateElement | undefined>(() =>
    this.store.primarySelection(),
  );

  /** The on-screen box (scaled px, sheet-relative) the overlay paints; `null` when idle. */
  protected readonly box = computed(() => {
    const element = this.selected();
    if (element === undefined) return null;
    return selectionBoxPx(element.frame, this.store.zoom(), this.measuredHeightPx());
  });

  /** The live coordinate/size readout (mm) for the badge. */
  protected readonly badge = computed<CoordBadge | null>(() => {
    const element = this.selected();
    if (element === undefined) return null;
    const { frame } = element;
    const hMm =
      frame.hMm === null || frame.hMm === 0
        ? Math.round(pxToMm(this.measuredHeightPx() / this.store.zoom()))
        : frame.hMm;
    return { x: frame.xMm, y: frame.yMm, w: frame.wMm, h: hMm };
  });

  /** A spoken description of the current selection + position, for assistive tech. */
  protected readonly ariaLabel = computed(() => {
    const element = this.selected();
    const coords = this.badge();
    if (element === undefined || coords === null) return 'No selection';
    return `${element.type} element at ${coords.x} by ${coords.y} millimetres, ${coords.w} by ${coords.h} millimetres. Use arrow keys to move.`;
  });

  constructor() {
    // Measure the rendered node's height for auto-/zero-height elements (a data
    // table grows; a line has no height), re-running after each render and when the
    // selection, zoom or document changes.
    afterRenderEffect(() => {
      const element = this.selected();
      this.store.zoom();
      this.store.paginatedDocument();
      if (element === undefined || (element.frame.hMm !== null && element.frame.hMm !== 0)) {
        return;
      }
      const node = this.findRenderedNode(element.id);
      this.measuredHeightPx.set(node ? node.getBoundingClientRect().height : 0);
    });

    // Move focus to the selection box when a new element becomes selected, so the
    // arrow-key nudge works immediately after a click or palette add.
    let lastId: string | undefined;
    effect(() => {
      const id = this.selected()?.id;
      if (id !== undefined && id !== lastId) {
        this.boxRef()?.nativeElement.focus({ preventScroll: true });
      }
      lastId = id;
    });
  }

  /** Starts a drag-move from the box body. */
  protected onBoxPointerDown(event: PointerEvent): void {
    const element = this.selected();
    if (event.button !== 0 || element === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const startFrame = element.frame;
    const pageMm = this.pageMm();
    this.runDrag(event, element.id, (dxMm, dyMm) => moveFrame(startFrame, dxMm, dyMm, pageMm));
  }

  /** Starts a resize from one of the eight handles. */
  protected onHandlePointerDown(event: PointerEvent, handle: ResizeHandle): void {
    const element = this.selected();
    if (event.button !== 0 || element === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const startFrame = element.frame;
    const pageMm = this.pageMm();
    this.runDrag(event, element.id, (dxMm, dyMm) =>
      resizeFrame(startFrame, handle, dxMm, dyMm, pageMm),
    );
  }

  /** Keyboard nudge / deselect when the box is focused (WCAG 2.2 keyboard path). */
  protected onKeyDown(event: KeyboardEvent): void {
    const element = this.selected();
    if (element === undefined) return;
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
    this.store.updateElement(element.id, {
      frame: nudgeFrame(element.frame, dxMm, dyMm, this.pageMm()),
    });
  }

  /** Inline position styles for the selection box. */
  protected boxStyle(): Record<string, string> {
    const box = this.box();
    if (box === null) return {};
    return {
      left: `${box.leftPx}px`,
      top: `${box.topPx}px`,
      width: `${box.widthPx}px`,
      height: `${box.heightPx}px`,
    };
  }

  /**
   * Runs a pointer drag: from pointerdown until pointerup, maps the total pointer
   * delta (screen px ÷ zoom → mm) through `compute` and commits the result live to
   * the store. Total-delta-from-start avoids accumulation drift; committing live
   * keeps the rendered element and overlay in lockstep (single source of truth).
   */
  private runDrag(
    event: PointerEvent,
    id: string,
    compute: (dxMm: number, dyMm: number) => Frame,
  ): void {
    const startX = event.clientX;
    const startY = event.clientY;
    const zoom = this.store.zoom();
    const onMove = (move: PointerEvent): void => {
      const dxMm = pxToMm((move.clientX - startX) / zoom);
      const dyMm = pxToMm((move.clientY - startY) / zoom);
      this.store.updateElement(id, { frame: compute(dxMm, dyMm) });
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
