import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/angular';
import { App } from './app';

describe('Viewer demo App', () => {
  it('renders the host shell heading', async () => {
    await render(App);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Rendara Reports — Viewer demo host',
    );
  });
});
