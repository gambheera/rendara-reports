import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/angular';
import { App } from './app';

describe('Designer App', () => {
  it('renders the designer shell heading', async () => {
    await render(App);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Rendara Reports — Designer',
    );
  });

  it('surfaces the schema contract version it targets', async () => {
    await render(App);

    expect(screen.getByText(/Schema contract: 1\.0\.0/)).toBeTruthy();
  });
});
