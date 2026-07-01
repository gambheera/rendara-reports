import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';
import type { TextElement } from '@rendara/report-schema';
import { TopBar } from './top-bar';
import { DesignerStore } from '../../state/designer-store';
import { DRAFT_STORAGE, createMemoryStorage } from '../../state/draft-persistence.service';

/** A minimal text element for marking the document dirty. */
function textEl(id: string): TextElement {
  return { id, type: 'text', frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 }, z: 1, text: id };
}

/** Renders the top bar against an isolated in-memory draft storage. */
function renderTopBar() {
  return render(TopBar, {
    providers: [{ provide: DRAFT_STORAGE, useValue: createMemoryStorage() }],
  });
}

describe('TopBar', () => {
  it('shows the canonical chrome (wordmark + actions)', async () => {
    await renderTopBar();
    expect(screen.getByText('Rendara')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open…' })).toBeTruthy();
  });

  it('shows the document name from the template metadata', async () => {
    await renderTopBar();
    expect(screen.getByText('Untitled report')).toBeTruthy();
  });

  it('reflects the save status: Saved when clean, Unsaved changes when dirty (E6-S11)', async () => {
    const view = await renderTopBar();
    const store = TestBed.inject(DesignerStore);
    expect(screen.getByText('Saved')).toBeTruthy();

    store.addElement(textEl('el_1'));
    view.detectChanges();
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('enters live preview mode when Preview is activated (E6-S9)', async () => {
    await renderTopBar();
    const store = TestBed.inject(DesignerStore);
    expect(store.previewMode()).toBe(false);

    await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(store.previewMode()).toBe(true);
  });

  it('starts a new document via the unsaved-changes guard (E6-S11)', async () => {
    const view = await renderTopBar();
    const store = TestBed.inject(DesignerStore);
    store.addElement(textEl('el_1'));
    view.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await fireEvent.click(screen.getByRole('button', { name: 'New' }));

    expect(store.bodyElements()).toHaveLength(0);
  });

  it('opens the dialog on the Import tab when Open… is activated (E6-S11)', async () => {
    const view = await renderTopBar();

    await fireEvent.click(screen.getByRole('button', { name: 'Open…' }));
    view.detectChanges();

    expect(screen.getByRole('tab', { name: 'Import' })).toBeTruthy();
    // Import tab content: the migrate-on-import note from the mockup.
    expect(screen.getByText(/migrated automatically/i)).toBeTruthy();
  });

  it('opens the export / import dialog when Export is activated (E6-S10)', async () => {
    const view = await renderTopBar();

    await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    view.detectChanges();

    expect(screen.getByRole('tab', { name: 'Export' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Import' })).toBeTruthy();
    expect(screen.getByText('✓ validated')).toBeTruthy();
  });
});
