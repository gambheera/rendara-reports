import type { Meta, StoryObj } from '@storybook/angular';
import { goldenCertificateTemplate } from '@rendara/report-schema';
import { paginate } from '@rendara/report-engine';

import { ReportRenderer } from './report-renderer';

/**
 * E4-S1 single-page renderer stories, with E4-S2 content. They mount real
 * rendered output: the certificate golden paginated by the engine, rendered as an
 * absolutely positioned page sheet at a chosen zoom, with each element's text,
 * shapes and image painted. Data-bound text is supplied via `resolvedValues`
 * (the engine resolves bindings upstream); here the certificate's fixed values.
 */
const certificate = paginate(goldenCertificateTemplate, new Map());

/** The certificate golden's resolved data-bound text (see the brief's fixed sample). */
const certificateValues = new Map<string, string>([
  ['el_cert_recipient', 'Jane A. Smith'],
  ['el_cert_course', 'Advanced Report Design'],
  ['el_cert_date', 'June 17, 2026'],
  ['el_cert_signatory', 'Dr. A. Turing, Director'],
  ['el_cert_seal_label', 'Rendara Academy'],
]);

const meta: Meta<ReportRenderer> = {
  title: 'report-renderer/ReportRenderer',
  component: ReportRenderer,
  tags: ['autodocs'],
  args: {
    page: certificate.pages[0],
    geometry: certificate.geometry,
    template: goldenCertificateTemplate,
    resolvedValues: certificateValues,
    zoom: 0.6,
    background: null,
  },
};

export default meta;

type Story = StoryObj<ReportRenderer>;

/** The certificate page at 60% zoom, with text, shapes and image rendered. */
export const Certificate: Story = {};

/** A tinted page background. */
export const TintedBackground: Story = {
  args: { background: '#fafaf5' },
};
