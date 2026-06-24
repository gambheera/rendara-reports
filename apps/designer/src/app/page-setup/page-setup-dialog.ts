import {
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  DEFAULT_FONT,
  isNamedPageSize,
  resolvePageDimensionsMm,
  validatePageSettings,
  type AuthoringUnit,
  type MarginsMm,
  type Page,
  type PageOrientation,
  type PageSettingsError,
  type PageSize,
} from '@rendara/report-schema';
import { MM_PER_INCH, mmToPt, ptToMm } from '@rendara/report-engine';
import { Button } from '@rendara/ui-kit';
import { DesignerStore } from '../state/designer-store';

/** The paper choices the dialog offers: the named sizes plus an explicit custom. */
type SizeKind = 'A4' | 'Letter' | 'custom';

/** The four margin sides, in the canonical T/R/B/L order shown in the UI. */
const MARGIN_SIDES = ['top', 'right', 'bottom', 'left'] as const;
type MarginSide = (typeof MARGIN_SIDES)[number];

/** Display precision (decimal places) when showing a mm value in each unit. */
const UNIT_DECIMALS: Readonly<Record<AuthoringUnit, number>> = { mm: 1, pt: 1, in: 3 };

/** Converts a canonical millimetre value into the dialog's active authoring unit. */
function mmToUnit(mm: number, unit: AuthoringUnit): number {
  switch (unit) {
    case 'mm':
      return mm;
    case 'pt':
      return mmToPt(mm);
    case 'in':
      return mm / MM_PER_INCH;
  }
}

/** Converts a value in the active authoring unit back to canonical millimetres. */
function unitToMm(value: number, unit: AuthoringUnit): number {
  switch (unit) {
    case 'mm':
      return value;
    case 'pt':
      return ptToMm(value);
    case 'in':
      return value * MM_PER_INCH;
  }
}

/** Rounds to the unit's display precision, dropping float noise (e.g. 20.0 → 20). */
function roundForUnit(value: number, unit: AuthoringUnit): number {
  return Number(value.toFixed(UNIT_DECIMALS[unit]));
}

/**
 * Page setup dialog (E5-S3). A modal, schema-bound editor for the document's
 * page model — paper size, orientation, margins, authoring units and default
 * font size — with a live scaled preview. Rendered as a native `<dialog>`
 * (`showModal()`), so focus trapping, the top layer and `Escape`-to-cancel come
 * from the platform; no UI-kit/CDK dependency is needed (brief hard rules).
 *
 * The dialog edits a private working copy seeded from {@link DesignerStore} when
 * {@link open} is called, and only commits — via `store.setPage()` — when the
 * author presses **Apply** and the candidate page passes `validatePageSettings`.
 * Cancel/`Escape`/backdrop dismiss without mutating the document. Millimetres are
 * the canonical store of record: margins are held in mm and merely *displayed* in
 * the active unit, so switching units never drifts the underlying geometry.
 */
@Component({
  selector: 'rdr-page-setup-dialog',
  imports: [Button],
  templateUrl: './page-setup-dialog.html',
  styleUrl: './page-setup-dialog.css',
  encapsulation: ViewEncapsulation.Emulated,
})
export class PageSetupDialog {
  private readonly store = inject(DesignerStore);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly sizeKind = signal<SizeKind>('A4');
  protected readonly customWidthMm = signal(210);
  protected readonly customHeightMm = signal(297);
  protected readonly orientation = signal<PageOrientation>('portrait');
  protected readonly unit = signal<AuthoringUnit>('mm');
  protected readonly linked = signal(true);
  protected readonly fontFamily = signal(DEFAULT_FONT.family);
  protected readonly fontSizePt = signal(DEFAULT_FONT.sizePt);

  /** Canonical margins in mm — the source of truth Apply commits. */
  protected readonly marginsMm = signal<MarginsMm>({ top: 20, right: 15, bottom: 20, left: 15 });
  /** Margins as shown in the active unit — what the inputs bind to while editing. */
  protected readonly marginDisplay = signal<Record<MarginSide, number>>({
    top: 20,
    right: 15,
    bottom: 20,
    left: 15,
  });

  /** Validation problems from the most recent Apply attempt; empty when valid. */
  protected readonly errors = signal<readonly PageSettingsError[]>([]);

  /** Background carried through untouched so Apply round-trips the page model. */
  private seededBackground: unknown | null = null;

  protected readonly sides = MARGIN_SIDES;

  /** The candidate page size (named or custom) from the current working state. */
  private readonly candidateSize = computed<PageSize>(() => {
    const kind = this.sizeKind();
    return kind === 'custom'
      ? { widthMm: this.customWidthMm(), heightMm: this.customHeightMm() }
      : kind;
  });

  /** Resolved page dimensions (honouring orientation) for the preview + caption. */
  protected readonly dimensionsMm = computed(() =>
    resolvePageDimensionsMm(this.candidateSize(), this.orientation()),
  );

  /** Caption under the preview, e.g. `210 × 297 mm`. */
  protected readonly dimensionsCaption = computed(() => {
    const { widthMm, heightMm } = this.dimensionsMm();
    return `${roundForUnit(widthMm, 'mm')} × ${roundForUnit(heightMm, 'mm')} mm`;
  });

