import { Component, ViewEncapsulation } from '@angular/core';

/**
 * Center canvas stage (E5-S1). Provides the backdrop and a white A4 "paper"
 * surface with the "Drag a control here to begin" empty state. The WYSIWYG
 * canvas proper — the shared renderer in design mode, mm rulers, dotted grid and
 * zoom — is E5-S4; this story only stands up the zone.
 */
@Component({
  selector: 'rdr-canvas-stage',
  templateUrl: './canvas-stage.html',
  styleUrl: './canvas-stage.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-canvas-stage' },
})
export class CanvasStage {}
