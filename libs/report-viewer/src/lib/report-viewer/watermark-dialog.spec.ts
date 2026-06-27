import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/angular';
import type { Watermark } from '@rendara/report-engine';

import { WatermarkDialog, type WatermarkDialogResult } from './watermark-dialog';

/**
 * Component tests for the Watermark dialog (E8-S4). They assert the accessible
 * modal shell, the form controls (enable, type, text/image, opacity, angle,
 * color), the live preview, and that it emits the resolved {@link Watermark} (or
 * `null`) — the contract the {@link ReportViewer} feeds into the render pipeline.
 */

/** Queries a required element, failing the test if absent. */
function query<T extends Element>(container: HTMLElement, selector: string): T {
  const found = container.querySelector<T>(selector);
  if (found === null) {
    throw new Error(`expected element matching "${selector}"`);
  }
  return found;
}

/** Clicks the Apply button and returns the single emitted result. */
function apply(
  container: HTMLElement,
  applyWatermark: ReturnType<typeof vi.fn>,
): WatermarkDialogResult {
  fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-btn--primary'));
  expect(applyWatermark).toHaveBeenCalledTimes(1);
  return applyWatermark.mock.calls[0][0] as WatermarkDialogResult;
}

describe('WatermarkDialog (E8-S4)', () => {
  it('renders an accessible modal labelled by its title', async () => {
    const { container } = await render(WatermarkDialog);
    const dialog = query<HTMLElement>(container, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(container.querySelector(`#${titleId}`)?.textContent).toContain('Watermark');
  });

  it('seeds the form from an applied text watermark', async () => {
    const watermark: Watermark = {
      type: 'text',
      text: 'DRAFT',
      opacity: 0.25,
      angleDeg: -30,
      color: '#ff0000',
    };
    const { container } = await render(WatermarkDialog, { inputs: { watermark } });

    expect(query<HTMLButtonElement>(container, '.rdr-wm-toggle').getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(query<HTMLInputElement>(container, '#rdr-wm-text').value).toBe('DRAFT');
    expect(query<HTMLInputElement>(container, '#rdr-wm-opacity').value).toBe('25');
    expect(query<HTMLInputElement>(container, '#rdr-wm-angle').value).toBe('-30');
  });

  it('emits null when applied with the watermark disabled', async () => {
    const applyWatermark = vi.fn<(e: WatermarkDialogResult) => void>();
    const { container } = await render(WatermarkDialog, { on: { applyWatermark } });
    // No watermark input → starts disabled.
    expect(apply(container, applyWatermark).watermark).toBeNull();
  });

  it('emits the resolved text watermark from the form', async () => {
    const applyWatermark = vi.fn<(e: WatermarkDialogResult) => void>();
    const { container } = await render(WatermarkDialog, { on: { applyWatermark } });

    // Enable, then set the caption, opacity and angle.
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-toggle'));
    fireEvent.input(query<HTMLInputElement>(container, '#rdr-wm-text'), {
      target: { value: 'CONFIDENTIAL' },
    });
    fireEvent.input(query<HTMLInputElement>(container, '#rdr-wm-opacity'), {
      target: { value: '20' },
    });
    fireEvent.input(query<HTMLInputElement>(container, '#rdr-wm-angle'), {
      target: { value: '-45' },
    });

    expect(apply(container, applyWatermark).watermark).toEqual({
      type: 'text',
      text: 'CONFIDENTIAL',
      opacity: 0.2,
      angleDeg: -45,
      color: '#9ca3af',
    });
  });

  it('switches to an image watermark, swapping the text field for an image URL', async () => {
    const applyWatermark = vi.fn<(e: WatermarkDialogResult) => void>();
    const { container } = await render(WatermarkDialog, { on: { applyWatermark } });

    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-toggle'));
    // Switch to the Image type (the second segmented button).
    const segs = container.querySelectorAll<HTMLButtonElement>('.rdr-wm-seg');
    fireEvent.click(segs[1]);

    // The text field is gone; the image URL field is present.
    expect(container.querySelector('#rdr-wm-text')).toBeNull();
    fireEvent.input(query<HTMLInputElement>(container, '#rdr-wm-src'), {
      target: { value: 'https://example.com/logo.png' },
    });

    expect(apply(container, applyWatermark).watermark).toEqual({
      type: 'image',
      src: 'https://example.com/logo.png',
      opacity: 0.15,
      angleDeg: -45,
    });
  });

  it('shows a live preview caption reflecting the text, enabled only when on', async () => {
    const { container } = await render(WatermarkDialog);
    // Disabled → no preview mark.
    expect(container.querySelector('.rdr-wm-preview-mark')).toBeNull();

    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-toggle'));
    fireEvent.input(query<HTMLInputElement>(container, '#rdr-wm-text'), {
      target: { value: 'SAMPLE' },
    });
    expect(query<HTMLElement>(container, '.rdr-wm-preview-text').textContent).toContain('SAMPLE');
  });

  it('disables the controls until the watermark is enabled', async () => {
    const { container } = await render(WatermarkDialog);
    expect(query<HTMLInputElement>(container, '#rdr-wm-text').disabled).toBe(true);
    expect(query<HTMLInputElement>(container, '#rdr-wm-opacity').disabled).toBe(true);

    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-toggle'));
    expect(query<HTMLInputElement>(container, '#rdr-wm-text').disabled).toBe(false);
    expect(query<HTMLInputElement>(container, '#rdr-wm-opacity').disabled).toBe(false);
  });

  it('dismisses via the Cancel button, the backdrop, and Escape', async () => {
    const dismiss = vi.fn<() => void>();
    const { container } = await render(WatermarkDialog, { on: { dismiss } });

    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-wm-btn:not(.rdr-wm-btn--primary)'));
    fireEvent.click(query<HTMLElement>(container, '.rdr-wm-backdrop'));
    fireEvent.keyDown(query<HTMLElement>(container, '[role="dialog"]'), { key: 'Escape' });

    expect(dismiss).toHaveBeenCalledTimes(3);
  });
});
