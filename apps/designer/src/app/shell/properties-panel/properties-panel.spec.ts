import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen, fireEvent } from '@testing-library/angular';
import type { TemplateElement } from '@rendara/report-schema';
import { PropertiesPanel } from './properties-panel';
import { DesignerStore } from '../../state/designer-store';

type Store = InstanceType<typeof DesignerStore>;

function textEl(id: string, over: Partial<TemplateElement> = {}): TemplateElement {
  return {
    id,
    type: 'text',
    frame: { xMm: 15, yMm: 30, wMm: 40, hMm: 10 },
    z: 1,
    text: 'Hello',
    ...over,
  } as TemplateElement;
}

function rectEl(id: string, over: Partial<TemplateElement> = {}): TemplateElement {
  return {
    id,
    type: 'shape',
    shape: 'rect',
    frame: { xMm: 10, yMm: 10, wMm: 30, hMm: 20 },
    z: 1,
    ...over,
  } as TemplateElement;
}

function lineEl(id: string): TemplateElement {
  return {
    id,
    type: 'shape',
    shape: 'line',
    frame: { xMm: 10, yMm: 10, wMm: 30, hMm: 0 },
    z: 1,
  } as TemplateElement;
}

/** Reads the resolved stroke of a selected shape element from the store. */
function strokeOf(store: Store) {
  const el = store.primarySelection();
  return el?.type === 'shape' ? el.style?.stroke : undefined;
}

/** Renders the panel, then seeds the store (injected after render) and re-renders. */
async function renderPanel(seed?: (store: Store) => void) {
  const view = await render(PropertiesPanel);
  const store = TestBed.inject(DesignerStore);
  seed?.(store);
  view.detectChanges();
  return { view, store };
}

