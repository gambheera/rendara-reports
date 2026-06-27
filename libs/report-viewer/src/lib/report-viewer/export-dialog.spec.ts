import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/angular';

import { ExportDialog, type ExportDialogResult } from './export-dialog';

/**
 * Component tests for the Export PDF dialog (E8-S3). They assert the accessible
 * modal shell, the form controls (filename, page scope, range, watermark toggle),
 * and that it emits the user's choices (or a cancel) — the contract the
 * {@link ReportViewer} resolves into a {@link PdfExportRequest}.
 */

/** Queries a required element, failing the test if absent. */
function query<T extends Element>(container: HTMLElement, selector: string): T {
  const found = container.querySelector<T>(selector);
  if (found === null) {
    throw new Error(`expected element matching "${selector}"`);
  }
  return found;
}

describe('ExportDialog (E8-S3)', () => {
  it('renders an accessible modal labelled by its title, pre-filling the filename', async () => {
    const { container } = await render(ExportDialog, {
      inputs: { defaultFilename: 'invoice-acme.pdf', totalPages: 5, currentPage: 2 },
    });

    const dialog = query<HTMLElement>(container, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(container.querySelector(`#${titleId}`)?.textContent).toContain('Export PDF');
    expect(query<HTMLInputElement>(container, '#rdr-export-filename').value).toBe(
      'invoice-acme.pdf',
    );
  });

  it('shows the current page on the Current scope chip', async () => {
    const { container } = await render(ExportDialog, {
      inputs: { totalPages: 9, currentPage: 4 },
    });
    expect(container.textContent).toContain('Current (4)');
  });

  it('reveals range inputs only when the Range scope is chosen', async () => {
    const { container } = await render(ExportDialog, { inputs: { totalPages: 8 } });
    expect(container.querySelector('#rdr-export-from')).toBeNull();

    fireEvent.click(
      query<HTMLButtonElement>(container, 'button[aria-pressed][class*="seg"]:last-of-type'),
    );
    expect(container.querySelector('#rdr-export-from')).toBeTruthy();
    // The range "to" defaults to the last page.
    expect(query<HTMLInputElement>(container, '#rdr-export-to').value).toBe('8');
  });

  it('emits the chosen filename, scope and watermark flag on Export', async () => {
    const confirmExport = vi.fn<(e: ExportDialogResult) => void>();
    const { container } = await render(ExportDialog, {
      inputs: { defaultFilename: 'r.pdf', totalPages: 3, currentPage: 2, hasWatermark: true },
      on: { confirmExport },
    });

    // Switch to "Current" scope, then export.
    const segs = container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
    fireEvent.click(segs[1]); // Current
    fireEvent.click(query<HTMLButtonElement>(container, '.rdr-export-btn--primary'));

    expect(confirmExport).toHaveBeenCalledTimes(1);
    expect(confirmExport.mock.calls[0][0]).toMatchObject({
      filename: 'r.pdf',
      scope: 'current',
      includeWatermark: true,
    });
  });

  it('defaults the watermark toggle off and disabled when no watermark is configured', async () => {
    const { container } = await render(ExportDialog, { inputs: { hasWatermark: false } });
    const toggle = query<HTMLButtonElement>(container, '.rdr-export-toggle');
    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('dismisses via the Cancel button, the backdrop, and Escape', async () => {
    const dismiss = vi.fn<() => void>();
    const { container } = await render(ExportDialog, { on: { dismiss } });

    fireEvent.click(
      query<HTMLButtonElement>(container, '.rdr-export-btn:not(.rdr-export-btn--primary)'),
    );
    fireEvent.click(query<HTMLElement>(container, '.rdr-export-backdrop'));
    fireEvent.keyDown(query<HTMLElement>(container, '[role="dialog"]'), { key: 'Escape' });

    expect(dismiss).toHaveBeenCalledTimes(3);
  });
});
