import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from './report-schema';

describe('report-schema', () => {
  it('exposes a semver contract version', () => {
    expect(SCHEMA_VERSION).toBe('1.0.0');
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
