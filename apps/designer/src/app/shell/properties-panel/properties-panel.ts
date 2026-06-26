import { Component, ViewEncapsulation, computed, effect, inject, signal } from '@angular/core';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import type {
  ColumnAlign,
  DataTableColumn,
  DataTableElement,
  ElementBinding,
  FontWeight,
  Frame,
  ImageElement,
  ImageFit,
  LineStyle,
  ShapeElement,
  TextElement,
} from '@rendara/report-schema';
import { IMAGE_FITS } from '@rendara/report-schema';
import { sanitizeImageUrl } from '@rendara/report-renderer';
import { DesignerStore } from '../../state/designer-store';
import { BindingPreviewService } from '../../state/binding-preview';
import {
  FORMAT_OPTIONS,
  buildBinding,
  collectFieldPaths,
  expressionError,
  isBindable,
  type BindableElement,
} from '../../state/binding-ops';
import {
  DEFAULT_FILL_COLOR,
  effectiveFill,
  effectiveFont,
  effectiveImageFit,
  effectiveStroke,
  imageUploadError,
  patchFrameField,
  patchStrokeWidth,
  setShapeFill,
  setShapeStroke,
  setTextFont,
  type FrameField,
} from '../../state/element-props';
import {
  addTableColumn,
  addTableGroup,
  moveTableColumn,
  removeTableColumn,
  removeTableGroup,
  setTableColumnAlign,
  setTableColumnHeader,
  setTableColumnWidth,
  setTableGroupBy,
} from '../../state/table-ops';

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

/** The column alignments offered in the Table section's Align segmented control. */
const COLUMN_ALIGNS: readonly ColumnAlign[] = ['left', 'center', 'right'];

/** The collapsible Properties sections (one per element kind, plus generic Layout / Data Binding). */
type Section = 'layout' | 'text' | 'shape' | 'image' | 'table' | 'binding';

/**
 * Right-hand Properties panel (E5-S1 shell → wired in E6-S1). It is the
 * context-aware editor for the current selection:
 *
 *  - **nothing selected** → the "select an element" empty state;
 *  - **one element** → a generic **Layout** section (frame X/Y/W/H in mm) plus,
 *    for a text element, a **Text** section (literal content, font family, size,
 *    Reg/Bold weight); for a shape, a **Shape** section (stroke style/width/colour
 *    and an optional interior fill — E6-S2; fill is hidden for a line); or for an
 *    image, an **Image** section (source URL or upload + fit mode — E6-S3, with the
 *    same {@link sanitizeImageUrl} safety check the renderer applies); or for a data
 *    table, a **Table** section (E6-S4 — reorderable columns with add/remove, a
 *    Selected-Column editor for header text / width / align, header & layout options,
 *    and grouping bands);
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
 * `element-props`/`table-ops` helpers; this component only binds them to the DOM.
 * The full dynamic per-type panel framework, style editors (colour/border/fill/
 * padding) and multi-select editing are E6-S5; data binding — the table's array
 * source, column cell expressions and footer aggregates — is E6-S6/S7/S8.
 */
@Component({
  selector: 'rdr-properties-panel',
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './properties-panel.html',
  styleUrl: './properties-panel.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-properties-panel' },
})
export class PropertiesPanel {
  private readonly store = inject(DesignerStore);
  private readonly previewSvc = inject(BindingPreviewService);

  protected readonly fontFamilies = FONT_FAMILIES;
  protected readonly strokeStyles = STROKE_STYLES;
  protected readonly imageFits = IMAGE_FITS;
  protected readonly columnAligns = COLUMN_ALIGNS;
  protected readonly formatOptions = FORMAT_OPTIONS;

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

  /** True when exactly one image element is selected — gates the Image section. */
  protected readonly imageElement = computed<ImageElement | undefined>(() => {
    const el = this.element();
    return el?.type === 'image' ? el : undefined;
  });

  /** True when exactly one data-table element is selected — gates the Table section. */
  protected readonly tableElement = computed<DataTableElement | undefined>(() => {
    const el = this.element();
    return el?.type === 'dataTable' ? el : undefined;
  });

  // --- Data binding (E6-S7) -------------------------------------------------

