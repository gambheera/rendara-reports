import {
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CdkDropList, type CdkDragDrop, type CdkDragEnter } from '@angular/cdk/drag-drop';
import { ReportDocument } from '@rendara/report-renderer';
import { mmToPx, pxToMm } from '@rendara/report-engine';
import { DesignerStore } from '../../state/designer-store';
import { BindingPreviewService } from '../../state/binding-preview';
import { TablePreviewService } from '../../state/table-preview';
import { ElementCreator } from '../../state/element-creator';
import {
  CANVAS_DROP_LIST_ID,
  isFieldDragData,
  type FieldDragData,
  type PaletteKind,
} from '../../state/drag-create';
import { bindElementToPath } from '../../state/binding-ops';
import { elementsInMarquee, normalizeRectMm, topElementAtPointMm } from '../../state/frame-ops';
import { SelectionOverlay } from './selection-overlay';

/** A canvas drop's drag payload: a palette tile to create, or a field to bind. */
type CanvasDropData = PaletteKind | FieldDragData;

/** One ruler graduation: its offset (px, page-relative) and optional mm label. */
export interface RulerTick {
  readonly posPx: number;
  readonly label: string | null;
}

/** Major graduation interval, in mm. */
const TICK_STEP_MM = 10;

/** Below this gap (px) between majors, labels thin out to every fifth tick. */
const LABEL_MIN_GAP_PX = 28;

/**
 * Builds the major graduations for one ruler axis. `lengthMm`/`lengthPx` are the
 * page dimension along that axis (px already scaled for zoom), so positions land
 * exactly on the rendered sheet. The `0` mark is unlabelled (it sits in the
 * corner); labels thin to every fifth tick when zoomed out so they never crowd.
 */
export function buildRulerTicks(lengthMm: number, lengthPx: number): readonly RulerTick[] {
  if (lengthMm <= 0 || lengthPx <= 0) return [];
  const gapPx = (TICK_STEP_MM / lengthMm) * lengthPx;
  const labelEvery = gapPx >= LABEL_MIN_GAP_PX ? 1 : 5;
  const ticks: RulerTick[] = [];
  for (let mm = 0, i = 0; mm <= lengthMm + 0.001; mm += TICK_STEP_MM, i += 1) {
    const labelled = i > 0 && i % labelEvery === 0;
    ticks.push({ posPx: (mm / lengthMm) * lengthPx, label: labelled ? String(mm) : null });
  }
  return ticks;
}

/**
 * The zoom factor that fits the page width into the visible canvas. `chromePx`
 * is the non-page horizontal chrome (the vertical ruler + canvas padding). Falls
 * back to `1` when nothing is measurable; the store clamps the result.
 */
export function fitWidthZoom(
  viewportWidthPx: number,
  pageWidthPx: number,
  chromePx: number,
): number {
  const usable = viewportWidthPx - chromePx;
  if (pageWidthPx <= 0 || usable <= 0) return 1;
  return usable / pageWidthPx;
}

/**
 * Maps a viewport pointer position (e.g. a drop point) to a **page-absolute mm**
 * point on the rendered sheet (E5-S5). `sheetRect` is the sheet's on-screen box
 * (`getBoundingClientRect`), which already reflects the `transform: scale(zoom)`,
 * so dividing the offset from the sheet's top-left by `zoom` recovers natural px
 * before converting to mm. This is the inverse of how the engine lays an authored
 * frame onto the page, so a dropped element lands where the cursor was.
 */
export function clientPointToPageMm(
  clientX: number,
  clientY: number,
  sheetRect: { readonly left: number; readonly top: number },
  zoom: number,
): { xMm: number; yMm: number } {
  const naturalX = (clientX - sheetRect.left) / zoom;
  const naturalY = (clientY - sheetRect.top) / zoom;
  return { xMm: pxToMm(naturalX), yMm: pxToMm(naturalY) };
}

/**
 * Resolves the store element id a canvas pointer hit, or `null` for empty space
 * (E5-S6 click-select). Walks up from the event target to the nearest design-mode
 * hit target ({@link RdrDesignAttrs}'s `[data-rdr-hit]`) and reads its element /
 * table id — the ids the renderer stamps in design mode (`data-element-id` /
 * `data-table-id`). Kept pure so the click → selection mapping is unit-testable.
 */
export function hitElementId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const hit = target.closest<HTMLElement>('[data-rdr-hit]');
  if (hit === null) {
    return null;
  }
  return hit.getAttribute('data-element-id') ?? hit.getAttribute('data-table-id');
}

