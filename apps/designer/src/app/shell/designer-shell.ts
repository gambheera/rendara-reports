import { Component, ViewEncapsulation, inject, signal, viewChild } from '@angular/core';
import { TopBar } from './top-bar/top-bar';
import { PalettePanel } from './palette-panel/palette-panel';
import { CanvasStage } from './canvas-stage/canvas-stage';
import { PropertiesPanel } from './properties-panel/properties-panel';
import { StatusBar } from './status-bar/status-bar';
import { PanelResizeHandle } from './panel-resize-handle';
import { PageSetupDialog } from '../page-setup/page-setup-dialog';
import { DesignerStore } from '../state/designer-store';

/** The arrange (z-order / grouping) commands reachable by keyboard (E5-S7). */
export type ArrangeCommand = 'group' | 'ungroup' | 'front' | 'forward' | 'backward' | 'back';

/**
 * Resolves a keydown to an arrange command, or `null` when it is not a shortcut.
 * Uses the Ctrl/⌘ modifier with the standard editor bindings: `⌘/Ctrl+G` group
 * (`+Shift` ungroup), `⌘/Ctrl+]` bring forward (`+Shift` to front) and `⌘/Ctrl+[`
 * send backward (`+Shift` to back). Bracket detection prefers the layout-independent
 * `code` and falls back to `key` (where Shift turns `]`/`[` into `}`/`{`).
 */
export function arrangeShortcut(event: {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly key: string;
  readonly code?: string;
}): ArrangeCommand | null {
  if (!(event.ctrlKey || event.metaKey)) return null;
  if (event.key.toLowerCase() === 'g') return event.shiftKey ? 'ungroup' : 'group';
  if (event.code === 'BracketRight' || event.key === ']' || event.key === '}') {
    return event.shiftKey ? 'front' : 'forward';
  }
  if (event.code === 'BracketLeft' || event.key === '[' || event.key === '{') {
    return event.shiftKey ? 'back' : 'backward';
  }
  return null;
}

/** The undo/redo + clipboard commands reachable by keyboard (E5-S9). */
export type EditCommand = 'undo' | 'redo' | 'copy' | 'cut' | 'paste' | 'duplicate' | 'delete';

/**
 * Resolves a keydown to an edit command (E5-S9), or `null` when it is not one.
 * Standard editor bindings on the Ctrl/⌘ modifier: `Z` undo (`+Shift` or `Ctrl+Y`
 * redo), `C`/`X`/`V` copy/cut/paste, `D` duplicate; plus bare `Delete`/`Backspace`
 * to delete the selection. Matching is case-insensitive via `key`.
 */
export function editShortcut(event: {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly key: string;
}): EditCommand | null {
  if (event.key === 'Delete' || event.key === 'Backspace') return 'delete';
  if (!(event.ctrlKey || event.metaKey)) return null;
  switch (event.key.toLowerCase()) {
    case 'z':
      return event.shiftKey ? 'redo' : 'undo';
    case 'y':
      return 'redo';
    case 'c':
      return 'copy';
    case 'x':
      return 'cut';
    case 'v':
      return 'paste';
    case 'd':
      return 'duplicate';
    default:
      return null;
  }
}

/** True when the event target is a text-entry control, so shortcuts should stand down. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

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
  imports: [
    TopBar,
    PalettePanel,
    CanvasStage,
    PropertiesPanel,
    StatusBar,
    PanelResizeHandle,
    PageSetupDialog,
  ],
  templateUrl: './designer-shell.html',
  styleUrl: './designer-shell.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-designer-shell', '(keydown)': 'onKeyDown($event)' },
})
export class DesignerShell {
  private readonly store = inject(DesignerStore);

  /** Width bounds (px) shared by both side panels. */
  protected readonly MIN_WIDTH = 200;
  protected readonly MAX_WIDTH = 420;

  /**
   * Workspace keyboard shortcuts for arranging elements (E5-S7): group/ungroup and
   * the four z-order operations. Ignored while typing in a text control so it never
   * eats an editing keystroke. The store methods are no-ops without a valid
   * selection, so an out-of-context shortcut harmlessly does nothing.
   */
  protected onKeyDown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return;
    const edit = editShortcut(event);
    if (edit !== null) {
      event.preventDefault();
      this.runEdit(edit);
      return;
    }
    const command = arrangeShortcut(event);
    if (command === null) return;
    event.preventDefault();
    switch (command) {
      case 'group':
        this.store.groupSelection();
        break;
      case 'ungroup':
        this.store.ungroupSelection();
        break;
      default:
        this.store.reorderSelection(command);
    }
  }

  /** Dispatches an {@link EditCommand} to the store (E5-S9). */
  private runEdit(command: EditCommand): void {
    switch (command) {
      case 'undo':
        this.store.undo();
        break;
      case 'redo':
        this.store.redo();
        break;
      case 'copy':
        this.store.copySelection();
        break;
      case 'cut':
        this.store.cutSelection();
        break;
      case 'paste':
        this.store.paste();
        break;
      case 'duplicate':
        this.store.duplicateSelection();
        break;
      case 'delete':
        this.store.removeSelection();
        break;
    }
  }

  private readonly pageSetup = viewChild.required(PageSetupDialog);
  private readonly canvas = viewChild.required(CanvasStage);

  /** Opens the Page setup dialog (triggered from the status bar). */
  protected openPageSetup(): void {
    this.pageSetup().open();
  }

  /** Fits the page width into the canvas (triggered from the status bar). */
  protected fitToView(): void {
    this.canvas().fitToView();
  }

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
