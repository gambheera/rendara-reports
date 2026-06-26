/**
 * Live binding-value preview for the designer canvas (E6-S7). The canvas hosts the
 * **shared renderer**, which already paints a bound text/image element from a
 * `resolvedValues` map keyed by element id (E4-S2). This service produces that map
 * by resolving every bound element's expression against the imported **sample
 * data**, so a binding previews its resolved value the moment it is set — true to
 * what the viewer will show for the same template + data (brief §7, "one renderer,
 * two modes").
 *
 * Resolution goes through the engine's sandboxed {@link resolveElement} (JSONata +
 * the `Intl` formatting layer), so there is no `eval`/`new Function` here. It is
 * **async** (JSONata 2.x evaluation returns a Promise), so the result is delivered
 * through a signal updated by an {@link effect}: whenever the template or sample
 * data changes, the bound elements are re-resolved and {@link resolvedValues} is
 * replaced. A monotonically increasing token guards against out-of-order async
 * completions so a stale resolution never overwrites a newer one.
 *
 * Sample data is a designer-only aid held in view-state — this preview never
 * touches the template, the dirty flag or undo history. With no sample data
 * loaded the map is empty and bound elements render blank on the canvas (there is
 * nothing to resolve against), exactly as before this story.
 */

import { Injectable, effect, inject, signal } from '@angular/core';
import { resolveElement, type ResolveOptions } from '@rendara/report-engine';
import type { RendaraTemplate } from '@rendara/report-schema';
import { DesignerStore } from './designer-store';
import { isBindable, type BindableElement } from './binding-ops';
import { collectElements } from './template-ops';

/**
 * Resolves the display strings of every **bound** text/image element in
 * `template` against `data`, keyed by element id. Pure and total: it never throws,
 * and an element whose expression fails to evaluate maps to its fallback (or
 * blank) via the engine resolver. Elements with no binding are omitted — the
 * renderer uses their static value, so there is nothing to override.
 */
export async function resolveBoundValues(
  template: RendaraTemplate,
  data: unknown,
  options?: ResolveOptions,
): Promise<Map<string, string>> {
  const bound = collectElements(template).filter(
    (el): el is BindableElement => isBindable(el) && el.binding !== undefined,
  );
  const entries = await Promise.all(
    bound.map(async (el): Promise<[string, string]> => {
      const resolved = await resolveElement(el, data, options);
      return [el.id, resolved?.formatted ?? ''];
    }),
  );
  return new Map(entries);
}

/** Empty map shared as the no-sample-data resolved value, to avoid re-allocating. */
const EMPTY_VALUES: ReadonlyMap<string, string> = new Map();

@Injectable({ providedIn: 'root' })
export class BindingPreviewService {
  private readonly store = inject(DesignerStore);

  /** Increments per resolution pass; a completion for an older token is discarded. */
  private token = 0;

  private readonly values = signal<ReadonlyMap<string, string>>(EMPTY_VALUES);

  /**
   * Resolved binding display strings by element id, for the canvas's
   * `[resolvedValues]`. Empty until sample data is imported and the first async
   * resolution lands; updated on every template / sample-data change.
   */
  readonly resolvedValues = this.values.asReadonly();

  constructor() {
    effect(() => {
      const template = this.store.template();
      const sample = this.store.sampleData();
      const pass = ++this.token;

      if (sample === null) {
        this.values.set(EMPTY_VALUES);
        return;
      }

      void resolveBoundValues(template, sample.value, {
        locale: template.metadata.locale,
      }).then((map) => {
        // Discard if a newer pass started while this one was resolving.
        if (pass === this.token) {
          this.values.set(map);
        }
      });
    });
  }
}