/** A scaled-px rectangle for painting the marquee, relative to the pages container. */
export interface MarqueeBoxPx {
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * The marquee rectangle (E5-S7) for two viewport points, expressed in px relative
 * to the `containerRect` (the pages area `getBoundingClientRect`) so it can be
 * absolutely positioned over the canvas. Normalised to a positive width/height
 * regardless of drag direction. Kept pure so the rubber-band geometry is testable.
 */
export function marqueeBoxPx(
  start: { readonly x: number; readonly y: number },
  current: { readonly x: number; readonly y: number },
  containerRect: { readonly left: number; readonly top: number },
): MarqueeBoxPx {
  return {
    leftPx: Math.min(start.x, current.x) - containerRect.left,
    topPx: Math.min(start.y, current.y) - containerRect.top,
    widthPx: Math.abs(start.x - current.x),
    heightPx: Math.abs(start.y - current.y),
  };
}

/** Extracts the viewport client point a CDK drop ended at, mouse or touch. */
function dropClientPoint(event: CdkDragDrop<unknown, unknown, CanvasDropData>): {
  x: number;
  y: number;
} {
  const native = event.event;
  if ('changedTouches' in native && native.changedTouches.length > 0) {
    const touch = native.changedTouches[0];
    return { x: touch.clientX, y: touch.clientY };
  }
  if ('clientX' in native) {
    return { x: native.clientX, y: native.clientY };
  }
  // Fallback to CDK's resolved drop point (also viewport-relative).
  return { x: event.dropPoint.x, y: event.dropPoint.y };
}

/**
 * Center canvas stage (E5-S4). Hosts the **shared renderer** in **design mode**
 * (`ReportDocument` from `@rendara/report-renderer`) so the canvas is true
 * WYSIWYG: the very component the viewer uses paints the document here. The
 * document is the store's derived {@link DesignerStore.paginatedDocument} and is
 * scaled by the store's zoom, framed by **mm rulers** (graduations aligned to the
 * rendered sheet via the engine geometry) and a **dotted grid** backdrop. The
 * empty-state ("Drag a control here to begin") shows until the first element is
 * added (E5-S5). Bound text/image values preview via {@link BindingPreviewService}
 * (E6-S7) and data tables via {@link TablePreviewService} (E6-S8) — both resolve
 * the imported sample data through the engine and feed the same rendered document.
 */
@Component({
  selector: 'rdr-canvas-stage',
  imports: [ReportDocument, CdkDropList, SelectionOverlay],
  templateUrl: './canvas-stage.html',
  styleUrl: './canvas-stage.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-canvas-stage' },
})
export class CanvasStage {
  protected readonly store = inject(DesignerStore);
  protected readonly preview = inject(BindingPreviewService);
  private readonly creator = inject(ElementCreator);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Id of this canvas drop list, the target the palette tiles connect to (E5-S5). */
  protected readonly canvasDropListId = CANVAS_DROP_LIST_ID;

  /** True while a field is dragged over the canvas, to paint the drop-target hint (E6-S7). */
  protected readonly bindTarget = signal(false);

  /** Inner ring (px) between the rulers and the page sheet. Mirrors the CSS `--pad`. */
  protected readonly pad = 24;
  /** Ruler thickness (px). Mirrors the CSS `--ruler`. */
  private readonly rulerSize = 24;

  private readonly scroll = viewChild.required<ElementRef<HTMLElement>>('scroll');

  /** The shared page geometry of the rendered document (sheet + printable area). */
  private readonly geometry = computed(() => this.store.paginatedDocument().geometry);

  /** The displayed page sheet box (natural px scaled by the current zoom). */
  protected readonly pageBox = computed(() => {
    const { pagePx } = this.geometry();
    const zoom = this.store.zoom();
    return { widthPx: pagePx.widthPx * zoom, heightPx: pagePx.heightPx * zoom };
  });

  /** Horizontal ruler graduations, aligned to the displayed sheet width. */
  protected readonly horizontalTicks = computed(() =>
    buildRulerTicks(this.geometry().pageMm.widthMm, this.pageBox().widthPx),
  );

  /** Vertical ruler graduations, aligned to the displayed sheet height. */
  protected readonly verticalTicks = computed(() =>
    buildRulerTicks(this.geometry().pageMm.heightMm, this.pageBox().heightPx),
  );

  /** Dotted-grid cell size (px): a 5 mm grid scaled by zoom, as a CSS length. */
  protected readonly gridSizePx = computed(() => `${mmToPx(5) * this.store.zoom()}px`);

  /** True while the document has no body elements — drives the empty placeholder. */
  protected readonly isEmpty = computed(() => this.store.bodyElements().length === 0);

  /** The live marquee rectangle (px, pages-relative) while rubber-band selecting, else `null`. */
  protected readonly marquee = signal<MarqueeBoxPx | null>(null);

  /** Drag distance (px) past which an empty-canvas press becomes a marquee, not a click. */
  private readonly marqueeThresholdPx = 3;

  constructor() {
    // Construct the table-preview service for its side effect: it resolves data
    // tables against the imported sample data into the store's pagination, so a
    // bound table previews its rows + totals on the canvas (E6-S8). The canvas
    // reads the result via the store's `paginatedDocument`, so it holds no handle.
    inject(TablePreviewService);
  }

  /**
   * Fits the page width into the visible canvas (one-shot, like a "Fit" button).
   * Reads the live scroll viewport and writes a concrete numeric zoom to the
   * store, so subsequent +/- steps continue from the fitted level.
   */
  fitToView(): void {
    const viewportWidthPx = this.scroll().nativeElement.clientWidth;
    const chromePx = this.rulerSize + this.pad * 2;
    this.store.setZoom(fitWidthZoom(viewportWidthPx, this.geometry().pagePx.widthPx, chromePx));
  }

