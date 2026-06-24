import { Component, ViewEncapsulation } from '@angular/core';

/**
 * Bottom status bar (E5-S1): zoom controls, page geometry summary
 * (`A4 · Portrait · mm`), page counter and a keyboard-shortcuts hint. Values are
 * static placeholders here; zoom wiring is E5-S4 and geometry binds to the page
 * model in E5-S3.
 */
@Component({
  selector: 'rdr-status-bar',
  templateUrl: './status-bar.html',
  styleUrl: './status-bar.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { role: 'contentinfo', class: 'rdr-status-bar' },
})
export class StatusBar {
  protected readonly zoom = '100%';
  protected readonly pageSummary = 'A4 · Portrait · mm';
  protected readonly pageCounter = 'Page 1 of 1';
}
