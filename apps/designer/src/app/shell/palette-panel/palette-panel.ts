import { Component, ViewEncapsulation, signal } from '@angular/core';

/** Left-panel tabs, canonical per brief §12.3.3. */
export type PaletteTab = 'insert' | 'layers' | 'data';

interface PaletteItem {
  readonly label: string;
  /** Decorative glyph; real icons arrive with the icon set. */
  readonly glyph: string;
}

/**
 * Left palette panel (E5-S1). Hosts the accessible Insert / Layers / Data
 * tablist. In this story the tabs are wired but their bodies are placeholders:
 * Insert lists the v1 palette (brief §12.3.4) as static, non-draggable items —
 * drag-to-create is E5-S5 — while Layers and Data show empty states.
 */
@Component({
  selector: 'rdr-palette-panel',
  templateUrl: './palette-panel.html',
  styleUrl: './palette-panel.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-palette-panel' },
})
export class PalettePanel {
  protected readonly activeTab = signal<PaletteTab>('insert');

  protected readonly tabs: readonly { id: PaletteTab; label: string }[] = [
    { id: 'insert', label: 'Insert' },
    { id: 'layers', label: 'Layers' },
    { id: 'data', label: 'Data' },
  ];

  /** v1 palette only — Text, Image, Line, Rectangle, Ellipse, Data Table. */
  protected readonly basicItems: readonly PaletteItem[] = [
    { label: 'Text', glyph: 'T' },
    { label: 'Image', glyph: '\u{1F5BC}' },
    { label: 'Line', glyph: '—' },
    { label: 'Rectangle', glyph: '▭' },
    { label: 'Ellipse', glyph: '○' },
  ];
  protected readonly dataItems: readonly PaletteItem[] = [{ label: 'Data Table', glyph: '☷' }];

  protected select(tab: PaletteTab): void {
    this.activeTab.set(tab);
  }
}
