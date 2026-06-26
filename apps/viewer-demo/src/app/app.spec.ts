import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/angular';
import { App } from './app';

/** Waits for the viewer's async pipeline (resolution is a microtask) to settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Viewer demo App', () => {
  it('renders the host shell heading', async () => {
    await render(App);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Rendara Reports — Viewer demo host',
    );
  });

  it('renders the sample report as a multi-page document (template validates)', async () => {
    const { container, fixture } = await render(App);
    await flush();
    fixture.detectChanges();

    // The status appears only once the pipeline validated + paginated the sample,
    // so this guards the inline demo template against schema drift.
    const status = container.querySelector('.rdr-viewer-status')?.textContent?.trim() ?? '';
    expect(status).toMatch(/^Page 1 of \d+$/);
    expect(Number(status.match(/of (\d+)/)?.[1] ?? '0')).toBeGreaterThan(1);
  });
});
