import type { Meta, StoryObj } from '@storybook/angular';

import { ReportRenderer } from './report-renderer';

/**
 * Example story (E0-S6). `report-renderer` is still the E0-S2 skeleton; this
 * story proves the per-project Storybook host renders it. The real
 * template+data -> paginated DOM renderer (with design/view modes) arrives in
 * Epic 4, where stories mount real rendered output.
 */
const meta: Meta<ReportRenderer> = {
  title: 'report-renderer/ReportRenderer',
  component: ReportRenderer,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<ReportRenderer>;

export const Default: Story = {};
