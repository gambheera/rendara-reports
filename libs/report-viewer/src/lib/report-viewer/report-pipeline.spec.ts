import { describe, expect, it } from 'vitest';
import {
  paginate,
  resolveDataTable,
  type PaginatedDocument,
  type ResolvedDataTable,
} from '@rendara/report-engine';
import { GOLDEN_FIXTURES, isDataTableElement, type RendaraTemplate } from '@rendara/report-schema';

import { runPipeline, type PipelineResult } from './report-pipeline';

/**
 * Unit tests for the viewer render pipeline (E7-S2). The headline QA is the
 * **golden-baseline match**: for every canonical fixture the document the viewer
 * paginates is deeply equal to the document the engine produces on its own
 * shared path (the same construction `golden-pagination.spec.ts` snapshots), so
 * the goldens render in the viewer exactly as the engine baseline.
 */

/**
 * Builds the engine's shared baseline document for `template` + `data` the same
 * way the engine's golden-pagination suite does: resolve every body data table,
 * then paginate with default options.
 */
async function baselineDocument(
  template: RendaraTemplate,
  data: unknown,
): Promise<PaginatedDocument> {
  const resolved = new Map<string, ResolvedDataTable>();
  for (const element of template.body.elements) {
    if (isDataTableElement(element)) {
      resolved.set(element.id, await resolveDataTable(element, data));
    }
  }
  return paginate(template, resolved);
}

/** Narrows a pipeline result to its `rendered` arm or fails the test. */
function expectRendered(result: PipelineResult): Extract<PipelineResult, { status: 'rendered' }> {
  expect(result.status).toBe('rendered');
  if (result.status !== 'rendered') {
    throw new Error(`expected a rendered result, got ${result.status}`);
  }
  return result;
}

describe.each(GOLDEN_FIXTURES)('runPipeline — $name golden (E7-S2)', ({ template, data }) => {
  it('renders the golden matching the engine shared baseline', async () => {
    const result = expectRendered(await runPipeline(template, data));
    const baseline = await baselineDocument(template, data);

    expect(result.document).toEqual(baseline);
    expect(result.document.pageCount).toBeGreaterThanOrEqual(1);
    // migrate() clones, so the rendered template is a deep-equal copy of the input.
    expect(result.template).toEqual(template);
  });

  it('renders the same golden when the template is passed as a JSON string', async () => {
    const result = expectRendered(await runPipeline(JSON.stringify(template), data));
    const baseline = await baselineDocument(template, data);

    expect(result.document).toEqual(baseline);
  });
});

describe('runPipeline — empty inputs (E7-S2)', () => {
  it('reports empty for a null template', async () => {
    expect(await runPipeline(null, null)).toEqual({ status: 'empty' });
  });

  it('reports empty for a blank/whitespace string template', async () => {
    expect(await runPipeline('   ', null)).toEqual({ status: 'empty' });
  });

  it('reports empty for a valid template with null data (missing-data fixture)', async () => {
    const { template } = GOLDEN_FIXTURES[0];
    expect(await runPipeline(template, null)).toEqual({ status: 'empty' });
  });

  it('reports empty for a valid template with undefined data', async () => {
    const { template } = GOLDEN_FIXTURES[0];
    expect(await runPipeline(template, undefined)).toEqual({ status: 'empty' });
  });

  it('renders (not empty) when data is an empty object — `{}` is data', async () => {
    const { template } = GOLDEN_FIXTURES[0];
    const result = await runPipeline(template, {});
    expect(result.status).toBe('rendered');
  });
});

describe('runPipeline — validation failures (E7-S2)', () => {
  it('surfaces a validation error for malformed JSON (never throws)', async () => {
    const result = await runPipeline('{ not json', null);
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.kind).toBe('validation');
    expect(result.error.message).toContain('not valid JSON');
  });

  it('surfaces a validation error with details for a schema-invalid template', async () => {
    const invalid = { schemaVersion: '1.0.0', metadata: {} } as unknown as RendaraTemplate;
    const result = await runPipeline(invalid, null);
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('expected error');
    expect(result.error.kind).toBe('validation');
    expect(result.error.details?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('runPipeline — migration (E7-S2)', () => {
  it('migrates an older (0.9.0) template forward, then renders it', async () => {
    const { template, data } = GOLDEN_FIXTURES[0];
    // Re-label the golden as a 0.9.0 document; the migration runner carries it
    // forward to the current schema before validation, and it then renders.
    const older = { ...template, schemaVersion: '0.9.0' } as unknown as RendaraTemplate;

    const result = await runPipeline(older, data);
    expect(result.status).toBe('rendered');
    if (result.status !== 'rendered') throw new Error('expected rendered');
    expect(result.template.schemaVersion).toBe(template.schemaVersion);
  });
});

describe('runPipeline — binding & options (E7-S2)', () => {
  it('resolves bound element display strings into resolvedValues', async () => {
    const { template, data } = GOLDEN_FIXTURES[0];
    const result = expectRendered(await runPipeline(template, data));

    // Every bound text/image element is keyed by id with a (possibly empty) string.
    expect(result.resolvedValues.size).toBeGreaterThan(0);
    for (const value of result.resolvedValues.values()) {
      expect(typeof value).toBe('string');
    }
  });

  it('stamps a configured watermark onto the paginated document', async () => {
    const { template, data } = GOLDEN_FIXTURES[0];
    const watermark = { type: 'text', text: 'DRAFT', opacity: 0.15, angleDeg: -45 } as const;

    const result = expectRendered(await runPipeline(template, data, { watermark }));
    expect(result.document.watermark).toEqual(watermark);
  });

  it('defaults to no watermark when none is configured', async () => {
    const { template, data } = GOLDEN_FIXTURES[0];
    const result = expectRendered(await runPipeline(template, data));
    expect(result.document.watermark).toBeNull();
  });
});
