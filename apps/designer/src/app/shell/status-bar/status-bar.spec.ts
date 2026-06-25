import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen, fireEvent } from '@testing-library/angular';
import { resolvePage } from '@rendara/report-schema';
import { StatusBar } from './status-bar';
import { DesignerStore } from '../../state/designer-store';

describe('StatusBar', () => {
  it('summarises the default page model', async () => {
    await render(StatusBar);

    expect(screen.getByRole('button', { name: /Page setup/ }).textContent?.trim()).toBe(
      'A4 · Portrait · mm',
    );
  });

  it('reflects page-model changes live', async () => {
    const view = await render(StatusBar);
    const store = TestBed.inject(DesignerStore);

    store.setPage(resolvePage({ size: 'Letter', orientation: 'landscape', units: 'pt' }));
    view.detectChanges();

    expect(screen.getByRole('button', { name: /Page setup/ }).textContent?.trim()).toBe(
      'Letter · Landscape · pt',
    );
  });

  it('emits openPageSetup when the summary is activated', async () => {
    const view = await render(StatusBar);
    const opened = vi.fn();
    view.fixture.componentInstance.openPageSetup.subscribe(opened);

    fireEvent.click(screen.getByRole('button', { name: /Page setup/ }));

    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('shows the live zoom percentage from the store', async () => {
    const view = await render(StatusBar);
    const store = TestBed.inject(DesignerStore);

    store.setZoom(0.5);
    view.detectChanges();

    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('steps the zoom out and in via the −/+ buttons', async () => {
    const view = await render(StatusBar);
    const store = TestBed.inject(DesignerStore);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    view.detectChanges();
    expect(store.zoomPercent()).toBe(90);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    view.detectChanges();
    expect(store.zoomPercent()).toBe(100);
  });

  it('counts pages from the rendered document', async () => {
    await render(StatusBar);

    // The empty document paginates to a single page.
    expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  });

  it('emits fitToView when Fit is activated', async () => {
    const view = await render(StatusBar);
    const fitted = vi.fn();
    view.fixture.componentInstance.fitToView.subscribe(fitted);

    fireEvent.click(screen.getByRole('button', { name: 'Fit' }));

    expect(fitted).toHaveBeenCalledTimes(1);
  });
});
