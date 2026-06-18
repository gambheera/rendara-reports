import { Component, ViewEncapsulation, input } from '@angular/core';

/** Visual emphasis of a {@link Button}, per design.md "Core Components". */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/**
 * Token-driven button — the first real `ui-kit` component (E0-S8). It is an
 * *attribute* selector applied to a native `<button>` so consumers keep the
 * element's built-in semantics (keyboard, focus, `type`, form participation,
 * `:disabled`) for free; this component only paints it from `--rdr-*` tokens.
 *
 * @example
 * ```html
 * <button rdr-button variant="primary">Create new report</button>
 * ```
 */
@Component({
  selector: 'button[rdr-button]',
  template: '<ng-content />',
  styleUrl: './button.css',
  // Emulated encapsulation scopes the styles to this component while the
  // `--rdr-*` custom properties still cascade in from the themed ancestor.
  encapsulation: ViewEncapsulation.Emulated,
  host: {
    class: 'rdr-button',
    '[class.rdr-button--primary]': "variant() === 'primary'",
    '[class.rdr-button--secondary]': "variant() === 'secondary'",
    '[class.rdr-button--ghost]': "variant() === 'ghost'",
  },
})
export class Button {
  /** Defaults to the recessive `secondary` outline; promote with `primary`. */
  readonly variant = input<ButtonVariant>('secondary');
}
