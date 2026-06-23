/**
 * Golden render-fixture composition (E4-S1) — the single source for the static
 * HTML that the visual-regression harness snapshots.
 *
 * e2e/visual projects may not import workspace libs (Nx module boundaries), so
 * the certificate page is pre-rendered here — where importing the engine, schema
 * goldens and the renderer's own serializer is legal — into a committed HTML
 * artifact (`tools/generate-render-fixtures.ts`) that the visual spec loads via
 * `fs`. {@link golden-page-html.spec.ts} regenerates this string and fails if the
 * committed artifact drifts, mirroring the golden-JSON drift guard (E1-S8).
 *
 * It is **not** part of the renderer's public API (absent from `index.ts`): it is
 * a fixture builder for tests/tooling, kept beside the renderer so it shares the
 * exact same view-model and serializer the component uses.
 *
 * At E4-S1 the serialized page is positioned host boxes only — element content
 * (text/shape/image) is E4-S2, which enriches the same artifact.
 */

import { goldenCertificateTemplate } from '@rendara/report-schema';
import { paginate } from '@rendara/report-engine';

import { buildPageViewModel } from './page-view-model';
import { serializePageToHtml } from './serialize-page-html';

/** Zoom that fits the A4-landscape certificate sheet within the harness viewport. */
export const CERTIFICATE_FIXTURE_ZOOM = 0.55;

/**
 * Renders the certificate golden's first page to the static `<div class="rdr-page">…</div>`
 * HTML string snapshotted by the visual harness. Pure and deterministic.
 */
export function renderCertificatePageHtml(): string {
  const doc = paginate(goldenCertificateTemplate, new Map());
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
    zoom: CERTIFICATE_FIXTURE_ZOOM,
  });
  return serializePageToHtml(vm);
}