  /**
   * Handles a drop on the canvas (E5-S5 palette create / E6-S7 drag-to-bind). The
   * drop point is mapped against the **first rendered sheet** (page-absolute mm is
   * page-1-relative, matching how frames are authored) at the current zoom. A
   * **palette tile** is handed to the {@link ElementCreator}, which centres the
   * default footprint there; a **field** drag binds the element under the drop
   * point. Drops within the same list (no transfer) are ignored.
   */
  protected onDrop(event: CdkDragDrop<unknown, unknown, CanvasDropData>): void {
    this.bindTarget.set(false);
    if (event.previousContainer === event.container) {
      return;
    }
    const sheet = this.host.nativeElement.querySelector<HTMLElement>('.rdr-page');
    if (sheet === null) {
      return;
    }
    const { x, y } = dropClientPoint(event);
    const atMm = clientPointToPageMm(x, y, sheet.getBoundingClientRect(), this.store.zoom());
    const data = event.item.data;
    if (isFieldDragData(data)) {
      this.bindFieldAt(data.bindPath, atMm);
      return;
    }
    this.creator.addAtPoint(data, atMm);
  }

  /**
   * Binds the element under `atMm` to the dropped field `path` (E6-S7 drag-to-bind):
   * the topmost text/image element at the point gets its `binding.expr` set to the
   * field path (preserving any existing format/fallback), selected, in one undo
   * step. A drop over empty canvas, a non-bindable element (shape/data table), or a
   * stale id is a safe no-op.
   */
  private bindFieldAt(path: string, atMm: { readonly xMm: number; readonly yMm: number }): void {
    const id = topElementAtPointMm(this.store.bodyElements(), atMm);
    if (id === null) {
      return;
    }
    const element = this.store.elementsById().get(id);
    if (element === undefined) {
      return;
    }
    const patch = bindElementToPath(element, path);
    if (patch === null) {
      return;
    }
    this.store.beginInteraction();
    this.store.updateElement(id, patch);
    this.store.endInteraction();
    this.store.selectOne(id);
  }

  /** Lights the drop-target hint when a **field** drag enters the canvas (E6-S7). */
  protected onListEntered(event: CdkDragEnter): void {
    if (isFieldDragData(event.item.data)) {
      this.bindTarget.set(true);
    }
  }

  /** Clears the drop-target hint when the drag leaves the canvas. */
  protected onListExited(): void {
    this.bindTarget.set(false);
  }

  /**
   * Click-select + multi-select (E5-S6 / E5-S7): a pointerdown on a rendered
   * element selects it — or **shift-toggles** it into/out of the selection; a press
   * on empty canvas starts a **marquee** (rubber-band) drag and, if it never moves,
   * collapses to a click that clears the selection (unless Shift is held). The
   * selection overlay's box/handles stop their own pointer events, so a
   * drag-move/resize never reaches here — only a genuine canvas press does. The
   * store sanitises ids, so a stale hit is a safe no-op.
   */
  protected onCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    const id = hitElementId(event.target);
    if (id !== null) {
      if (event.shiftKey) this.store.toggleSelection(id);
      else this.store.selectOne(id);
      return;
    }
    this.startMarquee(event);
  }

  /**
   * Runs a marquee selection from an empty-canvas press: paints the rubber-band
   * rectangle and, once the pointer travels past {@link marqueeThresholdPx}, selects
   * every element the rectangle intersects (live, additive to the prior selection
   * when Shift is held). A press that never moves is a plain click — it clears the
   * selection unless Shift is held. The marquee region is mapped to page-absolute mm
   * against the first sheet, the same space frames are authored in.
   */
  private startMarquee(event: PointerEvent): void {
    const sheet = this.host.nativeElement.querySelector<HTMLElement>('.rdr-page');
    const pages = event.currentTarget;
    if (sheet === null || !(pages instanceof HTMLElement)) {
      if (!event.shiftKey) this.store.clearSelection();
      return;
    }
    const sheetRect = sheet.getBoundingClientRect();
    const containerRect = pages.getBoundingClientRect();
    const zoom = this.store.zoom();
    const start = { x: event.clientX, y: event.clientY };
    const additive = event.shiftKey;
    const base = additive ? [...this.store.selectedIds()] : [];
    let moved = false;

    const onMove = (move: PointerEvent): void => {
      const current = { x: move.clientX, y: move.clientY };
      if (Math.abs(current.x - start.x) + Math.abs(current.y - start.y) > this.marqueeThresholdPx) {
        moved = true;
      }
      if (!moved) return;
      this.marquee.set(marqueeBoxPx(start, current, containerRect));
      const rect = normalizeRectMm(
        clientPointToPageMm(start.x, start.y, sheetRect, zoom),
        clientPointToPageMm(current.x, current.y, sheetRect, zoom),
      );
      const hits = elementsInMarquee(this.store.bodyElements(), rect);
      this.store.select([...base, ...hits]);
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      this.marquee.set(null);
      if (!moved && !additive) this.store.clearSelection();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
}
