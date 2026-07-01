import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { goldenInvoiceTemplate } from '@rendara/report-schema';
import { ExportImportDialog } from './export-import-dialog';
import { DesignerStore } from '../state/designer-store';
import { DRAFT_STORAGE, createMemoryStorage } from '../state/draft-persistence.service';
import { serializeTemplate } from '../state/template-io';

type Store = InstanceType<typeof DesignerStore>;

/** Renders the dialog and opens it on the given tab. */
async function open(tab: 'export' | 'import' = 'export', seed?: (store: Store) => void) {
  const view = await render(ExportImportDialog, {
    providers: [{ provide: DRAFT_STORAGE, useValue: createMemoryStorage() }],
  });
  const store = TestBed.inject(DesignerStore);
  seed?.(store);
  const dialog = view.fixture.componentInstance;
  dialog.open(tab);
  view.detectChanges();
  return { view, store, dialog };
}

/** Fires a file selection on the import file input with the given text. */
async function selectFile(
  view: Awaited<ReturnType<typeof render>>,
  text: string,
  name = 'template.json',
) {
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  const file = new File([text], name, { type: 'application/json' });
  await fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
}

describe('ExportImportDialog', () => {
  describe('export tab', () => {
    it('shows the validated chip and a JSON preview of the current template', async () => {
      const { view } = await open();
      expect(screen.getByText('✓ validated')).toBeTruthy();
      expect(screen.getByText(/"schemaVersion"/)).toBeTruthy();
      const codePreview = view.container.querySelector('.rdr-eio__code');
      expect(codePreview?.getAttribute('tabindex')).toBe('0');
      expect(codePreview?.getAttribute('aria-label')).toBe('Template JSON preview');
    });

    it('seeds the filename from the template metadata name', async () => {
      await open('export', (store) =>
        store.loadTemplate({
          ...goldenInvoiceTemplate,
          metadata: { ...goldenInvoiceTemplate.metadata, name: 'Quarterly Report' },
        }),
      );
      expect((screen.getByLabelText('Filename') as HTMLInputElement).value).toBe(
        'quarterly-report.json',
      );
    });

    it('toggling pretty-print switches the preview between pretty and compact JSON', async () => {
      const { view, store } = await open();
      const pretty = serializeTemplate(store.template(), { prettyPrint: true });
      const compact = serializeTemplate(store.template(), { prettyPrint: false });

      expect(view.container.querySelector('.rdr-eio__code')?.textContent).toContain(
        pretty.slice(0, 20),
      );

      fireEvent.click(screen.getByRole('switch', { name: 'Pretty-print JSON' }));
      view.detectChanges();

      const codeText = view.container.querySelector('.rdr-eio__code')?.textContent ?? '';
      expect(codeText).toContain(compact);
      expect(codeText).not.toContain('\n  "schemaVersion"');
    });

    it('copies the serialized template to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      const { store } = await open();

      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(
          serializeTemplate(store.template(), { prettyPrint: true }),
        ),
      );
      vi.unstubAllGlobals();
    });

    it('downloads a Blob when the template is valid', async () => {
      const createObjectURL = vi.fn().mockReturnValue('blob:fake');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);

      await open();
      fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');

      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    });
  });

  describe('import tab', () => {
    it('switches to the import tab and shows the drop zone', async () => {
      await open('export');
      fireEvent.click(screen.getByRole('tab', { name: 'Import' }));
      expect(screen.getByText(/Drop a .json file here/)).toBeTruthy();
      expect(screen.getByText('Older templates are migrated automatically')).toBeTruthy();
    });

    it('stages a valid file and loads it into the store on confirm', async () => {
      const { view, store } = await open('import');
      const incoming = {
        ...goldenInvoiceTemplate,
        metadata: { ...goldenInvoiceTemplate.metadata, name: 'Imported Doc' },
      };

      await selectFile(view, serializeTemplate(incoming, { prettyPrint: true }), 'imported.json');

      await waitFor(() => expect(screen.getByText(/validated successfully/)).toBeTruthy());
      expect(screen.getByText(/imported\.json/)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Import template' }));
      expect(store.template().metadata.name).toBe('Imported Doc');
    });

    it('notes that an older template was migrated', async () => {
      const { view } = await open('import');
      const legacy = {
        ...structuredClone(goldenInvoiceTemplate),
        schemaVersion: '0.9.0',
      } as Record<string, unknown>;
      delete legacy['header'];
      delete legacy['footer'];

      await selectFile(view, JSON.stringify(legacy), 'old.json');

      await waitFor(() => expect(screen.getByText(/migrated from 0.9.0/)).toBeTruthy());
    });

    it('shows errors for an invalid template and leaves the document unchanged', async () => {
      const { view, store } = await open('import');
      const before = store.template();
      const broken = { ...structuredClone(goldenInvoiceTemplate) } as Record<string, unknown>;
      delete broken['page'];

      await selectFile(view, JSON.stringify(broken), 'broken.json');

      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
      expect(screen.getByText(/couldn't be imported/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Import template' })).toHaveProperty(
        'disabled',
        true,
      );
      expect(store.template()).toBe(before);
    });

    it('shows a friendly error for malformed JSON', async () => {
      const { view } = await open('import');
      await selectFile(view, '{ not json ]', 'bad.json');
      await waitFor(() => expect(screen.getByText(/isn't valid JSON/)).toBeTruthy());
    });
  });
});