  /** The selected element when it is bindable (text or image) — gates the Data Binding section. */
  protected readonly bindable = computed<BindableElement | undefined>(() => {
    const el = this.element();
    return el && isBindable(el) ? el : undefined;
  });

  /** The bindable element's current binding, or `undefined` when it is static. */
  protected readonly binding = computed<ElementBinding | undefined>(() => this.bindable()?.binding);

  /** The binding's expression text (empty when static), shown in the `FX` input. */
  protected readonly bindingExpr = computed(() => this.binding()?.expr ?? '');

  /** The binding's format token, or `''` for "None" (the Format picker's value). */
  protected readonly bindingFormat = computed<string>(() => this.binding()?.format ?? '');

  /** The binding's fallback literal, or `''` when none. */
  protected readonly bindingFallback = computed(() => this.binding()?.fallback ?? '');

  /** The element's `visibleWhen` condition, or `''` when always visible. */
  protected readonly visibleWhen = computed(() => this.bindable()?.visibleWhen ?? '');

  /** The bindable JSONata paths from the imported sample data, for `FX` autocomplete. */
  protected readonly fieldPaths = computed<readonly string[]>(() => {
    const data = this.store.sampleData();
    return data ? collectFieldPaths(data.root) : [];
  });

  /** Inline compile error for the current expression, or `null` when blank / valid. */
  protected readonly bindingError = computed(() => expressionError(this.bindingExpr()));

  /** True when the expression is non-empty and compiles cleanly — the green "valid" state. */
  protected readonly bindingValid = computed(
    () => this.bindingExpr().trim() !== '' && this.bindingError() === null,
  );

  /** True when sample data is loaded, so a resolved-value preview is available. */
  protected readonly hasSampleData = this.store.hasSampleData;

  /**
   * The resolved display value of the selected element's binding against the
   * imported sample data, or `null` when the element is static or no sample data is
   * loaded. Sourced from the shared {@link BindingPreviewService} — the same map the
   * canvas paints from, so the panel preview and the canvas never diverge.
   */
  protected readonly bindingPreview = computed<string | null>(() => {
    const el = this.bindable();
    if (!el || el.binding === undefined) {
      return null;
    }
    return this.previewSvc.resolvedValues().get(el.id) ?? '';
  });

  /** The columns of the selected table (empty when no table is selected). */
  protected readonly columns = computed<readonly DataTableColumn[]>(
    () => this.tableElement()?.columns ?? [],
  );

  /** The grouping bands of the selected table (empty when none / no table). */
  protected readonly groups = computed(() => this.tableElement()?.groups ?? []);

  /** Key of the column shown in the Selected-Column editor; resolved against live columns. */
  private readonly selectedColumnKey = signal<string | null>(null);

  /**
   * The column being edited: the {@link selectedColumnKey} match, falling back to
   * the first column so the editor always targets a real column (a stale key after
   * a remove/reorder resolves to the first). `undefined` only when no table.
   */
  protected readonly selectedColumn = computed<DataTableColumn | undefined>(() => {
    const el = this.tableElement();
    if (!el) {
      return undefined;
    }
    const key = this.selectedColumnKey();
    return el.columns.find((column) => column.key === key) ?? el.columns[0];
  });

  /** The image element's current static source (URL or data URI), or '' when none/bound. */
  protected readonly imageSrc = computed<string>(() => this.imageElement()?.src ?? '');

  /** The resolved fit mode shown in (and selected by) the Image section's picker. */
  protected readonly imageFit = computed<ImageFit | undefined>(() => {
    const el = this.imageElement();
    return el ? effectiveImageFit(el) : undefined;
  });