describe('PropertiesPanel', () => {
  it('shows the empty state when nothing is selected', async () => {
    await renderPanel();
    expect(screen.getByText(/Select an element on the canvas/i)).toBeTruthy();
  });

  it('shows a count note when several elements are selected', async () => {
    await renderPanel((store) => {
      store.addElement(textEl('a'));
      store.addElement(textEl('b'));
      store.select(['a', 'b']);
    });
    expect(screen.getByText(/2 elements selected/i)).toBeTruthy();
  });

  it('seeds Layout and Text from the selected text element', async () => {
    await renderPanel((store) => {
      store.addElement(
        textEl('t', { style: { font: { family: 'Georgia', sizePt: 24, weight: 'bold' } } }),
      );
      store.selectOne('t');
    });

    expect((screen.getByLabelText(/^X/) as HTMLInputElement).valueAsNumber).toBe(15);
    expect((screen.getByLabelText(/^Width/) as HTMLInputElement).valueAsNumber).toBe(40);
    expect((screen.getByLabelText(/Content/i) as HTMLTextAreaElement).value).toBe('Hello');
    expect((screen.getByLabelText(/Font family/i) as HTMLSelectElement).value).toBe('Georgia');
    expect((screen.getByLabelText(/^Size/) as HTMLInputElement).valueAsNumber).toBe(24);
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('edits the literal text live into the store', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(textEl('t'));
      s.selectOne('t');
    });

    fireEvent.input(screen.getByLabelText(/Content/i), { target: { value: 'Invoice' } });

    const el = store.primarySelection();
    expect(el?.type === 'text' && el.text).toBe('Invoice');
    expect(store.dirty()).toBe(true);
  });

  it('edits a frame field and ignores an invalid width', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(textEl('t'));
      s.selectOne('t');
    });

    fireEvent.input(screen.getByLabelText(/^X/), { target: { value: '120' } });
    expect(store.primarySelection()?.frame.xMm).toBe(120);

    fireEvent.input(screen.getByLabelText(/^Width/), { target: { value: '0' } });
    expect(store.primarySelection()?.frame.wMm).toBe(40);
  });

  it('sets the font size, family and weight', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(textEl('t'));
      s.selectOne('t');
    });

    fireEvent.input(screen.getByLabelText(/^Size/), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/Font family/i), { target: { value: 'Courier New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));

    const el = store.primarySelection();
    const font = el?.type === 'text' ? el.style?.font : undefined;
    expect(font).toEqual({ sizePt: 18, family: 'Courier New', weight: 'bold' });
  });

  it('coalesces a continuous edit into one undo step via focus/blur', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(textEl('t'));
      s.selectOne('t');
    });

    const content = screen.getByLabelText(/Content/i);
    fireEvent.focus(content);
    fireEvent.input(content, { target: { value: 'In' } });
    fireEvent.input(content, { target: { value: 'Invoice' } });
    fireEvent.blur(content);

    expect((store.primarySelection() as { text: string }).text).toBe('Invoice');
    // A single undo reverts the whole typing session (not just the last keystroke).
    store.undo();
    expect((store.primarySelection() as { text: string }).text).toBe('Hello');
  });

  it('shows Layout but no Text section for a non-text element', async () => {
    await renderPanel((store) => {
      store.addElement(rectEl('r'));
      store.selectOne('r');
    });

    expect(screen.getByLabelText(/^Width/)).toBeTruthy();
    expect(screen.queryByLabelText(/Content/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
  });

  it('shows the Shape section (stroke + fill) for a shape, but not for text', async () => {
    await renderPanel((store) => {
      store.addElement(rectEl('r'));
      store.selectOne('r');
    });
    expect(screen.getByLabelText(/Stroke style/i)).toBeTruthy();
    expect(screen.getByLabelText(/Stroke width/i)).toBeTruthy();
    expect(screen.getByLabelText(/Stroke colour/i)).toBeTruthy();
  });

  it('does not show the Shape section for a text element', async () => {
    await renderPanel((store) => {
      store.addElement(textEl('t'));
      store.selectOne('t');
    });
    expect(screen.queryByLabelText(/Stroke style/i)).toBeNull();
  });

  it('edits stroke style, width and colour live into the store', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(rectEl('r'));
      s.selectOne('r');
    });

    fireEvent.change(screen.getByLabelText(/Stroke style/i), { target: { value: 'dashed' } });
    fireEvent.input(screen.getByLabelText(/Stroke width/i), { target: { value: '1.5' } });
    fireEvent.input(screen.getByLabelText(/Stroke colour/i), { target: { value: '#123456' } });

    expect(strokeOf(store)).toEqual({ style: 'dashed', widthMm: 1.5, color: '#123456' });
    expect(store.dirty()).toBe(true);
  });

  it('ignores an invalid (negative) stroke width', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(rectEl('r', { style: { stroke: { widthMm: 0.5 } } }));
      s.selectOne('r');
    });

    fireEvent.input(screen.getByLabelText(/Stroke width/i), { target: { value: '-2' } });
    expect(strokeOf(store)?.widthMm).toBe(0.5);
  });

  it('toggles the interior fill on and off', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(rectEl('r'));
      s.selectOne('r');
    });

    // No fill colour control until fill is enabled.
    expect(screen.queryByLabelText(/Fill colour/i)).toBeNull();

    fireEvent.click(screen.getByLabelText('Fill'));
    const el = store.primarySelection();
    expect(el?.type === 'shape' && el.style?.fill).toBe('#FFFFFF');

    // Now the colour control appears and edits the fill.
    fireEvent.input(screen.getByLabelText(/Fill colour/i), { target: { value: '#00ff00' } });
    const el2 = store.primarySelection();
    expect(el2?.type === 'shape' && el2.style?.fill).toBe('#00ff00');

    // Unchecking clears the fill entirely.
    fireEvent.click(screen.getByLabelText('Fill'));
    const el3 = store.primarySelection();
    expect(el3?.type === 'shape' && el3.style && 'fill' in el3.style).toBe(false);
  });

  it('hides the Fill control for a line shape', async () => {
    await renderPanel((store) => {
      store.addElement(lineEl('l'));
      store.selectOne('l');
    });
    expect(screen.getByLabelText(/Stroke style/i)).toBeTruthy();
    expect(screen.queryByLabelText('Fill')).toBeNull();
  });

  it('collapses a section, hiding its body', async () => {
    await renderPanel((store) => {
      store.addElement(textEl('t'));
      store.selectOne('t');
    });

    expect(screen.getByLabelText(/^X/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Layout/ }));
    expect(screen.queryByLabelText(/^X/)).toBeNull();
  });
});
