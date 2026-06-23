/**
 * Golden render-fixture composition (E4-S1, content in E4-S2) — the single
 * source for the static HTML that the visual-regression harness snapshots.
 *
 * e2e/visual projects may not import workspace libs (Nx module boundaries), so
 * the pages are pre-rendered here — where importing the engine, schema goldens
 * and the renderer's own serializer is legal — into committed HTML artifacts
 * (`tools/generate-render-fixtures.ts`) that the visual specs load via `fs`.
 * {@link golden-page-html.spec.ts} regenerates these strings and fails if a
 * committed artifact drifts, mirroring the golden-JSON drift guard (E1-S8).
 *
 * Not part of the renderer's public API (absent from `index.ts`): a fixture
 * builder for tests/tooling, kept beside the renderer so it shares the exact same
 * view-model and serializer the component uses.
 *
 * Two fixtures:
 *  - **certificate** — the document-first golden (text + shapes + images), with
 *    its data bindings resolved so the snapshot shows real content.
 *  - **element-types** — a compact per-type page (text, line, rect, ellipse,
 *    image) satisfying the story QA "per-type visual snapshots", using an inline
 *    data-URI image so it renders deterministically without the network.
 */

import { goldenCertificateTemplate, type RendaraTemplate } from '@rendara/report-schema';
import { paginate } from '@rendara/report-engine';

import { buildPageViewModel } from './page-view-model';
import { serializePageToHtml } from './serialize-page-html';

/** Zoom that fits the A4-landscape certificate sheet within the harness viewport. */
export const CERTIFICATE_FIXTURE_ZOOM = 0.55;

/** Zoom for the compact per-type page (A4 portrait), sized to the harness viewport. */
export const ELEMENT_TYPES_FIXTURE_ZOOM = 0.75;

/**
 * The certificate golden's data-bound text, as the engine's `resolveElement`
 * resolves it over `goldenCertificateData` (recipient/course/issuer/signatory as
 * strings, the completion date via `date:long` in the default en-US/UTC locale).
 *
 * These are supplied as constants rather than computed here on purpose: the
 * fixture generator runs under the node/swc runtime where JSONata's import is
 * broken, so resolving in the generator would silently blank every binding. The
 * real `resolveElement` path is exercised by the renderer's unit/component specs
 * (which run under vitest, where JSONata works) — see `page-view-model.spec.ts`.
 */
const CERTIFICATE_RESOLVED_VALUES: ReadonlyMap<string, string> = new Map([
  ['el_cert_recipient', 'Jane A. Smith'],
  ['el_cert_course', 'Advanced Report Design'],
  ['el_cert_date', 'June 17, 2026'],
  ['el_cert_signatory', 'Dr. A. Turing, Director'],
  ['el_cert_seal_label', 'Rendara Academy'],
]);

/**
 * Renders the certificate golden's first page to the static
 * `<div class="rdr-page">…</div>` HTML snapshotted by the visual harness, with
 * its data-bound text filled from {@link CERTIFICATE_RESOLVED_VALUES}.
 * Deterministic.
 */
export function renderCertificatePageHtml(): string {
  const doc = paginate(goldenCertificateTemplate, new Map());
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
    zoom: CERTIFICATE_FIXTURE_ZOOM,
    template: goldenCertificateTemplate,
    resolvedValues: CERTIFICATE_RESOLVED_VALUES,
  });
  return serializePageToHtml(vm);
}

/**
 * Renders the compact per-type page (one of each fixed element type) to its
 * static HTML. Fully static content, so synchronous and deterministic.
 */
export function renderElementTypesPageHtml(): string {
  const doc = paginate(elementTypesTemplate, new Map());
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
    zoom: ELEMENT_TYPES_FIXTURE_ZOOM,
    template: elementTypesTemplate,
  });
  return serializePageToHtml(vm);
}

/**
 * A tiny opaque 2×1 PNG (one indigo, one slate pixel) as a data URI, so the
 * per-type fixture's image renders crisply and deterministically with no network.
 */
const SAMPLE_IMAGE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFklEQVR4nGNUbpL5z4AEmBhwAEIyAGOcAhpfRrShAAAAAElFTkSuQmCC';

/**
 * A compact A4-portrait page with exactly one of each fixed element type, in a
 * neat vertical stack, exercising the E4-S2 renderers: a styled text block, a
 * horizontal rule (line), a filled+stroked rectangle, a filled+stroked ellipse,
 * and a (data-URI) image. All content is static, so no data is needed.
 */
const elementTypesTemplate: RendaraTemplate = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'Element Types',
    id: 'fixture-element-types-0001',
    createdAt: '2026-06-17T00:00:00.000Z',
    locale: 'en-US',
  },
  page: {
    size: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
    units: 'mm',
    defaultFont: { family: 'Inter', sizePt: 12 },
    background: null,
  },
  header: { elements: [] },
  body: {
    elements: [
      {
        id: 'el_et_text',
        type: 'text',
        frame: { xMm: 15, yMm: 20, wMm: 180, hMm: 16 },
        text: 'Element renderers — text, shapes, image',
        style: {
          font: { family: 'Inter', sizePt: 18, weight: 'bold', style: 'normal' },
          color: '#4F46E5',
          align: { horizontal: 'center', vertical: 'middle' },
        },
        z: 1,
      },
      {
        id: 'el_et_line',
        type: 'shape',
        shape: 'line',
        frame: { xMm: 15, yMm: 42, wMm: 180, hMm: 0 },
        style: { stroke: { color: '#94A3B8', widthMm: 0.4, style: 'solid' } },
        z: 1,
      },
      {
        id: 'el_et_rect',
        type: 'shape',
        shape: 'rect',
        frame: { xMm: 15, yMm: 50, wMm: 80, hMm: 40 },
        style: {
          fill: '#EEF2FF',
          stroke: { color: '#4F46E5', widthMm: 0.6, style: 'solid' },
        },
        z: 1,
      },
      {
        id: 'el_et_ellipse',
        type: 'shape',
        shape: 'ellipse',
        frame: { xMm: 115, yMm: 50, wMm: 80, hMm: 40 },
        style: {
          fill: '#FEF3C7',
          stroke: { color: '#B45309', widthMm: 0.8, style: 'dashed' },
        },
        z: 1,
      },
      {
        id: 'el_et_image',
        type: 'image',
        frame: { xMm: 15, yMm: 100, wMm: 60, hMm: 30 },
        src: SAMPLE_IMAGE_DATA_URI,
        fit: 'fill',
        z: 1,
      },
    ],
  },
  footer: { elements: [] },
};
