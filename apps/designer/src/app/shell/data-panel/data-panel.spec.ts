import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { DataPanel } from './data-panel';
import { DesignerStore } from '../../state/designer-store';
import { parseSampleData } from '../../state/sample-data';

/** Loads a parsed document straight into the store (bypasses the file picker). */
function seed(json: unknown, fileName = 'invoice-sample.json') {
  const result = parseSampleData(JSON.stringify(json), fileName);
  if (!result.ok) throw new Error('seed parse failed');
  TestBed.inject(DesignerStore).setSampleData(result.data);
}

/** Fires a file selection on the panel's hidden input with the given text. */
async function selectFile(
  view: Awaited<ReturnType<typeof render>>,
  text: string,
  name = 'data.json',
) {
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  const file = new File([text], name, { type: 'application/json' });
  await fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
}

describe('DataPanel', () => {
  it('shows the empty state with an Import action when nothing is loaded', async () => {
    await render(DataPanel);
    expect(screen.getByText('No sample data')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import sample data' })).toBeTruthy();
  });

  it('imports a valid JSON file and renders its bindable fields', async () => {
    const view = await render(DataPanel);

    await selectFile(view, JSON.stringify({ invoice: { customer: { name: 'Acme' } } }));

    await waitFor(() => expect(screen.getByRole('tree')).toBeTruthy());
    expect(screen.getByText('SAMPLE DATA')).toBeTruthy();
    expect(screen.getByText('data.json')).toBeTruthy();
    expect(screen.getByText('invoice')).toBeTruthy();
    expect(screen.getByText('customer')).toBeTruthy();
    expect(screen.getByText('name')).toBeTruthy();
  });

  it('exposes the field tree as a drop list connected to the canvas (drag-to-bind, E6-S7)', async () => {
    const view = await render(DataPanel);
    seed({ invoice: { total: 1 } });
    view.detectChanges();

    const tree = screen.getByRole('tree');
    // CDK marks the list element; the canvas drop list is the connected target.
    expect(tree.classList.contains('cdk-drop-list')).toBe(true);
  });

  it('shows a clear inline error when the imported file is invalid JSON', async () => {
    const view = await render(DataPanel);

    await selectFile(view, '{ not json');

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/isn't valid JSON/);
    });
    // Still in the empty state — nothing was loaded.
    expect(screen.queryByRole('tree')).toBeNull();
  });

  it('filters the field tree to matches plus their ancestors', async () => {
    const view = await render(DataPanel);
    seed({ invoice: { customer: { name: 'Acme' }, total: 42 } });
    view.detectChanges();

    const filter = screen.getByRole('searchbox', { name: 'Filter fields' });
    await fireEvent.input(filter, { target: { value: 'name' } });
    view.detectChanges();

    expect(screen.getByText('name')).toBeTruthy();
    expect(screen.getByText('customer')).toBeTruthy();
    // The non-matching sibling branch is gone.
    expect(screen.queryByText('total')).toBeNull();
  });

  it('shows a no-matches hint when the filter excludes every field', async () => {
    const view = await render(DataPanel);
    seed({ invoice: { total: 42 } });
    view.detectChanges();

    const filter = screen.getByRole('searchbox', { name: 'Filter fields' });
    await fireEvent.input(filter, { target: { value: 'zzz' } });
    view.detectChanges();

    expect(screen.getByText(/No fields match/)).toBeTruthy();
    expect(screen.queryByRole('tree')).toBeNull();
  });

  it('offers a Replace action once data is loaded', async () => {
    const view = await render(DataPanel);
    seed({ invoice: { total: 42 } });
    view.detectChanges();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy();
  });
});
