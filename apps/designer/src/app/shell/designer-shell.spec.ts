import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen, fireEvent } from '@testing-library/angular';
import type { TextElement } from '@rendara/report-schema';
import { DesignerShell, arrangeShortcut } from './designer-shell';
import { DesignerStore } from '../state/designer-store';

function textEl(id: string): TextElement {
  return { id, type: 'text', frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 }, z: 1, text: id };
}

describe('arrangeShortcut', () => {
  const base = { ctrlKey: true, metaKey: false, shiftKey: false, key: '', code: '' };

  it('maps Ctrl+G / Ctrl+Shift+G to group / ungroup', () => {
    expect(arrangeShortcut({ ...base, key: 'g' })).toBe('group');
    expect(arrangeShortcut({ ...base, key: 'G', shiftKey: true })).toBe('ungroup');
  });

  it('maps the bracket shortcuts to the four z-order ops (by code or key)', () => {
    expect(arrangeShortcut({ ...base, code: 'BracketRight' })).toBe('forward');
    expect(arrangeShortcut({ ...base, code: 'BracketRight', shiftKey: true })).toBe('front');
    expect(arrangeShortcut({ ...base, key: '[' })).toBe('backward');
    expect(arrangeShortcut({ ...base, key: '{', shiftKey: true })).toBe('back');
  });

  it('requires the Ctrl/Cmd modifier and ignores other keys', () => {
    expect(arrangeShortcut({ ...base, ctrlKey: false, key: 'g' })).toBeNull();
    expect(arrangeShortcut({ ...base, key: 'a' })).toBeNull();
  });
});

describe('DesignerShell', () => {
  it('groups the selection on the Ctrl+G shortcut, but not while typing', async () => {
    const view = await render(DesignerShell);
    const store = TestBed.inject(DesignerStore);
    store.addElement(textEl('a'));
    store.addElement(textEl('b'));
    store.select(['a', 'b']);

    // A keydown from a text input is ignored.
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true }));
    expect(store.groups()).toEqual([]);
    input.remove();

    // A keydown on the canvas triggers the group command.
    const main = view.container.querySelector('main');
    if (main === null) throw new Error('expected the canvas main landmark');
    main.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true }));
    expect(store.groups()).toEqual([['a', 'b']]);
  });

  it('lays out the four zones as landmarks', async () => {
    await render(DesignerShell);

    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main', { name: 'Report canvas' })).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    // Two complementary panels, distinctly labelled for assistive tech.
    expect(screen.getByRole('complementary', { name: 'Insert palette' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Properties' })).toBeTruthy();
  });

  it('collapses and re-expands the left palette', async () => {
    await render(DesignerShell);

    expect(screen.getByRole('complementary', { name: 'Insert palette' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Collapse insert panel' }));
    expect(screen.queryByRole('complementary', { name: 'Insert palette' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Expand insert panel' }));
    expect(screen.getByRole('complementary', { name: 'Insert palette' })).toBeTruthy();
  });

  it('collapses and re-expands the right properties panel', async () => {
    await render(DesignerShell);

    await fireEvent.click(screen.getByRole('button', { name: 'Collapse properties panel' }));
    expect(screen.queryByRole('complementary', { name: 'Properties' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Expand properties panel' }));
    expect(screen.getByRole('complementary', { name: 'Properties' })).toBeTruthy();
  });

  it('resizes the left panel from the keyboard within bounds', async () => {
    await render(DesignerShell);

    const handle = screen.getByRole('separator', { name: 'Resize insert panel' });
    const start = Number(handle.getAttribute('aria-valuenow'));

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(start + 16);

    // Spam left past the minimum; the width clamps at MIN_WIDTH (200).
    for (let i = 0; i < 50; i++) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(200);
  });
});
