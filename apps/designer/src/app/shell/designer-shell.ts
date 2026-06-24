import { Component, ViewEncapsulation, signal } from '@angular/core';
import { TopBar } from './top-bar/top-bar';
import { PalettePanel } from './palette-panel/palette-panel';
import { CanvasStage } from './canvas-stage/canvas-stage';
import { PropertiesPanel } from './properties-panel/properties-panel';
import { StatusBar } from './status-bar/status-bar';
import { PanelResizeHandle } from './panel-resize-handle';

/**
 * Designer workspace shell (E5-S1): the responsive four-zone layout — top bar,
 * left palette, center canvas and right properties — plus the bottom status bar,
 * matching brief §12.2/§12.3. Side panels are resizable (drag or keyboard via
 * {@link PanelResizeHandle}) and collapsible to a rail. Panel geometry lives in
 * local signals here; the document model itself moves to the store in E5-S2.
 *
 * Landmarks: the top bar is `banner`, each side panel an `aside`/complementary
 * with a distinct label, the canvas the single `main`, and the status bar
 * `contentinfo` — so the shell is navigable by assistive tech (WCAG 2.2 AA).
 */
@Component({
  selector: 'rdr-designer-shell',
  imports: [TopBar, PalettePanel, CanvasStage, PropertiesPanel, StatusBar, PanelResizeHandle],
  templateUrl: './designer-shell.html',
  styleUrl: './designer-shell.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-designer-shell' },
})
export class DesignerShell {
  /** Width bounds (px) shared by both side panels. */
  protected readonly MIN_WIDTH = 200;
  protected readonly MAX_WIDTH = 420;

  protected readonly leftWidth = signal(264);
  protected readonly rightWidth = signal(288);
  protected readonly leftCollapsed = signal(false);
  protected readonly rightCollapsed = signal(false);

  protected toggleLeft(): void {
    this.leftCollapsed.update((c) => !c);
  }

  protected toggleRight(): void {
    this.rightCollapsed.update((c) => !c);
  }

  protected resizeLeft(delta: number): void {
    this.leftWidth.update((w) => this.clamp(w + delta));
  }

  protected resizeRight(delta: number): void {
    this.rightWidth.update((w) => this.clamp(w + delta));
  }

  private clamp(width: number): number {
    return Math.min(this.MAX_WIDTH, Math.max(this.MIN_WIDTH, width));
  }
}
