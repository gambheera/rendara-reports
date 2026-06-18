import type { Meta, StoryObj } from '@storybook/html-vite';

/**
 * Landing page for the composition host. The library Storybooks appear in the
 * sidebar as composed refs (UI Kit / Report Renderer / Report Viewer); this
 * single local story exists only because Storybook requires a host to have at
 * least one local stories entry.
 */
const meta: Meta = {
  title: 'Welcome',
  render: () => `
    <main style="font-family: system-ui, sans-serif; max-width: 42rem; padding: 2rem; line-height: 1.6;">
      <h1 style="margin-bottom: 0.25rem;">Rendara Reports — Storybook</h1>
      <p style="color: #4b5563;">
        Composition host. The component libraries are aggregated in the sidebar:
      </p>
      <ul>
        <li><strong>UI Kit</strong> — designer-only shared UI</li>
        <li><strong>Report Renderer</strong> — the shared template &rarr; DOM renderer</li>
        <li><strong>Report Viewer</strong> — the publishable viewer component</li>
      </ul>
      <p style="color: #4b5563;">
        Each lib also runs standalone via <code>nx storybook &lt;lib&gt;</code>.
      </p>
    </main>
  `,
};

export default meta;

type Story = StoryObj;

export const Welcome: Story = {};
