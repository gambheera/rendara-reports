import { Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import type {
  FontWeight,
  Frame,
  LineStyle,
  ShapeElement,
  TextElement,
} from '@rendara/report-schema';
import { DesignerStore } from '../../state/designer-store';
import {
  DEFAULT_FILL_COLOR,
  effectiveFill,
  effectiveFont,
  effectiveStroke,
  patchFrameField,
  patchStrokeWidth,
  setShapeFill,
  setShapeStroke,
  setTextFont,
  type FrameField,
} from '../../state/element-props';

/** A curated set of font families offered in the Text section's family picker. */
const FONT_FAMILIES = [
  'Inter',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
] as const;

/** The line styles offered in the Shape section's stroke-style picker (mirrors {@link LineStyle}). */
const STROKE_STYLES: readonly LineStyle[] = ['solid', 'dashed', 'dotted', 'double', 'none'];

/** The collapsible Properties sections (Layout for any element, Text for text, Shape for shapes). */
type Section = 'layout' | 'text' | 'shape';

/**
 * Right-hand Properties panel (E5-S1 shell → wired in E6-S1). It is the
 * context-aware editor for the current selection:
 *
 *  - **nothing selected** → the "select an element" empty state;
 *  - **one element** → a generic **Layout** section (frame X/Y/W/H in mm) plus,
 *    for a text element, a **Text** section (literal content, font family, size,
 *    Reg/Bold weight), or for a shape, a **Shape** section (stroke style/width/colour
 *    and an optional interior fill — E6-S2; fill is hidden for a line);
 *  - **many selected** → a count note (multi-element editing is E6-S5).
 *
 * Edits flow straight through {@link DesignerStore.updateElement}, so the canvas —
 * which renders the same derived document — updates live, and the value reaches the
 * viewer identically (one shared renderer, brief §7). A continuous edit (typing in a
 * field, nudging a number) is wrapped in the store's gesture transaction
 * ({@link DesignerStore.beginInteraction}/{@link DesignerStore.endInteraction}) so it
 * coalesces into a single undo step (E5-S9) rather than one per keystroke.
 *
 * The per-field guards and the override→default font resolution live in the pure
 * `element-props` helpers; this component only binds them to the DOM. The full
 * dynamic per-type panel framework, style editors (colour/border/fill/padding) and
 * multi-select editing are E6-S5; data binding is E6-S6/S7.
 */
@Component({
  selector: 'rdr-properties-panel',
  templateUrl: './properties-panel.html',
  styleUrl: './properties-panel.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-properties-panel' },
})
export class PropertiesPanel {
  private readonly store = inject(DesignerStore);

  protected readonly fontFamilies = FONT_FAMILIES;
  protected readonly strokeStyles = STROKE_STYLES;

  /** The single selected element being edited, or `undefined` for none / multi. */
  protected readonly element = computed(() =>
    this.store.selectionCount() === 1 ? this.store.primarySelection() : undefined,
  );
  protected readonly selectionCount = this.store.selectionCount;

  /** True when exactly one text element is selected — gates the Text section. */
  protected readonly textElement = computed<TextElement | undefined>(() => {
    const el = this.element();
    return el?.type === 'text' ? el : undefined;
  });

  /** True when exactly one shape element is selected — gates the Shape section. */
  protected readonly shapeElement = computed<ShapeElement | undefined>(() => {
    const el = this.element();
    return el?.type === 'shape' ? el : undefined;
  });

  /** The selected element's frame (for the Layout inputs). */
  protected readonly frame = computed<Frame | undefined>(() => this.element()?.frame);

  /** The resolved stroke (override over renderer default) shown in the Shape inputs. */
  protected readonly stroke = computed(() => {
    const el = this.shapeElement();
    return el ? effectiveStroke(el.style) : undefined;
  });

  /** The shape's interior fill colour, or `null` for no fill. */
  protected readonly fill = computed<string | null>(() => {
    const el = this.shapeElement();
    return el ? effectiveFill(el.style) : null;
  });

  /** Whether the selected shape's interior is filled (drives the Fill None↔colour toggle). */
  protected readonly hasFill = computed(() => this.fill() !== null);

  /** A line shape has no fillable interior, so the Fill control is hidden for it. */
  protected readonly fillable = computed(() => this.shapeElement()?.shape !== 'line');

  /** The resolved font (override over document default) shown in the Text inputs. */
  protected readonly font = computed(() => {
    const el = this.textElement();
    return el ? effectiveFont(el, this.store.page().defaultFont) : undefined;
  });

  /** Font-family options, ensuring the document default family is always offered. */
  protected readonly familyOptions = computed<readonly string[]>(() => {
    const fallback = this.store.page().defaultFont.family;
    return FONT_FAMILIES.includes(fallback as (typeof FONT_FAMILIES)[number])
      ? FONT_FAMILIES
      : [fallback, ...FONT_FAMILIES];
  });

