import type { RendaraTemplate } from '@rendara/report-schema';

import { ensureExtension, slugifyFilename } from './filename';

/**
 * Pure helpers behind the viewer's **Download source** action (E8-S5).
 *
 * The action lets a viewer user save the report's *source* — its validated
 * {@link RendaraTemplate} (the schema contract, brief §5) — as a JSON file. The
 * payload is the canonical, pretty-printed serialisation of the template the
 * pipeline rendered, so re-importing it yields an equivalent template (the
 * schema round-trip the DoD requires). Keeping the serialisation and filename
 * logic here, framework-free, makes both trivially unit-testable.
 */

/** Pretty-prints a validated template to its canonical source JSON (2-space indent). */
export function serializeTemplateSource(template: RendaraTemplate): string {
  return JSON.stringify(template, null, 2);
}

/**
 * The download filename for the source JSON: the host's configured
 * `config.sourceFilename` if set, else a slug of the document title, else
 * `report` — always ending in `.json`.
 */
export function sourceFilename(title: string, configured: string | undefined): string {
  const base = configured ?? slugifyFilename(title) ?? 'report';
  return ensureExtension(base, '.json');
}
