/**
 * Live data-table preview for the designer canvas (E6-S8). A data table renders
 * from the engine's **resolved** rows + aggregates: `paginate` lays out whatever
 * {@link ResolvedDataTable} it is handed per table id, and the shared renderer
 * paints those slices (E3/E4). This service produces that resolved map by running
 * every data table's source / column / footer / group bindings against the
 * imported **sample data**, so binding a table previews its repeated rows and
 * correct totals the moment they are set — true to what the viewer will show for
 * the same template + data (brief §7, "one renderer, two modes").
 *
 * Resolution goes through the engine's sandboxed {@link resolveDataTable} (JSONata
 * + the `Intl` formatting layer), so there is no `eval`/`new Function` here. It is
 * **async** (JSONata 2.x evaluation returns a Promise), so the result is delivered
 * by pushing the resolved map into the store ({@link DesignerStore.setResolvedTables}),
 * whose `paginatedDocument` merges it over the header-only structural placeholder.
 * A monotonically increasing token guards against out-of-order async completions
 * so a stale resolution never overwrites a newer one.
 *
 * Sample data is a designer-only aid held in view-state — this preview never
 * touches the template, the dirty flag or undo history. With no sample data
 * loaded the map is empty and tables fall back to the header-only preview (E6-S4),
 * exactly as before this story.
 */

import { Injectable, effect, inject } from '@angular/core';
import { resolveDataTable, type ResolveOptions, type ResolvedDataTable } from '@rendara/report-engine';
import type { RendaraTemplate } from '@rendara/report-schema';
import { DesignerStore } from './designer-store';
import { collectElements } from './template-ops';

/**
 * Resolves every data-table element in `template` against `data`, keyed by element
 * id. Pure and total: each table goes through the engine resolver, which never
 * throws (errors surface as fallbacks + diagnostics on the resolved table). A
 * template with no data tables yields an empty map.
 */
export async function resolveTables(
  template: RendaraTemplate,
  data: unknown,
  options?: ResolveOptions,
): Promise<ReadonlyMap<string, ResolvedDataTable>> {
  const tables = collectElements(template).filter((el) => el.type === 'dataTable');
  const entries = await Promise.all(
    tables.map(async (el): Promise<[string, ResolvedDataTable]> => [
      el.id,
      await resolveDataTable(el, data, options),
    ]),
  );
  return new Map(entries);
}

/** Empty map shared as the no-sample-data resolved value, to avoid re-allocating. */
const EMPTY_TABLES: ReadonlyMap<string, ResolvedDataTable> = new Map();

@Injectable({ providedIn: 'root' })
export class TablePreviewService {
  private readonly store = inject(DesignerStore);

  /** Increments per resolution pass; a completion for an older token is discarded. */
  private token = 0;

  constructor() {
    effect(() => {
      const template = this.store.template();
      const sample = this.store.sampleData();
      const pass = ++this.token;

      if (sample === null) {
        this.store.setResolvedTables(EMPTY_TABLES);
        return;
      }

      void resolveTables(template, sample.value, {
        locale: template.metadata.locale,
      }).then((map) => {
        // Discard if a newer pass started while this one was resolving.
        if (pass === this.token) {
          this.store.setResolvedTables(map);
        }
      });
    });
  }
}