  /** Which sections are collapsed (all open by default). */
  private readonly collapsed = signal<Readonly<Record<Section, boolean>>>({
    layout: false,
    text: false,
    shape: false,
  });

  protected isOpen(section: Section): boolean {
    return !this.collapsed()[section];
  }

  protected toggleSection(section: Section): void {
    this.collapsed.update((state) => ({ ...state, [section]: !state[section] }));
  }

  /** Reads a numeric input's value (`NaN` when blank), for the Layout fields. */
  protected numberFrom(event: Event): number {
    return (event.target as HTMLInputElement).valueAsNumber;
  }

  /** Reads a text/select control's string value. */
  protected valueFrom(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  /**
   * Opens an undo transaction on a continuous-edit field gaining focus, so its
   * keystrokes (typing into the text box, scrubbing a number) coalesce into a
   * single undo step that {@link endEdit} commits on blur (E5-S9).
   */
  protected beginEdit(): void {
    this.store.beginInteraction();
  }

  /** Closes the undo transaction, committing the coalesced edit as one undo step. */
  protected endEdit(): void {
    this.store.endInteraction();
  }

  /** Sets one frame field on the selected element; an invalid value is ignored. */
  protected onFrame(field: FrameField, value: number): void {
    const el = this.element();
    if (!el) {
      return;
    }
    const frame = patchFrameField(el.frame, field, value);
    if (frame !== null) {
      this.store.updateElement(el.id, { frame });
    }
  }

  /** Sets the selected text element's literal content. */
  protected onText(text: string): void {
    const el = this.textElement();
    if (el) {
      this.store.updateElement(el.id, { text });
    }
  }

  /** Sets the text element's font size (pt); a blank/invalid value is ignored. Coalesced via focus/blur. */
  protected onSize(value: number): void {
    if (Number.isFinite(value) && value > 0) {
      this.applyFont({ sizePt: value });
    }
  }

  /** Sets the text element's font family override (a discrete edit → one undo step). */
  protected onFamily(family: string): void {
    this.commitFont({ family });
  }

  /** Sets the text element's weight to bold or normal — the Reg/Bold toggle (one undo step). */
  protected onWeight(weight: FontWeight): void {
    this.commitFont({ weight });
  }

  /** Merges a font patch into the selected text element's style, within the open transaction. */
  private applyFont(patch: Parameters<typeof setTextFont>[1]): void {
    const el = this.textElement();
    if (el) {
      this.store.updateElement(el.id, { style: setTextFont(el.style, patch) });
    }
  }

  /** A discrete font edit: its own self-contained undo step (no open field gesture). */
  private commitFont(patch: Parameters<typeof setTextFont>[1]): void {
    this.store.beginInteraction();
    this.applyFont(patch);
    this.store.endInteraction();
  }

  /** Sets the shape's stroke colour — a discrete edit → one undo step. */
  protected onStrokeColor(color: string): void {
    this.commitStroke({ color });
  }

  /** Sets the shape's stroke line style (solid/dashed/…/none) — one undo step. */
  protected onStrokeStyle(style: LineStyle): void {
    this.commitStroke({ style });
  }

  /** Sets the shape's stroke width (mm); a blank/invalid value is ignored. Coalesced via focus/blur. */
  protected onStrokeWidth(value: number): void {
    const widthMm = patchStrokeWidth(value);
    if (widthMm !== null) {
      this.applyStroke({ widthMm });
    }
  }

  /** Toggles the shape's interior fill on (a default colour) or off (no fill) — one undo step. */
  protected onFillToggle(enabled: boolean): void {
    this.commitFill(enabled ? DEFAULT_FILL_COLOR : undefined);
  }

  /** Sets the shape's interior fill colour — one undo step. */
  protected onFillColor(color: string): void {
    this.commitFill(color);
  }

  /** Merges a stroke patch into the selected shape's style, within the open transaction. */
  private applyStroke(patch: Parameters<typeof setShapeStroke>[1]): void {
    const el = this.shapeElement();
    if (el) {
      this.store.updateElement(el.id, { style: setShapeStroke(el.style, patch) });
    }
  }

  /** A discrete stroke edit: its own self-contained undo step (no open field gesture). */
  private commitStroke(patch: Parameters<typeof setShapeStroke>[1]): void {
    this.store.beginInteraction();
    this.applyStroke(patch);
    this.store.endInteraction();
  }

  /** Sets (or clears) the selected shape's fill as a single undo step. */
  private commitFill(fill: string | undefined): void {
    const el = this.shapeElement();
    if (!el) {
      return;
    }
    this.store.beginInteraction();
    this.store.updateElement(el.id, { style: setShapeFill(el.style, fill) });
    this.store.endInteraction();
  }
}
