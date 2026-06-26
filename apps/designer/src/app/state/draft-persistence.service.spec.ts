import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { goldenInvoiceTemplate, type TextElement } from '@rendara/report-schema';
import { DesignerStore } from './designer-store';
import {
  DRAFT_STORAGE,
  DraftPersistenceService,
  createMemoryStorage,
} from './draft-persistence.service';
import { DRAFT_STORAGE_KEY, loadDraftTemplate, saveDraftTemplate } from './draft-storage';

/** A minimal text element for seeding edits. */
function textEl(id: string): TextElement {
  return { id, type: 'text', frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 }, z: 1, text: id };
}

/**
 * Boots the service against a given storage and returns the live store + storage.
 * The service is `providedIn: 'root'`; injecting it runs its constructor (restore,
 * autosave effect, unload guard).
 */
function setup(storage: Storage): {
  service: DraftPersistenceService;
  store: InstanceType<typeof DesignerStore>;
} {
  TestBed.configureTestingModule({
    providers: [{ provide: DRAFT_STORAGE, useValue: storage }],
  });
  const service = TestBed.inject(DraftPersistenceService);
  const store = TestBed.inject(DesignerStore);
  return { service, store };
}

describe('DraftPersistenceService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('restores a persisted draft on startup and marks it dirty (unsaved work)', () => {
    const storage = createMemoryStorage();
    saveDraftTemplate(storage, goldenInvoiceTemplate);

    const { store } = setup(storage);

    expect(store.template().metadata.name).toBe(goldenInvoiceTemplate.metadata.name);
    expect(store.dirty()).toBe(true);
  });

  it('starts clean with no draft and persists nothing for an untouched document', () => {
    const storage = createMemoryStorage();
    const { store } = setup(storage);

    TestBed.tick();
    vi.runAllTimers();

    expect(store.dirty()).toBe(false);
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('autosaves the document to storage after an edit (debounced)', () => {
    const storage = createMemoryStorage();
    const { store } = setup(storage);

    store.addElement(textEl('el_1'));
    TestBed.tick();

    // Nothing written until the debounce elapses.
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBeNull();

    vi.runAllTimers();

    const restored = loadDraftTemplate(storage);
    expect(restored?.ok).toBe(true);
    if (!restored?.ok) return;
    expect(restored.template.body.elements).toHaveLength(1);
  });

  it('clears the draft when the document returns to a clean state', () => {
    const storage = createMemoryStorage();
    const { store } = setup(storage);

    store.addElement(textEl('el_1'));
    TestBed.tick();
    vi.runAllTimers();
    expect(storage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();

    store.markClean();
    TestBed.tick();
    vi.runAllTimers();
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('discards a corrupt draft on startup instead of crashing', () => {
    const storage = createMemoryStorage();
    storage.setItem(DRAFT_STORAGE_KEY, '{ not json ]');

    const { store } = setup(storage);

    expect(store.dirty()).toBe(false);
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  describe('confirmDiscard', () => {
    it('allows the action without prompting when the document is clean', () => {
      const { service } = setup(createMemoryStorage());
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

      expect(service.confirmDiscard()).toBe(true);
      expect(confirm).not.toHaveBeenCalled();
    });

    it('prompts when dirty and honors the answer', () => {
      const { service, store } = setup(createMemoryStorage());
      store.addElement(textEl('el_1'));

      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      expect(service.confirmDiscard()).toBe(false);

      confirm.mockReturnValue(true);
      expect(service.confirmDiscard()).toBe(true);
    });
  });

  describe('newDocument', () => {
    it('resets to an empty document when discard is confirmed', () => {
      const { service, store } = setup(createMemoryStorage());
      store.addElement(textEl('el_1'));
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      service.newDocument();

      expect(store.bodyElements()).toHaveLength(0);
      expect(store.dirty()).toBe(false);
    });

    it('keeps the document when discard is declined', () => {
      const { service, store } = setup(createMemoryStorage());
      store.addElement(textEl('el_1'));
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      service.newDocument();

      expect(store.bodyElements()).toHaveLength(1);
    });
  });

  describe('beforeunload guard', () => {
    it('prevents unload while the document is dirty', () => {
      const { store } = setup(createMemoryStorage());
      store.addElement(textEl('el_1'));

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('allows unload when the document is clean', () => {
      setup(createMemoryStorage());

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });
});
