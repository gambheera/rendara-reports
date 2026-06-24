import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/angular';
import { App } from './app';

describe('Designer App', () => {
  it('mounts the four-zone designer shell', async () => {
    await render(App);

    // The shell stands up all four landmarks (banner / main / complementary x2 /
    // contentinfo); asserting the canonical zones proves the root wires it in.
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main', { name: 'Report canvas' })).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getByText('Rendara')).toBeTruthy();
  });
});
