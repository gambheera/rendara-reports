import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { resolvePageDimensionsMm } from '@rendara/report-schema';
import { DesignerStore } from '../../state/designer-store';

/**
 * Center canvas stage (E5-S1). Provides the backdrop and a white "paper" surface
 * with the "Drag a control here to begin" empty state. The paper now resizes live
 * to the document's page geometry (E5-S3): its aspect ratio follows the resolved
 * page dimensions, so a change of size or orientation in the Page setup dialog is
 * reflected immediately. The WYSIWYG canvas proper — the shared renderer in design
 * mode, mm rulers, dotted grid and zoom — is E5-S4.
 */
@Component({
  selector: 'rdr-canvas-stage',
  templateUrl: './canvas-stage.html',
  styleUrl: './canvas-stage.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-canvas-stage' },
})
export class CanvasStage {
  private readonly store = inject(DesignerStore);

  /** The paper's CSS `aspect-ratio` (`w / h`) from the resolved page geometry. */
  protected readonly paperAspect = computed(() => {
    const page = this.store.page();
    const { widthMm, heightMm } = resolvePageDimensionsMm(page.size, page.orientation);
    return `${widthMm} / ${heightMm}`;
  });
}
