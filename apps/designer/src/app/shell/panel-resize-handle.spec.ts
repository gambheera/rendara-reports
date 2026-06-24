import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/angular';
import { PanelResizeHandle } from './panel-resize-handle';

async function renderHandle(edge: 'start' | 'end', onResize = vi.fn()) {
  await render(
    `<div rdrPanelResize [edge]="edge" [value]="240" [min]="200" [max]="420"
          step="16" label="Resize panel" (resizeBy)="onResize($event)"></div>`,
    { imports: [PanelResizeHandle], componentProperties: { edge, onResize } },
  );
  return { handle: screen.getByRole('separator', { name: 'Resize panel' }), onResize };
}

describe('PanelResizeHandle', () => {
  it('exposes its width as an accessible separator', async () => {
    const { handle } = await renderHandle('start');

    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuenow')).toBe('240');
    expect(handle.getAttribute('aria-valuemin')).toBe('200');
    expect(handle.getAttribute('aria-valuemax')).toBe('420');
    expect(handle.getAttribute('tabindex')).toBe('0');
  });

  it('grows a start-edge panel on ArrowRight and shrinks it on ArrowLeft', async () => {
    const { handle, onResize } = await renderHandle('start');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(16);

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(-16);
  });

  it('flips the sign for an end-edge panel', async () => {
    const { handle, onResize } = await renderHandle('end');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(-16);
  });

  it('ignores non-arrow keys', async () => {
    const { handle, onResize } = await renderHandle('start');

    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('emits signed deltas while dragging, then stops after pointer release', async () => {
    const { handle, onResize } = await renderHandle('start');
    // jsdom omits the Pointer Capture API; stub it so the capture/release paths run.
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    handle.releasePointerCapture = vi.fn();

    // jsdom lacks PointerEvent; MouseEvent carries the clientX/button we read.
    fireEvent(handle, new MouseEvent('pointerdown', { button: 0, clientX: 100, bubbles: true }));
    fireEvent(handle, new MouseEvent('pointermove', { clientX: 130, bubbles: true }));
    expect(onResize).toHaveBeenLastCalledWith(30);

    // A zero-distance move is a no-op (no spurious emit).
    fireEvent(handle, new MouseEvent('pointermove', { clientX: 130, bubbles: true }));
    expect(onResize).toHaveBeenCalledTimes(1);

    fireEvent(handle, new MouseEvent('pointermove', { clientX: 120, bubbles: true }));
    expect(onResize).toHaveBeenLastCalledWith(-10);

    fireEvent(handle, new MouseEvent('pointerup', { bubbles: true }));
    expect(handle.releasePointerCapture).toHaveBeenCalled();

    onResize.mockClear();
    fireEvent(handle, new MouseEvent('pointermove', { clientX: 200, bubbles: true }));
    expect(onResize).not.toHaveBeenCalled();
  });

  it('ignores a stray pointer release when not dragging', async () => {
    const { handle, onResize } = await renderHandle('start');

    fireEvent(handle, new MouseEvent('pointerup', { bubbles: true }));
    expect(onResize).not.toHaveBeenCalled();
  });

  it('ignores a non-primary pointer button', async () => {
    const { handle, onResize } = await renderHandle('start');

    fireEvent(handle, new MouseEvent('pointerdown', { button: 2, clientX: 100, bubbles: true }));
    fireEvent(handle, new MouseEvent('pointermove', { clientX: 130, bubbles: true }));
    expect(onResize).not.toHaveBeenCalled();
  });
});
