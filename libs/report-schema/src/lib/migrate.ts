/**
 * The schema migration runner (E1-S7): safe, forward-only evolution of Template
 * JSON so older templates never break.
 *
 * The Template JSON is a *versioned contract* (brief §5). Every document carries
 * a semver `schemaVersion`; when the schema evolves, a one-step migration is
 * registered for that version bump. {@link migrate} reads the input's version
 * and chains those steps forward, one version at a time, until the document
 * reaches the current {@link SCHEMA_VERSION}. A current-version document is the
 * identity case: it passes through as an equivalent clone.
 *
 * Two deliberate choices:
 *
 * 1. **Typed result, never a throw.** Like the E1-S6 validator, `migrate`
 *    returns the shared {@link Result} discriminated union. Missing, unknown, or
 *    unreachable versions come back as a {@link RendaraMigrationError}, so a
 *    caller handling an old/foreign template never has to wrap this in try/catch.
 * 2. **Migrate, then validate — separately.** `migrate` only *transforms* shape;
 *    it does not validate against the current schema (the input is, by
 *    definition, an older shape). Callers run {@link validate} on the result, as
 *    the E1-S7 QA does. This keeps the two concerns independent and testable.
 *
 * Migrations clone their input and never mutate the caller's object, so applying
 * `migrate` is side-effect-free and idempotent (round-trip stable): re-migrating
 * an already-current document yields an equal document.
 *
 * (No `eval`/`new Function` here — migrations are plain, hand-written TS
 * transforms. The hard rule against dynamic code concerns template *expressions*,
 * evaluated by the engine's JSONata sandbox, not schema evolution.)
 */

import { SCHEMA_VERSION } from './report-schema';
import type { RendaraTemplate } from './template';
import type { Result } from './validate';

/** The version every migration chain terminates at (brief §5). */
export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION;

/**
 * Why a migration could not be performed:
 * - `invalid-input` — not a JSON object, so it carries no version to migrate.
 * - `missing-version` — an object with no (string) `schemaVersion`.
 * - `unknown-version` — a version with no registered path to current (an
 *   unrecognised past version, or one newer than this build understands).
 */
export type MigrationErrorCode = 'invalid-input' | 'missing-version' | 'unknown-version';

/** A single migration problem: a machine code plus a human-readable message. */
export interface RendaraMigrationError {
  readonly code: MigrationErrorCode;
  readonly message: string;
}

/**
 * One forward version bump. `apply` receives a document already at version
 * {@link from} and returns it reshaped to version {@link to}; it must not mutate
 * its argument (the runner hands it a fresh clone). `apply` works on `unknown`
 * because intermediate shapes are older than {@link RendaraTemplate}.
 */
export interface Migration {
  readonly from: string;
  readonly to: string;
  readonly apply: (template: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * 0.9.0 → 1.0.0: page **header** and **footer** bands were introduced in 1.0
 * (brief §5). A 0.9 document carried only a `body`; inject empty header/footer
 * bands so every band the 1.0 schema requires is present, then bump the version.
 */
const migrate_0_9_0_to_1_0_0: Migration = {
  from: '0.9.0',
  to: '1.0.0',
  apply: (template) => ({
    ...template,
    header: template['header'] ?? { elements: [] },
    footer: template['footer'] ?? { elements: [] },
    schemaVersion: '1.0.0',
  }),
};

/**
 * The registry of one-step migrations, keyed implicitly by `from`. The runner
 * chains them, so adding a future `1.0.0 → 1.1.0` step is all that's needed to
 * carry every older template forward through it.
 */
export const MIGRATIONS: readonly Migration[] = [migrate_0_9_0_to_1_0_0];

/** Index of migrations by their source version for O(1) chaining. */
const migrationsByFrom = new Map(MIGRATIONS.map((m) => [m.from, m]));

/** Reads a `schemaVersion` string from an unknown input, or `undefined`. */
function readVersion(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return undefined;
  }
  const version = (input as Record<string, unknown>)['schemaVersion'];
  return typeof version === 'string' ? version : undefined;
}

function fail(code: MigrationErrorCode, message: string): Result<never, RendaraMigrationError[]> {
  return { ok: false, errors: [{ code, message }] };
}

/**
 * Migrates a template to the current {@link SCHEMA_VERSION} (E1-S7). Reads the
 * input's `schemaVersion` and applies registered migrations forward, one version
 * at a time, until it reaches current.
 *
 * - A current-version template is returned as an equivalent **clone** (the
 *   identity migration), so the caller's object is never mutated.
 * - A non-object input → `invalid-input`; an object with no string
 *   `schemaVersion` → `missing-version`; a version with no path to current →
 *   `unknown-version`. Each comes back as a {@link Result}, never thrown.
 *
 * The returned value is the migrated *shape*; callers validate it with
 * {@link validate} (migration and validation are intentionally separate).
 */
export function migrate(input: unknown): Result<RendaraTemplate, RendaraMigrationError[]> {
  const version = readVersion(input);
  if (version === undefined) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return fail('invalid-input', 'Template is not a JSON object; it has no version to migrate.');
    }
    return fail('missing-version', "Template has no string 'schemaVersion' to migrate from.");
  }

  // Clone once up front so every step (and the identity case) is non-mutating.
  let current = structuredClone(input) as Record<string, unknown>;
  let currentVersion = version;

  // Chain forward, one bump per iteration, until we reach the current version.
  // Each registered migration advances `currentVersion`, so the loop is bounded
  // by the number of registered steps.
  for (let step = 0; currentVersion !== CURRENT_SCHEMA_VERSION; step++) {
    const migration = migrationsByFrom.get(currentVersion);
    if (migration === undefined) {
      return fail(
        'unknown-version',
        `No migration path from schema version '${currentVersion}' to '${CURRENT_SCHEMA_VERSION}'.`,
      );
    }
    if (step >= MIGRATIONS.length) {
      // A cycle in the registry would otherwise spin forever; fail loudly.
      return fail(
        'unknown-version',
        `Migration chain from '${version}' did not terminate at '${CURRENT_SCHEMA_VERSION}'.`,
      );
    }
    current = migration.apply(current);
    currentVersion = migration.to;
  }

  return { ok: true, value: current as unknown as RendaraTemplate };
}
