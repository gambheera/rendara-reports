import type { Meta, StoryObj } from '@storybook/angular';

import { ReportViewer } from './report-viewer';

/**
 * Example story (E0-S6). `report-viewer` is still the E0-S2 skeleton (it renders
 * the shared renderer). This story proves the per-project Storybook host renders
 * it. The real `<rdr-report-viewer>` public API (toolbar, inputs/outputs) is
 * documented here from Epics 7-9.
 */
const meta: Meta<ReportViewer> = {
  title: 'report-viewer/ReportViewer',
  component: ReportViewer,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<ReportViewer>;

export const Default: Story = {};
