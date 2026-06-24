import { Directive, effect, ElementRef, inject, input, Renderer2 } from '@angular/core';

import type { AttrMap } from './page-view-model';

/**
 * Applies a design-mode selection-anchor attribute map to its host element
 * (E4-S6). The shared renderer paints the **same** geometry/content in view and
 * design mode; in design mode each element box / data-table additionally carries
 * the `data-rdr-*` hit-target attributes from {@link designAnchorAttrs}. This
 * directive is the bridge that puts that pure attribute map onto the live DOM, so
 * the attribute *names* live in exactly one place ({@link designAnchorAttrs}) and
 * the component DOM can never drift from the headless serializer.
 *
 * Binding `[rdrDesignAttrs]="null"` (view mode) removes any previously-applied
 * anchor attributes, so toggling a single rendered element between design and view
 * leaves no residue — and view mode is anchor-free, keeping the viewer DOM
 * byte-stable (the story's QA).
 */
@Directive({
  selector: '[rdrDesignAttrs]',
})
export class RdrDesignAttrs {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  /** The anchor attributes to apply, or `null`/`undefined` to apply none (view mode). */
  readonly attrs = input<AttrMap | null | undefined>(null, { alias: 'rdrDesignAttrs' });

  /** Attribute names applied on the previous run, so stale ones can be removed. */
  private applied: readonly string[] = [];

  constructor() {
    effect(() => {
      const next = this.attrs() ?? {};
      const host = this.el.nativeElement;
      // Remove attributes that were set last run but are absent now.
      for (const name of this.applied) {
        if (!(name in next)) {
          this.renderer.removeAttribute(host, name);
        }
      }
      for (const [name, value] of Object.entries(next)) {
        this.renderer.setAttribute(host, name, value);
      }
      this.applied = Object.keys(next);
    });
  }
}
