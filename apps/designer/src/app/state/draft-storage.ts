/**
 * Local draft storage (E6-S11) — the pure, Angular-free bridge between the
 * designer's in-memory document and the browser's `localStorage`, so a reload
 * restores the author's unsaved work.
 *
 * This module is **designer-app only** by design (story QA: "no browser-storage
 * in any published lib"). It is also framework-free and takes its {@link Storage}
 * as an argument, so it is exhaustively unit-testable with an in-memory fake and
 * the Angular service owns only the wiring (which `Storage`, when to call).
 *
 * Both directions reuse the versioned-contract machinery via `template-io`:
 * - **Save** serializes the current {@link RendaraTemplate} compactly (drafts are
 *   machine-read, not eyeballed) and writes it under {@link DRAFT_STORAGE_KEY}.
 * - **Load** runs the stored text back through {@link importTemplate} — parse →
 *   migrate → validate — so a draft written by an older schema is migrated forward
 *   and a corrupt one is rejected rather than crashing the designer on startup.
 *
 * Every `localStorage` access is wrapped: it can throw (private-mode denial,
 * quota, disabled storage). Autosave is a best-effort safety net, so failures are
 * swallowed — the worst case is the draft is not persisted, never a broken app.
 */

import type { RendaraTemplate } from '@rendara/report-schema';
import { importTemplate, serializeTemplate, type ImportTemplateResult } from './template-io';

/**
 * The `localStorage` key the draft lives under. Versioned (`.v1`) so a future
 * change to what we persist can move to a new key without colliding with — or
 * misreading — drafts written by an older designer build.
 */
export const DRAFT_STORAGE_KEY = 'rendara.designer.draft.v1';

/** Reads the raw draft string, or `null` when absent or storage is unavailable. */
export function readRawDraft(storage: Storage): string | null {
  try {
    return storage.getItem(DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Writes the raw draft string (best-effort; quota/denial errors are swallowed). */
export function writeRawDraft(storage: Storage, text: string): void {
  try {
    storage.setItem(DRAFT_STORAGE_KEY, text);
  } catch {
    // Storage can be full or denied (private mode); autosave is best-effort.
  }
}

/** Removes the draft (best-effort). Used when the document returns to a clean state. */
export function clearRawDraft(storage: Storage): void {
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Ignore — clearing a draft that cannot be reached is harmless.
  }
}

/**
 * Loads and validates the persisted draft (E6-S11), or `null` when none is stored.
 * The stored text is fed through the full {@link importTemplate} pipeline, so the
 * outcome carries the same `{ ok, template, migrated, fromVersion }` / `{ ok:false,
 * errors }` shape the import dialog uses: an older draft is migrated forward, and a
 * corrupt one comes back as `{ ok: false }` for the caller to discard.
 */
export function loadDraftTemplate(storage: Storage): ImportTemplateResult | null {
  const raw = readRawDraft(storage);
  if (raw === null) return null;
  return importTemplate(raw);
}

/**
 * Persists `template` as the current draft (E6-S11). Serialized compactly (drafts
 * are not read by humans), reusing the same `serializeTemplate` the export path
 * uses so the draft is byte-for-byte a valid Template JSON file.
 */
export function saveDraftTemplate(storage: Storage, template: RendaraTemplate): void {
  writeRawDraft(storage, serializeTemplate(template, { prettyPrint: false }));
}
