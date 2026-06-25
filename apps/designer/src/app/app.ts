import { Component } from '@angular/core';
import { DesignerShell } from './shell/designer-shell';

/**
 * Designer app root. It mounts the four-zone workspace shell (E5-S1); the
 * legal designer -> {schema, engine, renderer, ui-kit} dependencies (brief §4)
 * are exercised by the shell's child components as later stories wire them in.
 */
@Component({
  imports: [DesignerShell],
  selector: 'rdr-root',
  template: '<rdr-designer-shell />',
})
export class App {}
