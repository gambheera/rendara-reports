import { Component, ViewEncapsulation, computed, inject, signal, viewChild } from '@angular/core';
import type { ElementRef } from '@angular/core';
import { CdkDropList } from '@angular/cdk/drag-drop';
import { DesignerStore } from '../../state/designer-store';
import { CANVAS_DROP_LIST_ID } from '../../state/drag-create';
import { filterFieldTree, parseSampleData } from '../../state/sample-data';
import { FieldTreeNode } from './field-tree-node';

/**
 * Reads a `File` as UTF-8 text via {@link FileReader} — the broadly-supported
 * path (and the one the jsdom test environment implements). Rejects when the
 * read fails so the caller can show a clear error.
 */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsText(file);
  });
}

/**
 * The left palette's **Data** tab (E6-S6): imports a sample Data JSON file and
 * shows its bindable fields as a searchable field tree. The introspected tree
 * (scalars / objects / arrays) is the foundation drag-to-bind (E6-S7) and table
 * sources (E6-S8) build on; this story covers import, display and filtering only.
 *
 * Import is parsed by the pure {@link parseSampleData} (JSON + engine
 * introspection): invalid JSON is caught and surfaced as an inline error
 * (`role="alert"`) rather than crashing (story QA). The parsed document lives in
 * the store as view-state — it never touches the template or the dirty flag.
 */
@Component({
  selector: 'rdr-data-panel',
  imports: [FieldTreeNode, CdkDropList],
  templateUrl: './data-panel.html',
  styleUrl: './data-panel.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-data-panel' },
})
export class DataPanel {
  protected readonly store = inject(DesignerStore);

  /** Id of the canvas drop list field rows connect to for drag-to-bind (E6-S7). */
  protected readonly canvasDropListId = CANVAS_DROP_LIST_ID;

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  /** The "Filter fields" query; narrows the tree to matches plus their ancestors. */
  protected readonly query = signal('');

  /** Inline error from the last failed import, or `null`. Cleared on success. */
  protected readonly importError = signal<string | null>(null);

  /**
   * The field tree to render: the imported root filtered by {@link query}. `null`
   * when nothing is imported or the filter matches nothing.
   */
  protected readonly filteredRoot = computed(() => {
    const data = this.store.sampleData();
    if (data === null) return null;
    return filterFieldTree(data.root, this.query());
  });

  /** True when data is loaded but the current filter excludes every field. */
  protected readonly noMatches = computed(
    () => this.store.hasSampleData() && this.query().trim() !== '' && this.filteredRoot() === null,
  );

  /** Opens the OS file picker (Import / Replace). */
  protected openPicker(): void {
    this.fileInput().nativeElement.click();
  }

  /**
   * Reads the chosen file, parses + introspects it, and either loads it into the
   * store or shows an inline error. The input is reset so re-selecting the same
   * file fires `change` again.
   */
  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      this.importError.set("That file couldn't be read.");
      return;
    }

    const result = parseSampleData(text, file.name);
    if (!result.ok) {
      this.importError.set(result.error);
      return;
    }
    this.importError.set(null);
    this.query.set('');
    this.store.setSampleData(result.data);
  }

  /** Removes the imported sample data and any filter/error. */
  protected clear(): void {
    this.store.clearSampleData();
    this.query.set('');
    this.importError.set(null);
  }
}
