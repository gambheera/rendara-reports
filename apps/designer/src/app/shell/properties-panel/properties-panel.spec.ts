import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen, fireEvent } from '@testing-library/angular';
import type { TemplateElement } from '@rendara/report-schema';
import { PropertiesPanel } from './properties-panel';
import { DesignerStore } from '../../state/designer-store';
import { parseSampleData } from '../../state/sample-data';

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

function imageEl(id: string, over: Partial<TemplateElement> = {}): TemplateElement {
  return {
    id,
    type: 'image',
    frame: { xMm: 10, yMm: 10, wMm: 40, hMm: 30 },
    z: 1,
    src: 'https://cdn.example.com/logo.png',
    fit: 'contain',
    ...over,
  } as TemplateElement;
}

function tableEl(id: string, over: Partial<TemplateElement> = {}): TemplateElement {
  return {
    id,
    type: 'dataTable',
    frame: { xMm: 15, yMm: 60, wMm: 120, hMm: null },
    z: 1,
    source: { arrayExpr: 'items' },
    columns: [
      { key: 'col1', header: 'Description', cell: { expr: '$.col1' }, widthMm: 60 },
      { key: 'col2', header: 'Amount', cell: { expr: '$.col2' }, widthMm: 60 },
    ],
    repeatHeaderOnEachPage: true,
    keepTogether: false,
    ...over,
  } as TemplateElement;
}

/** Reads the selected data-table element from the store. */
function tableOf(store: Store) {
  const el = store.primarySelection();
  return el?.type === 'dataTable' ? el : undefined;
}

