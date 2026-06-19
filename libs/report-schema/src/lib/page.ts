/**
 * Page & document settings (brief §5).
 *
 * E1-S1 declares the structural shape of {@link Page} so {@link
 * RendaraTemplate} is a complete, assignable type. This file stays type-only;
 * the *behavior* — sensible defaults, named-size resolution and
 * custom-size/validation — lives in `./page-settings` (**E1-S2**).
 */

/** Named paper sizes recognised without explicit dimensions. */
export type PageSizeName = 'A4' | 'Letter';

/** A custom paper size given directly in millimetres. */
export interface PageSizeMm {
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Paper size: a named size or an explicit custom size (brief §5). */
export type PageSize = PageSizeName | PageSizeMm;

export type PageOrientation = 'portrait' | 'landscape';

/** Page margins, per side, in millimetres. */
export interface MarginsMm {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * Authoring units. The canonical default is `mm` (brief §12.3); `pt`/`in` are
 * offered as authoring options. The renderer always converts to px.
 */
export type AuthoringUnit = 'mm' | 'pt' | 'in';

/** The document's default font. */
export interface FontSpec {
  readonly family: string;
  readonly sizePt: number;
}

export interface Page {
  readonly size: PageSize;
  readonly orientation: PageOrientation;
  readonly marginsMm: MarginsMm;
  readonly units: AuthoringUnit;
  readonly defaultFont: FontSpec;
  /** Optional page background (e.g. a fill or watermark image). `null` = none. */
  readonly background?: unknown | null;
}
