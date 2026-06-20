import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  migrate,
  type RendaraMigrationError,
} from './migrate';
import type { RendaraTemplate } from './template';
import { validate } from './validate';

/**
 * E1-S7 QA: a v0.9-style fixture migrates to current and then validates;
 * round-trip stable; missing/unknown version handled gracefully.
 *
 * `legacyTemplate_0_9()` is a realistic pre-1.0 document: it predates page
 * header/footer bands (introduced in 1.0), so it carries only a `body`. The
 * 0.9 → 1.0 migration must inject empty header/footer bands and bump the
 * version, leaving a document that passes the E1-S6 validator.
 */
function legacyTemplate_0_9(): Record<string, unknown> {
  return {
    schemaVersion: '0.9.0',
    metadata: {
      name: 'Invoice — Acme Corp',
      id: '00000000-0000-4000-8000-000000000000',
      createdAt: '2026-06-17T00:00:00.000Z',
      locale: 'en-US',
    },
    page: {
      size: 'A4',
      orientation: 'portrait',
      marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
      units: 'mm',
      defaultFont: { family: 'Inter', sizePt: 10 },
      background: null,
    },
    // No `header` / `footer` — that's the 0.9 shape the migration fills in.
    body: {
      elements: [
        {
          id: 'el_title',
          type: 'text',
          frame: { xMm: 15, yMm: 30, wMm: 80, hMm: 8 },
          text: 'INVOICE',
          z: 1,
        },
      ],
    },
  };
}

/** A complete, already-current (1.0.0) template — the identity-migration input. */
function currentTemplate(): RendaraTemplate {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Blank',
      id: 'id-1',
      createdAt: '2026-06-19T00:00:00.000Z',
      locale: 'en-US',
    },
    page: {
      size: 'A4',
      orientation: 'portrait',
      marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
      units: 'mm',
      defaultFont: { family: 'Inter', sizePt: 10 },
    },
    header: { elements: [] },
    body: { elements: [] },
    footer: { elements: [] },
  };
}

/** The first error's `code` — convenient for single-fault cases. */
function firstCode(errors: readonly RendaraMigrationError[]): string {
  return errors[0]?.code ?? '<none>';
}

describe('migrate — v0.9 fixture migrates to current, then validates (E1-S7 QA)', () => {
  it('chains 0.9.0 → current and stamps the current version', () => {
    const result = migrate(legacyTemplate_0_9());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    }
  });

  it('injects the empty header/footer bands 1.0 requires', () => {
    const result = migrate(legacyTemplate_0_9());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.header).toEqual({ elements: [] });
      expect(result.value.footer).toEqual({ elements: [] });
      // The 0.9 body survives the migration unchanged.
      expect(result.value.body.elements).toHaveLength(1);
    }
  });

  it('produces a document that passes the E1-S6 validator', () => {
    const result = migrate(legacyTemplate_0_9());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(validate(result.value).ok).toBe(true);
    }
  });

  it('does not mutate the caller’s input', () => {
    const input = legacyTemplate_0_9();
    migrate(input);
    expect(input['schemaVersion']).toBe('0.9.0');
    expect(input['header']).toBeUndefined();
    expect(input['footer']).toBeUndefined();
  });
});

describe('migrate — identity & round-trip stability (E1-S7 QA)', () => {
  it('returns a current-version template as an equal clone (identity)', () => {
    const input = currentTemplate();
    const result = migrate(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(input);
      // A clone, not the same reference — migration is side-effect-free.
      expect(result.value).not.toBe(input);
    }
  });

  it('is idempotent: re-migrating a migrated document is stable', () => {
    const once = migrate(legacyTemplate_0_9());
    expect(once.ok).toBe(true);
    if (once.ok) {
      const twice = migrate(once.value);
      expect(twice.ok).toBe(true);
      if (twice.ok) {
        expect(twice.value).toEqual(once.value);
      }
    }
  });
});

describe('migrate — missing/unknown version handled gracefully (E1-S7 QA)', () => {
  it('reports invalid-input for a non-object', () => {
    expect(firstCode(failErrors(migrate(42)))).toBe('invalid-input');
    expect(firstCode(failErrors(migrate(null)))).toBe('invalid-input');
    expect(firstCode(failErrors(migrate([])))).toBe('invalid-input');
  });

  it('reports missing-version for an object without a string schemaVersion', () => {
    expect(firstCode(failErrors(migrate({})))).toBe('missing-version');
    expect(firstCode(failErrors(migrate({ schemaVersion: 2 })))).toBe('missing-version');
  });

  it('reports unknown-version for an unrecognised past version', () => {
    const result = migrate({ schemaVersion: '0.1.0' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe('unknown-version');
      expect(result.errors[0]?.message).toContain('0.1.0');
    }
  });

  it('reports unknown-version for a version newer than this build understands', () => {
    expect(firstCode(failErrors(migrate({ schemaVersion: '2.0.0' })))).toBe('unknown-version');
  });

  it('never throws — every bad input returns a Result', () => {
    expect(() => migrate(undefined)).not.toThrow();
    expect(migrate(undefined).ok).toBe(false);
  });
});

describe('migrate — Result typing (E1-S7)', () => {
  it('narrows to a RendaraTemplate value on success', () => {
    const result = migrate(legacyTemplate_0_9());
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<RendaraTemplate>();
    }
  });

  it('narrows to migration errors on failure', () => {
    const result = migrate({});
    if (!result.ok) {
      expectTypeOf(result.errors).toEqualTypeOf<RendaraMigrationError[]>();
    }
  });
});

/** Asserts a failed result and returns its errors (keeps the bad-input tests terse). */
function failErrors(
  result: ReturnType<typeof migrate>,
): readonly RendaraMigrationError[] {
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}
