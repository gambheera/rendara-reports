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
});
