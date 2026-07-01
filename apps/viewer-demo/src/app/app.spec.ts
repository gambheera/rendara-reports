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

  it('surfaces the (rendered) and (pageChange) outputs from the wired viewer', async () => {
    const { fixture } = await render(App);
    await flush();
    fixture.detectChanges();

    // `(rendered)` fires once pagination completes; `(pageChange)` fires for the
    // initial page too (brief §8). The host surfaces both into the event log.
    const rendered = screen.getByTestId('evt-rendered').textContent?.trim() ?? '';
    expect(rendered).toMatch(/^pageCount \d+$/);
    expect(Number(rendered.match(/pageCount (\d+)/)?.[1] ?? '0')).toBeGreaterThan(1);

    expect(screen.getByTestId('evt-pagechange').textContent?.trim() ?? '').toMatch(
      /^current 1 of \d+$/,
    );
    expect(screen.getByTestId('evt-error').textContent?.trim()).toBe('—');
  });

  it('applies the [theme] override to the viewer host when toggled (E9-S5)', async () => {
    const { container, fixture } = await render(App);
    await flush();
    fixture.detectChanges();

    const viewer = container.querySelector<HTMLElement>('rdr-report-viewer');
    expect(viewer).not.toBeNull();

    // Default: no theme override on the host element.
    expect(viewer?.style.getPropertyValue('--rdr-viewer-backdrop')).toBe('');

    // Toggle the dark theme: the --rdr-viewer-* overrides land as host inline
    // styles (the viewer's [theme] input → host [style] binding).
    screen.getByRole('button', { name: 'Use dark theme' }).click();
    fixture.detectChanges();

    expect(viewer?.style.getPropertyValue('--rdr-viewer-backdrop')).toBe('#0f172a');
    expect(viewer?.style.getPropertyValue('--rdr-viewer-accent')).toBe('#818cf8');

    // Toggle back: the override is removed, restoring the design-system defaults.
    screen.getByRole('button', { name: 'Use default theme' }).click();
    fixture.detectChanges();

    expect(viewer?.style.getPropertyValue('--rdr-viewer-backdrop')).toBe('');
  });

  it('surfaces the (error) output for an invalid template and recovers', async () => {
    const { container, fixture } = await render(App);
    await flush();
    fixture.detectChanges();

    // Swap in a schema-invalid template: the viewer surfaces a validation error
    // (never throws) and the host shows it in the event log.
    screen.getByRole('button', { name: 'Load invalid template' }).click();
    await flush();
    fixture.detectChanges();

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    const error = screen.getByTestId('evt-error').textContent?.trim() ?? '';
    expect(error).toMatch(/^validation: Template failed validation:/);
    expect(screen.getByTestId('evt-rendered').textContent?.trim()).toBe('—');

    // Restoring the valid sample re-renders and clears the error.
    screen.getByRole('button', { name: 'Load sample' }).click();
    await flush();
    fixture.detectChanges();

    expect(screen.getByTestId('evt-error').textContent?.trim()).toBe('—');
    expect(screen.getByTestId('evt-rendered').textContent?.trim() ?? '').toMatch(/^pageCount \d+$/);
  });
});
