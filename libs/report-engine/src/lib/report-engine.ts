import { SCHEMA_VERSION } from '@rendara/report-schema';

/**
 * Skeleton placeholder for `@rendara/report-engine` (E0-S2).
 *
 * The real expression evaluation, formatting, binding resolver and pagination
 * algorithm land in Epics 2–3. The import above establishes the only legal
 * internal dependency for this layer (engine -> schema, brief §4).
 */
export const ENGINE_TARGET_SCHEMA_VERSION = SCHEMA_VERSION;
