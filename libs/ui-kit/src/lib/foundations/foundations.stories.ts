import type { Meta, StoryObj } from '@storybook/angular';

/**
 * Visual reference for the `--rdr-*` design-token contract (E0-S8), mirroring
 * the `style_guide` mockup (color palette + type scale). These stories render
 * tokens directly via `var(--rdr-*)`, so the **theme** toolbar (light/dark)
 * shows the surface/text ramp inverting while the indigo accent holds — the
 * story-specific QA for this story.
 */
const meta: Meta = {
  title: 'ui-kit/Foundations',
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj;

const swatch = (label: string, varName: string, border = false) => `
  <div style="display:flex; flex-direction:column; gap:6px;">
    <div style="height:56px; border-radius:var(--rdr-radius-panel);
                background:var(${varName});
                ${border ? 'border:1px solid var(--rdr-color-border-hairline);' : ''}
                box-shadow:var(--rdr-elevation-1);"></div>
    <div style="font:var(--rdr-font-weight-medium) var(--rdr-font-size-label)/var(--rdr-line-height-label) var(--rdr-font-ui); color:var(--rdr-color-text-primary);">${label}</div>
    <code style="font:var(--rdr-font-size-caption)/var(--rdr-line-height-caption) var(--rdr-font-mono); color:var(--rdr-color-text-secondary);">${varName}</code>
  </div>`;

/** Surface, text, accent and semantic swatches. */
export const Colors: Story = {
  render: () => ({
    template: `
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:16px;">
        ${swatch('Surface', '--rdr-color-surface', true)}
        ${swatch('Recessed', '--rdr-color-recessed', true)}
        ${swatch('Backdrop', '--rdr-color-backdrop', true)}
        ${swatch('Accent', '--rdr-color-accent')}
        ${swatch('Accent hover', '--rdr-color-accent-hover')}
        ${swatch('Accent subtle', '--rdr-color-accent-subtle', true)}
        ${swatch('Success', '--rdr-color-success')}
        ${swatch('Warning', '--rdr-color-warning')}
        ${swatch('Danger', '--rdr-color-danger')}
      </div>`,
  }),
};

/** The type scale, from title down to caption, in the UI font. */
export const Typography: Story = {
  render: () => ({
    template: `
      <div style="display:flex; flex-direction:column; gap:16px; color:var(--rdr-color-text-primary); font-family:var(--rdr-font-ui);">
        <div style="font-size:var(--rdr-font-size-title); line-height:var(--rdr-line-height-title); font-weight:var(--rdr-font-weight-semibold);">Title · 20 / 600</div>
        <div style="font-size:var(--rdr-font-size-section); line-height:var(--rdr-line-height-body); font-weight:var(--rdr-font-weight-semibold);">Section header · 14 / 600</div>
        <div style="font-size:var(--rdr-font-size-body); line-height:var(--rdr-line-height-body); font-weight:var(--rdr-font-weight-regular);">Body &amp; inputs · 14 / 400</div>
        <div style="font-size:var(--rdr-font-size-label); line-height:var(--rdr-line-height-label); font-weight:var(--rdr-font-weight-medium); color:var(--rdr-color-text-secondary);">Dense label · 13 / 500</div>
        <div style="font-size:var(--rdr-font-size-caption); line-height:var(--rdr-line-height-caption); font-weight:var(--rdr-font-weight-medium); color:var(--rdr-color-text-secondary);">Caption · 12 / 500</div>
        <code style="font-family:var(--rdr-font-mono); font-size:var(--rdr-font-size-label); font-variant-numeric:var(--rdr-font-numeric); color:var(--rdr-color-text-primary);">$sum(invoice.lineItems.amount) · 1,234.50</code>
      </div>`,
  }),
};
