import { Component, inject } from '@angular/core';
import { DesignerShell } from './shell/designer-shell';
import { PreviewMode } from './preview/preview-mode';
import { DesignerStore } from './state/designer-store';

/**
 * Designer app root. It mounts the four-zone workspace shell (E5-S1), or the
 * live {@link PreviewMode} render (E6-S9) when the store's preview flag is set —
 * preview replaces the whole editing chrome (no side panels), per brief §12.2.
 * The legal designer -> {schema, engine, renderer, ui-kit} dependencies (brief §4)
 * are exercised by the shell's child components as later stories wire them in.
 */
@Component({
  imports: [DesignerShell, PreviewMode],
  selector: 'rdr-root',
  template: `
    @if (store.previewMode()) {
      <rdr-preview-mode />
    } @else {
      <rdr-designer-shell />
    }
  `,
})
export class App {
  protected readonly store = inject(DesignerStore);
}
