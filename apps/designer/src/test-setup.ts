import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed();

// jsdom 25 ships HTMLDialogElement but not its modal methods. The designer's
// Page setup uses a native <dialog> (showModal/close); polyfill just enough of
// the open/close contract — toggling the `open` attribute and firing `close` —
// so component tests can exercise it deterministically.
const dialogProto = globalThis.HTMLDialogElement?.prototype as
  | (HTMLDialogElement & { __rdrPolyfilled?: boolean })
  | undefined;
if (dialogProto && typeof dialogProto.showModal !== 'function') {
  const openIt = function (this: HTMLDialogElement): void {
    this.setAttribute('open', '');
  };
  dialogProto.showModal = openIt;
  dialogProto.show = openIt;
  dialogProto.close = function (this: HTMLDialogElement, returnValue?: string): void {
    this.removeAttribute('open');
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}
