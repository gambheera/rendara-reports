import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/angular';
import { ReportRenderer } from './report-renderer';

describe('ReportRenderer', () => {
  it('renders its placeholder content', async () => {
    await render(ReportRenderer);

    expect(screen.getByText('ReportRenderer works!')).toBeTruthy();
  });
});
