/**
 * Triggers a browser download of `blob` under `filename` via a transient
 * object-URL anchor.
 *
 * Shared by the default PDF exporter (E8-S3) and the Download-source action
 * (E8-S5) so the one DOM/`URL` interaction — and its **SSR guard** — lives in a
 * single, tested place. In a runtime without the DOM/`URL` APIs (SSR) it is a
 * no-op and returns `false`, so callers never throw there; in the browser it
 * returns `true` once the click has been dispatched.
 */
export function downloadBlob(blob: Blob, filename: string): boolean {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false;
  }
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
}
