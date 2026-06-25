import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen, fireEvent } from '@testing-library/angular';
import { isCustomPageSize, isNamedPageSize, resolvePage } from '@rendara/report-schema';
import { mmToPt } from '@rendara/report-engine';
import { PageSetupDialog } from './page-setup-dialog';
import { DesignerStore } from '../state/designer-store';

type Store = InstanceType<typeof DesignerStore>;

/**
 * Renders the dialog and opens it. `render` configures the TestBed, so the
 * store is injected *after* rendering; an optional `seed` runs before `open()`
 * so a test can stage a non-default page first.
 */
async function open(seed?: (store: Store) => void) {
  const view = await render(PageSetupDialog);
  const store = TestBed.inject(DesignerStore);
  seed?.(store);
  const dialog = view.fixture.componentInstance;
  dialog.open();
  view.detectChanges();
  return { view, store, dialog };
}

function paperSelect(): HTMLSelectElement {
  return screen.getByLabelText('Paper') as HTMLSelectElement;
}

describe('PageSetupDialog', () => {
  it('seeds the form from the document page model', async () => {
    await open();

    expect(paperSelect().value).toBe('A4');
    expect((screen.getByLabelText(/^top/i) as HTMLInputElement).valueAsNumber).toBe(20);
    expect((screen.getByLabelText(/^left/i) as HTMLInputElement).valueAsNumber).toBe(15);
    expect(screen.getByRole('button', { name: 'Portrait' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText('210 × 297 mm')).toBeTruthy();
  });

  it('commits an A4 → Letter change and marks the document dirty', async () => {
    const { store } = await open();
    expect(store.dirty()).toBe(false);

    fireEvent.change(paperSelect(), { target: { value: 'Letter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(store.page().size).toBe('Letter');
    expect(store.dirty()).toBe(true);
  });

  it('commits an orientation change', async () => {
    const { store } = await open();

    fireEvent.click(screen.getByRole('button', { name: 'Landscape' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(store.page().orientation).toBe('landscape');
  });

  it('links margins so editing one side updates all four', async () => {
    const { store } = await open();

    fireEvent.input(screen.getByLabelText(/^top/i), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(store.page().marginsMm).toEqual({ top: 30, right: 30, bottom: 30, left: 30 });
  });

  it('edits a single side when margins are unlinked', async () => {
    const { store } = await open();

    fireEvent.click(screen.getByRole('button', { name: 'Link all margins' }));
    fireEvent.input(screen.getByLabelText(/^top/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(store.page().marginsMm).toEqual({ top: 5, right: 15, bottom: 20, left: 15 });
  });

  it('converts displayed margins when the unit changes but stores mm', async () => {
    const { store, view } = await open();

    fireEvent.click(screen.getByRole('button', { name: 'pt' }));
    view.detectChanges();

    // 20 mm shown as points (rounded to 1 dp); the stored geometry stays mm.
    const top = screen.getByLabelText(/^top/i) as HTMLInputElement;
    expect(top.valueAsNumber).toBeCloseTo(Number(mmToPt(20).toFixed(1)), 5);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(store.page().units).toBe('pt');
    expect(store.page().marginsMm.top).toBeCloseTo(20, 5);
  });

  it('rejects invalid page settings without committing', async () => {
    const { store } = await open();
    const before = store.page();

    // Margins wider than the A4 page leave no content area (schema rule).
    fireEvent.input(screen.getByLabelText(/^left/i), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(store.page()).toBe(before);
    expect(store.dirty()).toBe(false);
  });

  it('does not mutate the document on cancel and reseeds on reopen', async () => {
    const { store, dialog, view } = await open();
    const before = store.page();

    fireEvent.change(paperSelect(), { target: { value: 'Letter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(store.page()).toBe(before);

    dialog.open();
    view.detectChanges();
    expect(paperSelect().value).toBe('A4');
  });

  it('commits a custom paper size', async () => {
    const { store } = await open();

    fireEvent.change(paperSelect(), { target: { value: 'custom' } });
    fireEvent.input(screen.getByLabelText('Width (mm)'), { target: { value: '120' } });
    fireEvent.input(screen.getByLabelText('Height (mm)'), { target: { value: '160' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    const size = store.page().size;
    expect(isNamedPageSize(size)).toBe(false);
    if (isCustomPageSize(size)) {
      expect(size).toEqual({ widthMm: 120, heightMm: 160 });
    }
  });

  it('round-trips a non-default page back through resolvePage unchanged', async () => {
    const { store } = await open((s) =>
      s.setPage(resolvePage({ size: 'Letter', orientation: 'landscape', units: 'pt' })),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(store.page().size).toBe('Letter');
    expect(store.page().orientation).toBe('landscape');
    expect(store.page().units).toBe('pt');
  });
});
