import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  goldenInvoiceTemplate,
  type RendaraTemplate,
} from '@rendara/report-schema';
import {
  DRAFT_STORAGE_KEY,
  clearRawDraft,
  loadDraftTemplate,
  readRawDraft,
  saveDraftTemplate,
  writeRawDraft,
} from './draft-storage';

/** A minimal in-memory {@link Storage} for exercising the pure draft helpers. */
function fakeStorage(seed?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

/** A {@link Storage} whose every access throws — private mode / quota / denial. */
function throwingStorage(): Storage {
  const fail = (): never => {
    throw new DOMException('denied', 'SecurityError');
  };
  return {
    get length(): number {
      return fail();
    },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

describe('draft-storage raw access', () => {
  it('writes and reads back the raw draft under the versioned key', () => {
    const storage = fakeStorage();
    writeRawDraft(storage, 'hello');
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBe('hello');
    expect(readRawDraft(storage)).toBe('hello');
  });

  it('returns null when no draft is stored', () => {
    expect(readRawDraft(fakeStorage())).toBeNull();
  });

  it('clears the draft', () => {
    const storage = fakeStorage({ [DRAFT_STORAGE_KEY]: 'hello' });
    clearRawDraft(storage);
    expect(readRawDraft(storage)).toBeNull();
  });

  it('swallows storage errors (best-effort persistence)', () => {
    const storage = throwingStorage();
    expect(() => writeRawDraft(storage, 'x')).not.toThrow();
    expect(() => clearRawDraft(storage)).not.toThrow();
    expect(readRawDraft(storage)).toBeNull();
  });
});

describe('saveDraftTemplate / loadDraftTemplate', () => {
  it('round-trips a template through storage', () => {
    const storage = fakeStorage();
    saveDraftTemplate(storage, goldenInvoiceTemplate);

    const result = loadDraftTemplate(storage);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.template).toEqual(goldenInvoiceTemplate);
    expect(result.migrated).toBe(false);
    expect(result.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('persists a compact (single-line) draft', () => {
    const storage = fakeStorage();
    saveDraftTemplate(storage, goldenInvoiceTemplate);
    expect(storage.getItem(DRAFT_STORAGE_KEY)).not.toContain('\n');
  });

  it('returns null when there is no draft to load', () => {
    expect(loadDraftTemplate(fakeStorage())).toBeNull();
  });

  it('migrates an older draft forward on load', () => {
    const legacy = {
      ...structuredClone(goldenInvoiceTemplate),
      schemaVersion: '0.9.0',
    } as Record<string, unknown>;
    delete legacy['header'];
    delete legacy['footer'];
    const storage = fakeStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(legacy) });

    const result = loadDraftTemplate(storage);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.migrated).toBe(true);
    expect(result.template.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('reports failure for a corrupt draft rather than throwing', () => {
    const storage = fakeStorage({ [DRAFT_STORAGE_KEY]: '{ not json ]' });
    const result = loadDraftTemplate(storage);
    expect(result?.ok).toBe(false);
  });

  it('does not throw when storage write is denied', () => {
    const writeSpy = vi.fn(() => {
      throw new Error('quota');
    });
    const storage = { ...fakeStorage(), setItem: writeSpy } as unknown as Storage;
    const template: RendaraTemplate = goldenInvoiceTemplate;
    expect(() => saveDraftTemplate(storage, template)).not.toThrow();
    expect(writeSpy).toHaveBeenCalled();
  });
});
