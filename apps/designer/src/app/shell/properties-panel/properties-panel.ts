import { Component, ViewEncapsulation } from '@angular/core';

/**
 * Right-hand Properties panel (E5-S1). Shows the "select an element" empty
 * state; the per-element property sections (Layout, Text/Style, Data Binding,
 * Visibility) are wired up once selection and the store exist (Epics 5–6).
 */
@Component({
  selector: 'rdr-properties-panel',
  templateUrl: './properties-panel.html',
  styleUrl: './properties-panel.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-properties-panel' },
})
export class PropertiesPanel {}