/** Reads the selected image element's static source from the store. */
function srcOf(store: Store): string | undefined {
  const el = store.primarySelection();
  return el?.type === 'image' ? el.src : undefined;
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

  it('shows the Image section (source + fit) for an image, but not for text', async () => {
    await renderPanel((store) => {
      store.addElement(imageEl('img'));
      store.selectOne('img');
    });
    expect((screen.getByLabelText(/Source URL/i) as HTMLInputElement).value).toBe(
      'https://cdn.example.com/logo.png',
    );
    expect((screen.getByLabelText(/^Fit$/i) as HTMLSelectElement).value).toBe('contain');
    expect(screen.getByLabelText(/Upload image file/i)).toBeTruthy();
  });

  it('does not show the Image section for a text element', async () => {
    await renderPanel((store) => {
      store.addElement(textEl('t'));
      store.selectOne('t');
    });
    expect(screen.queryByLabelText(/Source URL/i)).toBeNull();
  });

  it('edits a valid source URL live into the store', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(imageEl('img'));
      s.selectOne('img');
    });

    fireEvent.input(screen.getByLabelText(/Source URL/i), {
      target: { value: 'https://cdn.example.com/new.png' },
    });
    expect(srcOf(store)).toBe('https://cdn.example.com/new.png');
    expect(store.dirty()).toBe(true);
  });

  it('blocks a malicious source URL, keeping the model and showing an error', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(imageEl('img'));
      s.selectOne('img');
    });

    fireEvent.input(screen.getByLabelText(/Source URL/i), {
      target: { value: 'javascript:alert(1)' },
    });

    // The dangerous URL never reaches the model; an inline error is announced.
    expect(srcOf(store)).toBe('https://cdn.example.com/logo.png');
    expect(screen.getByRole('alert').textContent).toMatch(/blocked for security/i);
    expect(
      (screen.getByLabelText(/Source URL/i) as HTMLInputElement).getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('clears the source when the URL field is emptied', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(imageEl('img'));
      s.selectOne('img');
    });

    fireEvent.input(screen.getByLabelText(/Source URL/i), { target: { value: '' } });
    expect(srcOf(store)).toBe('');
  });

  it('changes the fit mode live into the store', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(imageEl('img'));
      s.selectOne('img');
    });

    fireEvent.change(screen.getByLabelText(/^Fit$/i), { target: { value: 'cover' } });
    const el = store.primarySelection();
    expect(el?.type === 'image' && el.fit).toBe('cover');
  });

  it('reads an uploaded image file into a data-URI source', async () => {
    const dataUri = 'data:image/png;base64,AAAA';
    // A deterministic FileReader so the test asserts the wiring, not jsdom's base64.
    const fakeReader = {
      result: dataUri as string | ArrayBuffer | null,
      onload: null as null | (() => void),
      onerror: null as null | (() => void),
      readAsDataURL() {
        this.onload?.();
      },
    };
    const original = globalThis.FileReader;
    vi.stubGlobal(
      'FileReader',
      vi.fn(() => fakeReader),
    );

    try {
      const { store } = await renderPanel((s) => {
        s.addElement(imageEl('img'));
        s.selectOne('img');
      });

      const file = new File(['x'], 'logo.png', { type: 'image/png' });
      fireEvent.change(screen.getByLabelText(/Upload image file/i), { target: { files: [file] } });

      expect(srcOf(store)).toBe(dataUri);
    } finally {
      vi.stubGlobal('FileReader', original);
    }
  });

  it('rejects an oversized upload with an error and leaves the source unchanged', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(imageEl('img'));
      s.selectOne('img');
    });

    const big = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText(/Upload image file/i), { target: { files: [big] } });

    expect(screen.getByRole('alert').textContent).toMatch(/too large/i);
    expect(srcOf(store)).toBe('https://cdn.example.com/logo.png');
  });

  it('shows the Table section (columns + options) for a data table, but not for text', async () => {
    await renderPanel((store) => {
      store.addElement(tableEl('tbl'));
      store.selectOne('tbl');
    });
    expect(screen.getByRole('button', { name: /Remove column Description/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add column/i })).toBeTruthy();
    expect(screen.getByLabelText(/Repeat header on each page/i)).toBeTruthy();
    expect(screen.getByLabelText(/Keep table together/i)).toBeTruthy();
  });

  it('does not show the Table section for a text element', async () => {
    await renderPanel((store) => {
      store.addElement(textEl('t'));
      store.selectOne('t');
    });
    expect(screen.queryByRole('button', { name: /Add column/i })).toBeNull();
  });

  it('adds a column and focuses it in the Selected-Column editor', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl'));
      s.selectOne('tbl');
    });

    fireEvent.click(screen.getByRole('button', { name: /Add column/i }));

    expect(tableOf(store)?.columns).toHaveLength(3);
    // The new column becomes the selected one (its header is in the editor input).
    expect((screen.getByLabelText(/Header text/i) as HTMLInputElement).value).toBe('Column 3');
    expect(store.dirty()).toBe(true);
  });

  it('removes a column and disables removal of the last one', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl'));
      s.selectOne('tbl');
    });

    fireEvent.click(screen.getByRole('button', { name: /Remove column Description/i }));
    expect(tableOf(store)?.columns.map((c) => c.key)).toEqual(['col2']);

    // Only one column left → its remove button is disabled (≥1 column rule).
    const lastRemove = screen.getByRole('button', { name: /Remove column Amount/i });
    expect((lastRemove as HTMLButtonElement).disabled).toBe(true);
  });

  it('edits the selected column header, width and alignment', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl'));
      s.selectOne('tbl');
    });

    fireEvent.input(screen.getByLabelText(/Header text/i), { target: { value: 'Item' } });
    expect(tableOf(store)?.columns[0].header).toBe('Item');

    fireEvent.input(screen.getByLabelText(/Column width/i), { target: { value: '85' } });
    expect(tableOf(store)?.columns[0].widthMm).toBe(85);

    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    expect(tableOf(store)?.columns[0].align).toBe('right');
  });

  it('ignores an invalid (zero) column width', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl'));
      s.selectOne('tbl');
    });

    fireEvent.input(screen.getByLabelText(/Column width/i), { target: { value: '0' } });
    expect(tableOf(store)?.columns[0].widthMm).toBe(60);
  });

  it('edits the selected column after switching with the column row buttons', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl'));
      s.selectOne('tbl');
    });

    // Select the second column, then rename it.
    fireEvent.click(screen.getByRole('button', { name: 'Amount', exact: true }));
    fireEvent.input(screen.getByLabelText(/Header text/i), { target: { value: 'Total' } });
    expect(tableOf(store)?.columns[1].header).toBe('Total');
  });

  it('reorders columns through the drag-drop handler', async () => {
    const { view, store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl'));
      s.selectOne('tbl');
    });

    const panel = view.fixture.componentInstance as unknown as {
      onColumnDrop(event: { previousIndex: number; currentIndex: number }): void;
    };
    panel.onColumnDrop({ previousIndex: 0, currentIndex: 1 });

    expect(tableOf(store)?.columns.map((c) => c.key)).toEqual(['col2', 'col1']);
  });

  it('toggles header-repeat and keep-together options', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl'));
      s.selectOne('tbl');
    });

    fireEvent.click(screen.getByLabelText(/Repeat header on each page/i));
    expect(tableOf(store)?.repeatHeaderOnEachPage).toBe(false);

    fireEvent.click(screen.getByLabelText(/Keep table together/i));
    expect(tableOf(store)?.keepTogether).toBe(true);
  });

  it('adds and removes a grouping band and edits its groupBy', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl'));
      s.selectOne('tbl');
    });

    fireEvent.click(screen.getByRole('button', { name: /Add group/i }));
    expect(tableOf(store)?.groups).toEqual([{ groupBy: '$' }]);

    fireEvent.input(screen.getByLabelText(/Group by expression/i), {
      target: { value: '$.category' },
    });
    expect(tableOf(store)?.groups?.[0].groupBy).toBe('$.category');

    fireEvent.click(screen.getByRole('button', { name: /Remove group/i }));
    // Removing the only group omits the key entirely.
    expect(tableOf(store)?.groups).toBeUndefined();
  });

  // --- Table data binding (E6-S8) ------------------------------------------

  it('edits the table data source', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl'));
      s.selectOne('tbl');
    });

    fireEvent.input(screen.getByLabelText(/Data source/i), {
      target: { value: 'invoice.lineItems' },
    });
    expect(tableOf(store)?.source.arrayExpr).toBe('invoice.lineItems');
  });

  it('binds the selected column cell expression and format', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl'));
      s.selectOne('tbl');
    });

    fireEvent.input(screen.getByLabelText(/Cell value expression/i), {
      target: { value: '$.amount' },
    });
    fireEvent.change(screen.getByLabelText(/Cell format/i), { target: { value: 'currency:USD' } });

    expect(tableOf(store)?.columns[0].cell).toEqual({ expr: '$.amount', format: 'currency:USD' });
  });

  it('toggles a column footer grand total and switches its function', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl', { source: { arrayExpr: 'invoice.lineItems' } }));
      s.selectOne('tbl');
    });

    fireEvent.click(screen.getByLabelText(/Show footer aggregate/i));
    expect(tableOf(store)?.columns[0].footer?.expr).toBe('$sum(invoice.lineItems.col1)');

    fireEvent.change(screen.getByLabelText(/Footer aggregate function/i), {
      target: { value: 'count' },
    });
    expect(tableOf(store)?.columns[0].footer?.expr).toBe('$count(invoice.lineItems)');

    fireEvent.click(screen.getByLabelText(/Show footer aggregate/i));
    expect(tableOf(store)?.columns[0].footer).toBeUndefined();
  });

  it('adds a per-group subtotal for the selected column when grouped', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(tableEl('tbl', { groups: [{ groupBy: '$.category' }] }));
      s.selectOne('tbl');
    });

    fireEvent.click(screen.getByLabelText(/Show group subtotal/i));
    expect(tableOf(store)?.groups?.[0].footer?.aggregates).toEqual([
      { columnKey: 'col1', binding: { expr: '$sum($.col1)' } },
    ]);
  });

  it('shows the resolved row count from sample data', async () => {
    await renderPanel((s) => {
      s.addElement(tableEl('tbl', { source: { arrayExpr: 'invoice.lineItems' } }));
      s.selectOne('tbl');
      const parsed = parseSampleData('{"invoice":{"lineItems":[{"col1":1},{"col1":2}]}}');
      if (parsed.ok) s.setSampleData(parsed.data);
      s.setResolvedTables(
        new Map([
          [
            'tbl',
            {
              rows: [
                { index: 0, data: {}, cells: [] },
                { index: 1, data: {}, cells: [] },
              ],
              columnFooters: [],
              errors: [],
              diagnostics: [],
            },
          ],
        ]),
      );
    });

    expect(screen.getByText(/2 rows in sample data/i)).toBeTruthy();
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

  // --- Data Binding section (E6-S7) ----------------------------------------

  /** Reads the selected element's binding from the store. */
  function bindingOf(store: Store) {
    const el = store.primarySelection();
    return el?.type === 'text' || el?.type === 'image' ? el.binding : undefined;
  }

  it('shows the Data Binding section for a text element', async () => {
    await renderPanel((s) => {
      s.addElement(textEl('t'));
      s.selectOne('t');
    });
    expect(screen.getByRole('button', { name: /Data Binding/ })).toBeTruthy();
    expect(screen.getByLabelText(/Expression/i)).toBeTruthy();
  });

  it('shows no Data Binding section for a non-bindable (shape) element', async () => {
    await renderPanel((s) => {
      s.addElement(rectEl('r'));
      s.selectOne('r');
    });
    expect(screen.queryByRole('button', { name: /Data Binding/ })).toBeNull();
  });

  it('binds a text element by typing an expression', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(textEl('t'));
      s.selectOne('t');
    });

    fireEvent.input(screen.getByLabelText(/Expression/i), {
      target: { value: 'invoice.customer.name' },
    });

    expect(bindingOf(store)).toEqual({ expr: 'invoice.customer.name' });
  });

  it('clears the binding when the expression is emptied', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(textEl('t', { binding: { expr: 'invoice.total' } }));
      s.selectOne('t');
    });
    expect(bindingOf(store)).toEqual({ expr: 'invoice.total' });

    fireEvent.input(screen.getByLabelText(/Expression/i), { target: { value: '' } });
    expect(bindingOf(store)).toBeUndefined();
  });

  it('sets the format token and fallback on the binding', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(textEl('t', { binding: { expr: 'invoice.total' } }));
      s.selectOne('t');
    });

    fireEvent.change(screen.getByLabelText(/Format/i), { target: { value: 'currency:USD' } });
    expect(bindingOf(store)).toMatchObject({ expr: 'invoice.total', format: 'currency:USD' });

    fireEvent.input(screen.getByLabelText(/Fallback/i), { target: { value: 'n/a' } });
    expect(bindingOf(store)).toMatchObject({ fallback: 'n/a' });
  });

  it('sets and clears the visibleWhen condition (blank means always)', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(textEl('t'));
      s.selectOne('t');
    });

    fireEvent.input(screen.getByLabelText(/Visible when/i), { target: { value: 'invoice.paid' } });
    expect(store.primarySelection()?.visibleWhen).toBe('invoice.paid');

    fireEvent.input(screen.getByLabelText(/Visible when/i), { target: { value: '   ' } });
    expect(store.primarySelection()?.visibleWhen).toBeNull();
  });

  it('shows an inline error for an invalid expression', async () => {
    await renderPanel((s) => {
      s.addElement(textEl('t'));
      s.selectOne('t');
    });

    fireEvent.input(screen.getByLabelText(/Expression/i), { target: { value: 'invoice.(' } });
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('offers imported field paths as autocomplete options', async () => {
    const parsed = parseSampleData(
      JSON.stringify({ invoice: { total: 1, customer: { name: 'Acme' } } }),
      'sample.json',
    );
    const { view } = await renderPanel((s) => {
      s.addElement(textEl('t'));
      s.selectOne('t');
      if (parsed.ok) s.setSampleData(parsed.data);
    });

    const options = Array.from(
      view.container.querySelectorAll<HTMLOptionElement>('#rdr-binding-fields option'),
    ).map((o) => o.value);
    expect(options).toContain('invoice.total');
    expect(options).toContain('invoice.customer.name');
  });

  it('clears the binding via the Clear binding button', async () => {
    const { store } = await renderPanel((s) => {
      s.addElement(textEl('t', { binding: { expr: 'invoice.total' } }));
      s.selectOne('t');
    });

    fireEvent.click(screen.getByRole('button', { name: /Clear binding/ }));
    expect(bindingOf(store)).toBeUndefined();
  });
});
