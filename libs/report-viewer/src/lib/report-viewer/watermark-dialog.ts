import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import type { Watermark } from '@rendara/report-engine';

/** Which kind of watermark the user is configuring. */
export type WatermarkType = 'text' | 'image';

/**
 * The user's choice when they apply the watermark dialog (E8-S4): the resolved
 * {@link Watermark} config to stamp on every page, or `null` to remove it (the
 * "enable" toggle off). The {@link ReportViewer} feeds this into the render
 * pipeline, so it flows through to the screen pages, the print mirror and the PDF
 * export alike.
 */
export interface WatermarkDialogResult {
  /** The watermark to apply, or `null` to clear it. */
  readonly watermark: Watermark | null;
}

/** Default text colour shown in the dialog (slate-400), mirroring the renderer default. */
const DEFAULT_WATERMARK_COLOR = '#9ca3af';
/** Default caption when none is supplied yet. */
const DEFAULT_WATERMARK_TEXT = 'CONFIDENTIAL';
/** Default diagonal angle (the classic watermark slant). */
const DEFAULT_WATERMARK_ANGLE = -45;
/** Default opacity (15%). */
const DEFAULT_WATERMARK_OPACITY = 0.15;

/**
 * The viewer's **Watermark** dialog (E8-S4), matching the
 * `report_viewer_export_watermark_dialogs` Watermark tab (reconciled per brief
 * §12.3): an **Enable** toggle · **Type** (Text / Image) · the Text caption or
 * Image URL · a row of **Opacity** (slider) · **Angle** · **Color** · a live
 * **Preview** tile · Cancel / Apply.
 *
 * Per the reconciliation note in the PR it is a **standalone** dialog opened from
 * the toolbar's own Watermark button — consistent with the standalone Export
 * dialog (E8-S3) and the separate toolbar buttons (E8-S1) — rather than a tab
 * inside the export dialog as Stitch drew it.
 *
 * It is a **controlled, presentational** dialog: it owns only its form state and
 * emits the resolved {@link WatermarkDialogResult} through {@link applyWatermark}
 * (or {@link dismiss}); the {@link ReportViewer} feeds the result into the render
 * pipeline. It is accessible — `role="dialog"`, `aria-modal`, a CDK focus trap
 * with initial focus, Escape to cancel and a backdrop click to dismiss — and
 * styled with the viewer's own scoped `--rdr-viewer-*` tokens so it never leaks
 * into or inherits from the host.
 */
@Component({
  selector: 'rdr-watermark-dialog',
  imports: [A11yModule],
  templateUrl: './watermark-dialog.html',
  styleUrl: './watermark-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatermarkDialog {
  /** The watermark currently applied (seeds the form), or `null` for none. */
  readonly watermark = input<Watermark | null>(null);

  /** Emitted with the resolved watermark (or `null`) when the user applies. */
  readonly applyWatermark = output<WatermarkDialogResult>();

  /** Emitted when the user dismisses the dialog (button, backdrop, or Escape). */
  readonly dismiss = output<void>();

  protected readonly enabled = signal(false);
  protected readonly type = signal<WatermarkType>('text');
  protected readonly text = signal(DEFAULT_WATERMARK_TEXT);
  protected readonly src = signal('');
  /** Opacity as a whole percent (0–100), the slider's natural unit. */
  protected readonly opacityPercent = signal(Math.round(DEFAULT_WATERMARK_OPACITY * 100));
  protected readonly angleDeg = signal(DEFAULT_WATERMARK_ANGLE);
  protected readonly color = signal(DEFAULT_WATERMARK_COLOR);

  /** A stable id for the `aria-labelledby` association. */
  protected readonly titleId = 'rdr-watermark-dialog-title';

  /** The preview caption: the trimmed text, or a placeholder when empty. */
  protected readonly previewText = computed(() => this.text().trim() || DEFAULT_WATERMARK_TEXT);

  /** The opacity layer style for the live preview tile (mirrors the renderer). */
  protected readonly previewOpacity = computed(() => this.opacityPercent() / 100);

  /** The rotation transform for the live preview caption/image. */
  protected readonly previewTransform = computed(() => `rotate(${this.angleDeg()}deg)`);

  constructor() {
    // Seed the form from the applied watermark whenever it changes (the dialog is
    // created fresh per open, so this primarily applies the initial values).
    effect(() => {
      const current = this.watermark();
      if (current === null) {
        this.enabled.set(false);
        return;
      }
      this.enabled.set(true);
      this.type.set(current.type);
      if (current.type === 'text') {
        this.text.set(current.text ?? DEFAULT_WATERMARK_TEXT);
      } else {
        this.src.set(current.src ?? '');
      }
      this.opacityPercent.set(Math.round(clamp01(current.opacity) * 100));
      this.angleDeg.set(current.angleDeg);
      this.color.set(current.color ?? DEFAULT_WATERMARK_COLOR);
    });
  }

  protected setType(type: WatermarkType): void {
    this.type.set(type);
  }

  protected toggleEnabled(): void {
    this.enabled.update((on) => !on);
  }

  protected onTextInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
  }

  protected onSrcInput(event: Event): void {
    this.src.set((event.target as HTMLInputElement).value);
  }

  protected onOpacityInput(event: Event): void {
    this.opacityPercent.set(Number((event.target as HTMLInputElement).value));
  }

  protected onAngleInput(event: Event): void {
    this.angleDeg.set(Number((event.target as HTMLInputElement).value));
  }

  protected onColorInput(event: Event): void {
    this.color.set((event.target as HTMLInputElement).value);
  }

  /**
   * Applies the watermark, emitting the resolved {@link WatermarkDialogResult}.
   * When the enable toggle is off the result is `null` (clears the watermark);
   * otherwise it builds a {@link Watermark} from the form for the active type.
   */
  protected onApply(): void {
    this.applyWatermark.emit({ watermark: this.buildWatermark() });
  }

  protected onCancel(): void {
    this.dismiss.emit();
  }

  /** Escape anywhere in the dialog cancels it. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
    }
  }

  /** Builds the {@link Watermark} from the current form, or `null` when disabled. */
  private buildWatermark(): Watermark | null {
    if (!this.enabled()) {
      return null;
    }
    const opacity = clamp01(this.opacityPercent() / 100);
    if (this.type() === 'image') {
      return {
        type: 'image',
        src: this.src().trim(),
        opacity,
        angleDeg: this.angleDeg(),
      };
    }
    return {
      type: 'text',
      text: this.text().trim() || DEFAULT_WATERMARK_TEXT,
      opacity,
      angleDeg: this.angleDeg(),
      color: this.color(),
    };
  }
}

/** Clamps a value into `[0, 1]`; a non-finite value falls back to fully opaque. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}