  /** Pixel size of the preview page, scaled to fit a fixed bounding box while
   *  preserving the page's aspect ratio (so landscape and portrait both fit). */
  protected readonly previewSize = computed(() => {
    const { widthMm, heightMm } = this.dimensionsMm();
    const maxW = 168;
    const maxH = 220;
    const scale = Math.min(maxW / widthMm, maxH / heightMm);
    return { width: widthMm * scale, height: heightMm * scale };
  });

  /** Margin inset percentages for the dashed content box in the preview. */
  protected readonly previewInset = computed(() => {
    const { widthMm, heightMm } = this.dimensionsMm();
    const m = this.marginsMm();
    const pct = (value: number, total: number) =>
      total > 0 ? `${Math.max(0, Math.min(100, (value / total) * 100))}%` : '0%';
    return {
      top: pct(m.top, heightMm),
      right: pct(m.right, widthMm),
      bottom: pct(m.bottom, heightMm),
      left: pct(m.left, widthMm),
    };
  });

  /** Suffix shown beside the font-size input — the font is always points. */
  protected readonly fontUnitLabel = 'pt';

  /** Seeds the working copy from the current document and opens the modal. */
  open(): void {
    const page = this.store.page();
    if (isNamedPageSize(page.size)) {
      this.sizeKind.set(page.size);
      const portrait = resolvePageDimensionsMm(page.size, 'portrait');
      this.customWidthMm.set(portrait.widthMm);
      this.customHeightMm.set(portrait.heightMm);
    } else {
      this.sizeKind.set('custom');
      this.customWidthMm.set(page.size.widthMm);
      this.customHeightMm.set(page.size.heightMm);
    }
    this.orientation.set(page.orientation);
    this.unit.set(page.units);
    this.marginsMm.set({ ...page.marginsMm });
    this.syncDisplayFromMm(page.units);
    this.fontFamily.set(page.defaultFont.family);
    this.fontSizePt.set(page.defaultFont.sizePt);
    this.seededBackground = page.background ?? null;
    this.errors.set([]);
    this.linked.set(true);
    this.dialogRef().nativeElement.showModal();
  }

  /** Closes the modal without committing (Cancel / `Escape` / backdrop). */
  protected close(): void {
    this.dialogRef().nativeElement.close();
  }

  protected setSizeKind(value: string): void {
    this.sizeKind.set(value as SizeKind);
  }

  protected setOrientation(orientation: PageOrientation): void {
    this.orientation.set(orientation);
  }

  protected toggleLinked(): void {
    this.linked.update((linked) => !linked);
  }

  /** Switches the authoring unit, re-deriving the displayed margins from mm. */
  protected setUnit(unit: AuthoringUnit): void {
    this.unit.set(unit);
    this.syncDisplayFromMm(unit);
  }

  /** Reads a number from an input event, or `NaN` when the field is blank. */
  protected numberFrom(event: Event): number {
    return (event.target as HTMLInputElement).valueAsNumber;
  }

  /** Updates a margin (and its linked siblings) from a value in the active unit. */
  protected onMarginInput(side: MarginSide, value: number): void {
    if (Number.isNaN(value)) return;
    const unit = this.unit();
    const mm = unitToMm(value, unit);
    if (this.linked()) {
      this.marginsMm.set({ top: mm, right: mm, bottom: mm, left: mm });
      this.marginDisplay.set({ top: value, right: value, bottom: value, left: value });
    } else {
      this.marginsMm.update((current) => ({ ...current, [side]: mm }));
      this.marginDisplay.update((current) => ({ ...current, [side]: value }));
    }
  }

  protected onCustomWidth(value: number): void {
    if (!Number.isNaN(value)) this.customWidthMm.set(value);
  }

  protected onCustomHeight(value: number): void {
    if (!Number.isNaN(value)) this.customHeightMm.set(value);
  }

  protected onFontSize(value: number): void {
    if (!Number.isNaN(value)) this.fontSizePt.set(value);
  }

  /** Validates the candidate page and, when valid, commits it and closes. */
  protected apply(): void {
    const page: Page = {
      size: this.candidateSize(),
      orientation: this.orientation(),
      marginsMm: this.marginsMm(),
      units: this.unit(),
      defaultFont: { family: this.fontFamily(), sizePt: this.fontSizePt() },
      background: this.seededBackground,
    };
    const problems = validatePageSettings(page);
    if (problems.length > 0) {
      this.errors.set(problems);
      return;
    }
    this.errors.set([]);
    this.store.setPage(page);
    this.close();
  }

  /** Recomputes the displayed margins from canonical mm in the given unit. */
  private syncDisplayFromMm(unit: AuthoringUnit): void {
    const mm = this.marginsMm();
    this.marginDisplay.set({
      top: roundForUnit(mmToUnit(mm.top, unit), unit),
      right: roundForUnit(mmToUnit(mm.right, unit), unit),
      bottom: roundForUnit(mmToUnit(mm.bottom, unit), unit),
      left: roundForUnit(mmToUnit(mm.left, unit), unit),
    });
  }
}
