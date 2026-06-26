import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';
import { TopBar } from './top-bar';
import { DesignerStore } from '../../state/designer-store';

describe('TopBar', () => {
  it('shows the canonical chrome (wordmark + actions)', async () => {
    await render(TopBar);
    expect(screen.getByText('Rendara')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy();
  });

  it('enters live preview mode when Preview is activated (E6-S9)', async () => {
    await render(TopBar);
    const store = TestBed.inject(DesignerStore);
    expect(store.previewMode()).toBe(false);

    await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(store.previewMode()).toBe(true);
  });
});
