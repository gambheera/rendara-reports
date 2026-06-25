import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/angular';
import { ReportViewer } from './report-viewer';

describe('ReportViewer', () => {
  it('renders the shared renderer it composes', async () => {
    const { container } = await render(ReportViewer);

    // The skeleton viewer composes <rdr-report-renderer>, which paints a page
    // sheet — proving the viewer -> renderer composition renders real output.
    expect(container.querySelector('.rdr-page')).toBeTruthy();
  });
});
