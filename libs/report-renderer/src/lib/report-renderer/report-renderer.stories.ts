import type { Meta, StoryObj } from '@storybook/angular';
import { goldenCertificateTemplate } from '@rendara/report-schema';
import { paginate } from '@rendara/report-engine';

import { ReportRenderer } from './report-renderer';

/**
 * E4-S1 single-page renderer stories. They mount real rendered output: the
 * certificate golden paginated by the engine, rendered as an absolutely
 * positioned page sheet at a chosen zoom. Element content (text/shape/image)
 * arrives in E4-S2, so boxes are positioned host frames for now.
 */
const certificate = paginate(goldenCertificateTemplate, new Map());

const meta: Meta<ReportRenderer> = {
  title: 'report-renderer/ReportRenderer',
  component: ReportRenderer,
  tags: ['autodocs'],
  args: {
    page: certificate.pages[0],
    geometry: certificate.geometry,
    zoom: 0.6,
    background: null,
  },
};

export default meta;

type Story = StoryObj<ReportRenderer>;

/** The certificate page at 60% zoom. */
export const Certificate: Story = {};

/** A tinted page background. */
export const TintedBackground: Story = {
  args: { background: '#fafaf5' },
};
