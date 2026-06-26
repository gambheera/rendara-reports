import type { Meta, StoryObj } from '@storybook/angular';

import { ReportViewer } from './report-viewer';

/**
 * `report-viewer` now carries its **public component API** (E7-S1): the brief-§8
 * inputs (`template`, `data`, `config`, `theme`) and outputs (`rendered`,
 * `pageChange`, `error`). The body still paints a neutral placeholder page — the
 * validate -> bind -> paginate -> render pipeline lands in E7-S2 — so these
 * stories document the API contract via autodocs rather than a live report.
 */
const meta: Meta<ReportViewer> = {
  title: 'report-viewer/ReportViewer',
  component: ReportViewer,
  tags: ['autodocs'],
  argTypes: {
    template: {
      description:
        'A validated RendaraTemplate or a raw JSON string. `null` shows the empty state.',
      control: false,
    },
    data: { description: 'Arbitrary host JSON bound into the template.', control: false },
    config: {
      description: 'Runtime config: locale, initialZoom, toolbar, watermark, pageMode.',
      control: 'object',
    },
    theme: {
      description: 'CSS custom-property (`--rdr-*`) overrides applied to the viewer host.',
      control: 'object',
    },
    rendered: { description: 'Emits `{ pageCount }` once a render completes (E7-S2).' },
    pageChange: { description: 'Emits `{ current, total }` on page change (E7-S3).' },
    error: { description: 'Emits a surfaced validation/binding/render failure (E7-S5).' },
  },
};

export default meta;

type Story = StoryObj<ReportViewer>;

export const Default: Story = {};

export const Themed: Story = {
  args: {
    theme: { '--rdr-accent': '#4f46e5' },
    config: { initialZoom: 'fit-width', pageMode: 'continuous' },
  },
};
