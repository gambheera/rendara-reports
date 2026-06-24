import {
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { ReportDocument } from '@rendara/report-renderer';
import { mmToPx } from '@rendara/report-engine';
import { DesignerStore } from '../../state/designer-store';

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
 * Center canvas stage (E5-S4). Hosts the **shared renderer** in **design mode**
 * (`ReportDocument` from `@rendara/report-renderer`) so the canvas is true
 * WYSIWYG: the very component the viewer uses paints the document here. The
 * document is the store's derived {@link DesignerStore.paginatedDocument} and is
 * scaled by the store's zoom, framed by **mm rulers** (graduations aligned to the
 * rendered sheet via the engine geometry) and a **dotted grid** backdrop. The
 * empty-state ("Drag a control here to begin") shows until the first element is
 * added (E5-S5). Data binding / table resolution is E6.
 */
@Component({
  selector: 'rdr-canvas-stage',
  imports: [ReportDocument],
  templateUrl: './canvas-stage.html',
  styleUrl: './canvas-stage.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-canvas-stage' },
})
export class CanvasStage {
  protected readonly store = inject(DesignerStore);

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
}
