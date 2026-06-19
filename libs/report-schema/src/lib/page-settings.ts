/**
 * Page & document settings behavior (E1-S2).
 *
 * E1-S1 declared the {@link Page} *type*; this file owns its *behavior*: the
 * sensible defaults, named-size → millimetre resolution, default resolution
 * from partial author input, and focused page-settings validation.
 *
 * Scope note: this is **not** the general template validator. The ajv-backed
 * `validate()`/`Result`/`RendaraValidationError` API is E1-S6 and will fold
 * these checks in; here we ship a small, self-contained page validator so the
 * defaults and custom-size rules are unit-testable today (brief §5).
 */

import type {
  AuthoringUnit,
  FontSpec,
  MarginsMm,
  Page,
  PageOrientation,
  PageSize,
  PageSizeMm,
  PageSizeName,
} from './page';

/**
 * Canonical millimetre dimensions of the named paper sizes, expressed in their
 * intrinsic **portrait** orientation (width < height). `A4` is ISO 216; `Letter`
 * is ANSI 8.5in × 11in converted at 25.4 mm/in. Landscape is derived by
 * {@link resolvePageDimensionsMm}.
 */
export const NAMED_PAGE_SIZES_MM: Readonly<Record<PageSizeName, PageSizeMm>> = {
  A4: { widthMm: 210, heightMm: 297 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
};

/** Default page margins (brief §5): 20mm top/bottom, 15mm left/right. */
export const DEFAULT_MARGINS_MM: MarginsMm = {
  top: 20,
  right: 15,
  bottom: 20,
  left: 15,
};

/** Default document font (brief §5): Inter 10pt. */
export const DEFAULT_FONT: FontSpec = { family: 'Inter', sizePt: 10 };

/**
 * The sensible default page: A4, portrait, default margins, `mm` authoring
 * units, Inter 10pt, no background. This is the baseline {@link resolvePage}
 * merges author input over.
 */
export const DEFAULT_PAGE: Page = {
  size: 'A4',
  orientation: 'portrait',
  marginsMm: DEFAULT_MARGINS_MM,
  units: 'mm',
  defaultFont: DEFAULT_FONT,
  background: null,
};

/** Narrows a {@link PageSize} to one of the named sizes. */
export function isNamedPageSize(size: PageSize): size is PageSizeName {
  return size === 'A4' || size === 'Letter';
}

/** Narrows a {@link PageSize} to an explicit custom millimetre size. */
export function isCustomPageSize(size: PageSize): size is PageSizeMm {
  return !isNamedPageSize(size);
}

/**
 * Resolves a page size to concrete millimetre dimensions, honouring
 * orientation.
 *
 * Named sizes are stored portrait; `landscape` swaps width/height. Custom sizes
 * are taken **literally** — the author already encoded their intended dimensions
 * — so orientation does not transform them.
 */
export function resolvePageDimensionsMm(
  size: PageSize,
  orientation: PageOrientation
): PageSizeMm {
  if (isCustomPageSize(size)) {
    return { widthMm: size.widthMm, heightMm: size.heightMm };
  }
  const { widthMm, heightMm } = NAMED_PAGE_SIZES_MM[size];
  return orientation === 'landscape'
    ? { widthMm: heightMm, heightMm: widthMm }
    : { widthMm, heightMm };
}

/**
 * Partial page settings as supplied by an author/importer. Every field is
 * optional; nested margins and font may be partially specified and are merged
 * field-by-field against the defaults by {@link resolvePage}.
 */
export interface PageInput {
  readonly size?: PageSize;
  readonly orientation?: PageOrientation;
  readonly marginsMm?: Partial<MarginsMm>;
  readonly units?: AuthoringUnit;
  readonly defaultFont?: Partial<FontSpec>;
  readonly background?: unknown | null;
}

/**
 * Default resolution: produces a complete {@link Page} by overlaying `input`
 * onto {@link DEFAULT_PAGE}. Margins and font merge per-field, so an author can
 * override just `marginsMm.top` or `defaultFont.sizePt` and keep the rest of the
 * defaults. `background` is overridden only when the key is present, so an
 * explicit `null` is honoured.
 */
export function resolvePage(input: PageInput = {}): Page {
  return {
    size: input.size ?? DEFAULT_PAGE.size,
    orientation: input.orientation ?? DEFAULT_PAGE.orientation,
    marginsMm: { ...DEFAULT_MARGINS_MM, ...input.marginsMm },
    units: input.units ?? DEFAULT_PAGE.units,
    defaultFont: { ...DEFAULT_FONT, ...input.defaultFont },
    background: 'background' in input ? input.background : DEFAULT_PAGE.background,
  };
}

/** A single page-settings problem, with a dotted path to the offending field. */
export interface PageSettingsError {
  readonly path: string;
  readonly message: string;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Focused page-settings validation (E1-S2 QA). Checks that a custom size has
 * positive, finite dimensions; that margins are non-negative, finite, and leave
 * a positive content area within the resolved page; and that the default font
 * size is positive. Returns one {@link PageSettingsError} per problem; an empty
 * array means the page settings are valid.
 */
export function validatePageSettings(page: Page): PageSettingsError[] {
  const errors: PageSettingsError[] = [];

  if (isCustomPageSize(page.size)) {
    if (!isPositiveFinite(page.size.widthMm)) {
      errors.push({
        path: 'page.size.widthMm',
        message: `Custom page width must be a positive number of millimetres, got ${page.size.widthMm}.`,
      });
    }
    if (!isPositiveFinite(page.size.heightMm)) {
      errors.push({
        path: 'page.size.heightMm',
        message: `Custom page height must be a positive number of millimetres, got ${page.size.heightMm}.`,
      });
    }
  }

  const { top, right, bottom, left } = page.marginsMm;
  const sides: ReadonlyArray<readonly [keyof MarginsMm, number]> = [
    ['top', top],
    ['right', right],
    ['bottom', bottom],
    ['left', left],
  ];
  for (const [side, value] of sides) {
    if (!isNonNegativeFinite(value)) {
      errors.push({
        path: `page.marginsMm.${side}`,
        message: `Margin '${side}' must be a non-negative number of millimetres, got ${value}.`,
      });
    }
  }

  // Only check that margins fit when both the dimensions and the relevant
  // margins are themselves valid, so we don't pile derived errors onto a size or
  // margin we've already flagged.
  const dims = resolvePageDimensionsMm(page.size, page.orientation);
  if (
    isPositiveFinite(dims.widthMm) &&
    isNonNegativeFinite(left) &&
    isNonNegativeFinite(right) &&
    left + right >= dims.widthMm
  ) {
    errors.push({
      path: 'page.marginsMm',
      message: `Left + right margins (${left} + ${right} mm) leave no horizontal content area within the ${dims.widthMm} mm page width.`,
    });
  }
  if (
    isPositiveFinite(dims.heightMm) &&
    isNonNegativeFinite(top) &&
    isNonNegativeFinite(bottom) &&
    top + bottom >= dims.heightMm
  ) {
    errors.push({
      path: 'page.marginsMm',
      message: `Top + bottom margins (${top} + ${bottom} mm) leave no vertical content area within the ${dims.heightMm} mm page height.`,
    });
  }

  if (!isPositiveFinite(page.defaultFont.sizePt)) {
    errors.push({
      path: 'page.defaultFont.sizePt',
      message: `Default font size must be a positive number of points, got ${page.defaultFont.sizePt}.`,
    });
  }

  return errors;
}

/** Convenience boolean wrapper over {@link validatePageSettings}. */
export function isValidPageSettings(page: Page): boolean {
  return validatePageSettings(page).length === 0;
}
