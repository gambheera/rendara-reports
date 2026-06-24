import { Directive, output, input, HostListener, ElementRef, inject } from '@angular/core';

/** Which side of the handle the resizable panel sits on. */
export type PanelEdge = 'start' | 'end';

/**
 * Accessible resize handle for the designer's side panels (E5-S1). It is a
 * `role="separator"` element that turns horizontal pointer drags — and keyboard
 * arrow presses — into a width delta (positive = grow the panel) emitted on
 * `resizeBy`, leaving the {@link DesignerShell} to clamp and apply it to the
 * panel's width signal.
 *
 * No CDK resize primitive exists, so this stays within the "Angular CDK + scoped
 * CSS only" rule with a tiny pointer-events implementation. Keyboard operability
 * (Arrow keys, with `aria-valuemin/now/max`) is first-class for WCAG 2.2 AA.
 */
@Directive({
  selector: '[rdrPanelResize]',
  host: {
    role: 'separator',
    'aria-orientation': 'vertical',
    tabindex: '0',
    '[attr.aria-valuenow]': 'Math.round(value())',
    '[attr.aria-valuemin]': 'min()',
    '[attr.aria-valuemax]': 'max()',
    '[attr.aria-label]': 'label()',
    '[class.rdr-resize-handle--dragging]': 'dragging',
  },
})
export class PanelResizeHandle {
  private readonly el = inject(ElementRef<HTMLElement>);

  /** Side the panel occupies; flips the sign so `resizeBy` is always "grow". */
  readonly edge = input<PanelEdge>('start');
  /** Pixels moved per arrow-key press. */
  readonly step = input(16);
  /** Current panel width — surfaced on the separator for assistive tech. */
  readonly value = input(0);
  /** Width bounds, surfaced as `aria-valuemin`/`aria-valuemax`. */
  readonly min = input(0);
  readonly max = input(0);
  readonly label = input('Resize panel');

  /** Positive grows the adjacent panel, negative shrinks it. */
  readonly resizeBy = output<number>();

  protected dragging = false;
  protected readonly Math = Math;
  private startX = 0;

  private sign(): number {
    return this.edge() === 'start' ? 1 : -1;
  }

  @HostListener('pointerdown', ['$event'])
  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.dragging = true;
    this.startX = event.clientX;
    (this.el.nativeElement as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  @HostListener('pointermove', ['$event'])
  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    const dx = event.clientX - this.startX;
    if (dx === 0) return;
    this.startX = event.clientX;
    this.resizeBy.emit(dx * this.sign());
  }

  @HostListener('pointerup', ['$event'])
  @HostListener('pointercancel', ['$event'])
  protected onPointerUp(event: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    const el = this.el.nativeElement as HTMLElement;
    if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture?.(event.pointerId);
  }

  @HostListener('keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    const dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (dir === 0) return;
    event.preventDefault();
    this.resizeBy.emit(dir * this.step() * this.sign());
  }
}
