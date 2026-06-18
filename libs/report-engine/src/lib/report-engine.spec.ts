import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@rendara/report-schema';
import { ENGINE_TARGET_SCHEMA_VERSION } from './report-engine';

describe('report-engine', () => {
  it('targets the report-schema contract version', () => {
    expect(ENGINE_TARGET_SCHEMA_VERSION).toBe(SCHEMA_VERSION);
  });
});
