import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/angular';
import { ReportViewer } from './report-viewer';

describe('ReportViewer', () => {
  it('renders the shared renderer it composes', async () => {
    await render(ReportViewer);

    // The skeleton viewer embeds <rdr-report-renderer>, so its placeholder
    // content proves the viewer -> renderer composition renders.
    expect(screen.getByText('ReportRenderer works!')).toBeTruthy();
  });
});
