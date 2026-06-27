import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from './file-download';

/**
 * Tests for the shared {@link downloadBlob} helper (E8-S5): it downloads a blob
 * via a transient object-URL anchor, cleaning the anchor and revoking the URL,
 * and is a guarded no-op in a runtime without the DOM/`URL` APIs (SSR).
 */
describe('downloadBlob', () => {
  // jsdom has no object-URL APIs by default; install spies and restore originals.
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it('downloads via a transient object-URL anchor and cleans up', () => {
    const createUrl = vi.fn().mockReturnValue('blob:mock');
    const revokeUrl = vi.fn();
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const ran = downloadBlob(new Blob(['{}'], { type: 'application/json' }), 'report.json');

    expect(ran).toBe(true);
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    // The anchor is removed after the click (no leftover in the DOM).
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('sets the download filename on the anchor', () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
    URL.revokeObjectURL = vi.fn();
    let captured = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      captured = this.download;
    });

    downloadBlob(new Blob(['{}']), 'invoice.template.json');

    expect(captured).toBe('invoice.template.json');
  });

  it('is a guarded no-op (returns false) when URL.createObjectURL is unavailable (SSR)', () => {
    (URL as { createObjectURL?: unknown }).createObjectURL = undefined;
    expect(downloadBlob(new Blob(['{}']), 'report.json')).toBe(false);
  });
});