  /**
   * An inline error for the Image source field — set when a typed URL is blocked by
   * {@link sanitizeImageUrl} (a dangerous scheme) or an upload fails the type/size
   * guard. Cleared on the next successful edit or when the selection changes.
   */
  protected readonly imageError = signal<string | null>(null);

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
    image: false,
    table: false,
    binding: false,
  });

  constructor() {
    // Clear any stale source error when the edited image changes (or selection
    // moves off an image), so an error from one element never lingers on another.
    let lastId: string | undefined;
    effect(() => {
      const id = this.imageElement()?.id;
      if (id !== lastId) {
        lastId = id;
        this.imageError.set(null);
      }
    });
  }

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

  /**
   * Applies a typed source URL to the selected image, **after** the shared
   * {@link sanitizeImageUrl} safety check (the same decision the renderer makes, so
   * a source the designer accepts is one the viewer will actually paint). A blocked
   * URL (e.g. `javascript:`) sets the inline {@link imageError} and is *not* written
   * to the model; a blank value clears the source. Coalesced via focus/blur into one
   * undo step (matches the Text content field).
   */
  protected onImageUrl(url: string): void {
    const el = this.imageElement();
    if (!el) {
      return;
    }
    const trimmed = url.trim();
    if (trimmed.length === 0) {
      this.imageError.set(null);
      this.store.updateElement(el.id, { src: '' });
      return;
    }
    const safe = sanitizeImageUrl(trimmed);
    if (safe === null) {
      this.imageError.set('That URL was blocked for security. Use an http(s) or image data URL.');
      return;
    }
    this.imageError.set(null);
    this.store.updateElement(el.id, { src: safe });
  }

  /** Sets the selected image's fit mode (contain/cover/fill/none/scale-down) — one undo step. */
  protected onImageFit(fit: ImageFit): void {
    const el = this.imageElement();
    if (!el) {
      return;
    }
    this.store.beginInteraction();
    this.store.updateElement(el.id, { fit });
    this.store.endInteraction();
  }

  /**
   * Handles a file chosen via the Upload control: guards the type/size
   * ({@link imageUploadError}), then reads the file into a base64 `data:` URI and
   * sets it as the image source in a single undo step. The data URI passes
   * {@link sanitizeImageUrl} (it is an `image/*` data URI), so no further check is
   * needed. The `<input>` is reset so re-choosing the same file fires again.
   */
  protected onImageUpload(event: Event): void {
    const el = this.imageElement();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!el || !file) {
      return;
    }
    const error = imageUploadError(file);
    if (error !== null) {
      this.imageError.set(error);
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        this.imageError.set(null);
        this.store.beginInteraction();
        this.store.updateElement(el.id, { src: result });
        this.store.endInteraction();
      }
    };
    reader.onerror = () => this.imageError.set('Could not read that file.');
    reader.readAsDataURL(file);
    input.value = '';
  }

  // --- Data table structure (E6-S4) ---------------------------------------

  /** Selects a column for the Selected-Column editor (click on a Columns-list row). */
  protected selectColumn(key: string): void {
    this.selectedColumnKey.set(key);
  }

  /** Appends a new column to the selected table and focuses it in the editor (one undo step). */
  protected onAddColumn(): void {
    const el = this.tableElement();
    if (!el) {
      return;
    }
    const { columns, key } = addTableColumn(el);
    this.commitTable(el.id, { columns });
    this.selectedColumnKey.set(key);
  }

  /** Removes a column (and any group aggregate under it); inert on the last column. */
  protected onRemoveColumn(key: string): void {
    const el = this.tableElement();
    if (!el) {
      return;
    }
    const patch = removeTableColumn(el, key);
    if (patch !== null) {
      this.commitTable(el.id, patch);
    }
  }

  /** Reorders columns after a drag-drop in the Columns list (one undo step). */
  protected onColumnDrop(event: CdkDragDrop<readonly DataTableColumn[]>): void {
    const el = this.tableElement();
    if (!el) {
      return;
    }
    const columns = moveTableColumn(el, event.previousIndex, event.currentIndex);
    if (columns !== null) {
      this.commitTable(el.id, { columns });
    }
  }

  /** Sets the selected column's header label. Coalesced via focus/blur into one undo step. */
  protected onColumnHeader(key: string, header: string): void {
    const el = this.tableElement();
    if (el) {
      this.store.updateElement(el.id, { columns: setTableColumnHeader(el, key, header) });
    }
  }

  /** Sets the selected column's width (mm); a blank/invalid value is ignored. Coalesced via focus/blur. */
  protected onColumnWidth(key: string, widthMm: number): void {
    const el = this.tableElement();
    if (!el) {
      return;
    }
    const columns = setTableColumnWidth(el, key, widthMm);
    if (columns !== null) {
      this.store.updateElement(el.id, { columns });
    }
  }

  /** Sets the selected column's alignment — a discrete edit → one undo step. */
  protected onColumnAlign(key: string, align: ColumnAlign): void {
    const el = this.tableElement();
    if (el) {
      this.commitTable(el.id, { columns: setTableColumnAlign(el, key, align) });
    }
  }

  /** Toggles "repeat header on each page" — one undo step. */
  protected onRepeatHeader(repeatHeaderOnEachPage: boolean): void {
    const el = this.tableElement();
    if (el) {
      this.commitTable(el.id, { repeatHeaderOnEachPage });
    }
  }

  /** Toggles "keep table together" — one undo step. */
  protected onKeepTogether(keepTogether: boolean): void {
    const el = this.tableElement();
    if (el) {
      this.commitTable(el.id, { keepTogether });
    }
  }

  /** Appends a grouping band to the selected table — one undo step. */
  protected onAddGroup(): void {
    const el = this.tableElement();
    if (el) {
      this.commitTable(el.id, { groups: addTableGroup(el) });
    }
  }

  /** Removes the grouping band at `index` (omitting `groups` when it empties) — one undo step. */
  protected onRemoveGroup(index: number): void {
    const el = this.tableElement();
    if (!el) {
      return;
    }
    const groups = removeTableGroup(el, index);
    if (groups !== null) {
      this.commitTable(el.id, { groups });
    }
  }

  /** Sets a grouping band's `groupBy` expression. Coalesced via focus/blur into one undo step. */
  protected onGroupBy(index: number, groupBy: string): void {
    const el = this.tableElement();
    if (!el) {
      return;
    }
    const groups = setTableGroupBy(el, index, groupBy);
    if (groups !== null) {
      this.store.updateElement(el.id, { groups });
    }
  }

  // --- Data binding (E6-S7) -------------------------------------------------

  /**
   * Rebuilds the selected element's binding from the three editor inputs and applies
   * it (E6-S7). An empty expression **clears** the binding (`buildBinding` → `null`),
   * reverting the element to its static value. Edits go straight through
   * `updateElement`, so the canvas and the resolved-value preview update live.
   */
  private commitBinding(expr: string, format: string | null, fallback: string | null): void {
    const el = this.bindable();
    if (!el) {
      return;
    }
    const binding = buildBinding(expr, format, fallback);
    this.store.updateElement(el.id, { binding: binding ?? undefined });
  }

  /** Sets the binding expression (`FX` field). Coalesced via focus/blur into one undo step. */
  protected onBindingExpr(expr: string): void {
    this.commitBinding(expr, this.binding()?.format ?? null, this.binding()?.fallback ?? null);
  }

  /** Sets the binding's format token (Format picker; `''` = None) — a discrete undo step. */
  protected onBindingFormat(value: string): void {
    this.store.beginInteraction();
    this.commitBinding(
      this.bindingExpr(),
      value === '' ? null : value,
      this.binding()?.fallback ?? null,
    );
    this.store.endInteraction();
  }

  /** Sets the binding's fallback literal. Coalesced via focus/blur into one undo step. */
  protected onBindingFallback(fallback: string): void {
    this.commitBinding(this.bindingExpr(), this.binding()?.format ?? null, fallback);
  }

  /**
   * Sets the element's `visibleWhen` condition (E6-S7): a blank value means "always
   * visible" (`null`), a non-empty value is the JSONata boolean expression. Coalesced
   * via focus/blur. Applies to the bindable element being edited.
   */
  protected onVisibleWhen(expr: string): void {
    const el = this.bindable();
    if (!el) {
      return;
    }
    this.store.updateElement(el.id, { visibleWhen: expr.trim() === '' ? null : expr });
  }

  /** Clears the binding, reverting the element to its static value — one undo step. */
  protected clearBinding(): void {
    const el = this.bindable();
    if (!el) {
      return;
    }
    this.store.beginInteraction();
    this.store.updateElement(el.id, { binding: undefined });
    this.store.endInteraction();
  }

  /** Reads a checkbox/toggle's checked state. */
  protected checkedFrom(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** A discrete table-structure edit: its own self-contained undo step. */
  private commitTable(id: string, changes: Partial<DataTableElement>): void {
    this.store.beginInteraction();
    this.store.updateElement(id, changes);
    this.store.endInteraction();
  }
}
