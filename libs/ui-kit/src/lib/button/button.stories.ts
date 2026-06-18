import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';

import { Button } from './button';

/**
 * The first token-driven `ui-kit` component (E0-S8). Flip the **theme** toolbar
 * (light/dark) to see the same component repaint purely from `--rdr-*` tokens.
 */
const meta: Meta<Button> = {
  title: 'ui-kit/Button',
  component: Button,
  decorators: [moduleMetadata({ imports: [Button] })],
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'ghost'],
    },
  },
  render: (args) => ({
    props: args,
    template: `<button rdr-button [variant]="variant">Create new report</button>`,
  }),
};

export default meta;

type Story = StoryObj<Button>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost' } };

export const Disabled: Story = {
  args: { variant: 'primary' },
  render: (args) => ({
    props: args,
    template: `<button rdr-button [variant]="variant" disabled>Disabled</button>`,
  }),
};

/** All variants side by side — mirrors the style-guide "Actions" gallery. */
export const Gallery: Story = {
  render: () => ({
    template: `
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <button rdr-button variant="primary">Primary</button>
        <button rdr-button variant="secondary">Secondary</button>
        <button rdr-button variant="ghost">Ghost</button>
        <button rdr-button variant="primary" disabled>Disabled</button>
      </div>`,
  }),
};
