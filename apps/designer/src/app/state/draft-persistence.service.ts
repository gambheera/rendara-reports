import { DestroyRef, Injectable, InjectionToken, effect, inject } from '@angular/core';
import type { RendaraTemplate } from '@rendara/report-schema';
import { DesignerStore } from './designer-store';
import { clearRawDraft, loadDraftTemplate, saveDraftTemplate } from './draft-storage';

/** Debounce window (ms) before an edit is flushed to local storage. */
const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * A minimal in-memory {@link Storage} used when `localStorage` is unavailable —
 * during SSR/prerender (no `window`) or when a browser denies storage. It keeps
 * autosave a no-throw best-effort path: writes simply have no persistence.
 */
export function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
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

/**
 * The {@link Storage} the draft is persisted to (E6-S11). Resolves to the real
 * `localStorage` in the browser and to an in-memory fallback otherwise (SSR /
 * storage denied), keeping the persistence layer SSR-safe. Tests override this
 * provider with a fake to drive the service deterministically.
 */
export const DRAFT_STORAGE = new InjectionToken<Storage>('DRAFT_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch {
      // Accessing `localStorage` can itself throw (e.g. sandboxed iframes).
    }
    return createMemoryStorage();
  },
});

/**
 * Draft persistence & file UX (E6-S11) — the designer-app-only layer that keeps
 * the author's work safe across reloads and guards against accidental loss.
 *
 * Three responsibilities, all confined to `apps/designer` (story QA: no
 * browser-storage in any published lib):
 *
 * 1. **Restore on startup.** Any persisted draft is loaded through the validating
 *    {@link loadDraftTemplate} pipeline. A valid (possibly migrated) draft is
 *    loaded into the store and the document is marked **dirty** — restored work has
 *    not been saved to a file, so it should drive the "unsaved changes" status and
 *    the navigation guard. A corrupt draft is discarded.
 * 2. **Autosave.** A single {@link effect} mirrors the document to storage with one
 *    symmetric rule: while the document is **dirty**, every change is written
 *    (debounced, so a drag does not hammer storage); when it returns to **clean**
 *    (New / Open / Save), the draft is cleared. So storage always reflects exactly
 *    the unsaved work — and nothing when there is none.
 * 3. **Navigation guard.** A `beforeunload` listener prompts the browser's native
 *    "leave site?" dialog while the document is dirty, and {@link confirmDiscard}
 *    backs the in-app destructive actions (New, Import) with a confirmation.
 *
 * The service is `providedIn: 'root'` and constructed at app bootstrap (the root
 * component injects it), so restore and autosave are live for the whole session.
 */
@Injectable({ providedIn: 'root' })
export class DraftPersistenceService {
  private readonly store = inject(DesignerStore);
  private readonly storage = inject(DRAFT_STORAGE);
  private readonly destroyRef = inject(DestroyRef);

  /** Pending debounced autosave timer, or `null` when none is scheduled. */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.restoreDraft();

    // One rule drives the draft: dirty → persist (debounced); clean → clear.
    effect(() => {
      const template = this.store.template();
      if (this.store.dirty()) {
        this.scheduleSave(template);
      } else {
        this.cancelPendingSave();
        clearRawDraft(this.storage);
      }
    });

    this.registerUnloadGuard();
  }

  /**
   * Returns `true` when it is safe to discard the current document — either it has
   * no unsaved changes, or the author confirms the loss. Backs the destructive
   * file actions (New, Import). Uses the native `confirm` so it is dependency-free
   * and synchronous; absent a `window` (SSR) it allows the action.
   */
  confirmDiscard(): boolean {
    if (!this.store.dirty()) return true;
    if (typeof window === 'undefined') return true;
    return window.confirm('You have unsaved changes that will be lost. Continue?');
  }

  /**
   * Starts a fresh, empty document (E6-S11) after the unsaved-changes guard. The
   * store reset returns the document to a clean state, which the autosave effect
   * observes and clears the draft for.
   */
  newDocument(): void {
    if (!this.confirmDiscard()) return;
    this.store.resetDocument();
  }

  /** Loads + validates any persisted draft, restoring it as unsaved work. */
  private restoreDraft(): void {
    const result = loadDraftTemplate(this.storage);
    if (result === null) return;
    if (!result.ok) {
      // A corrupt or unmigratable draft is dropped so it cannot wedge startup.
      clearRawDraft(this.storage);
      return;
    }
    this.store.loadTemplate(result.template);
    this.store.markDirty();
  }

  /** Debounces a draft write so rapid edits (a drag) flush once, not per frame. */
  private scheduleSave(template: RendaraTemplate): void {
    this.cancelPendingSave();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      saveDraftTemplate(this.storage, template);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  /** Cancels any scheduled draft write. */
  private cancelPendingSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * Registers the `beforeunload` guard: while the document is dirty, the browser
   * shows its native "leave site?" prompt so a reload/close/navigation cannot
   * silently drop unsaved work. Removed on service destroy.
   */
  private registerUnloadGuard(): void {
    if (typeof window === 'undefined') return;
    const handler = (event: BeforeUnloadEvent): void => {
      if (!this.store.dirty()) return;
      event.preventDefault();
      // Legacy Chrome requires a returnValue to trigger the prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    this.destroyRef.onDestroy(() => {
      this.cancelPendingSave();
      window.removeEventListener('beforeunload', handler);
    });
  }
}
