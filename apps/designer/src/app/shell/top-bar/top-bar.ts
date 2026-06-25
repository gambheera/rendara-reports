import { Component, ViewEncapsulation } from '@angular/core';
import { Button } from '@rendara/ui-kit';

/**
 * Designer top bar (E5-S1) — the canonical chrome from brief §12.3.2: Rendara
 * wordmark · editable doc name + pencil · `Saved` status · `Import data` ·
 * `Preview` · `Export ▾` · overflow. Actions are inert placeholders in this
 * story; document state (name, dirty flag, real actions) arrives with the store
 * and later epics.
 */
@Component({
  selector: 'rdr-top-bar',
  imports: [Button],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { role: 'banner', class: 'rdr-top-bar' },
})
export class TopBar {
  /** Placeholder document name until the store lands (E5-S2). */
  protected readonly documentName = 'Untitled invoice';
}
