/**
 * Visual style attached to an element — the "style ref" slot of {@link
 * ElementBase}.
 *
 * STUB (E1-S1): the full style model — font (family/size/weight/style), color,
 * background/fill, per-side border, alignment (h/v), padding, line/shape stroke,
 * and the number/date format slot — is defined in **E1-S4**. It is intentionally
 * left as an open-ended bag of properties here so that {@link ElementBase} has a
 * legal, assignable `style` slot without pre-empting that story. E1-S4 replaces
 * this with concrete, validated properties.
 */
export interface ElementStyle {
  readonly [property: string]: unknown;
}
