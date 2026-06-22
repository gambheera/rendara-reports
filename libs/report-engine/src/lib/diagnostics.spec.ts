import { describe, expect, it } from 'vitest';

import {
  type Diagnostic,
  type DiagnosticLocation,
  expressionDiagnostic,
  formatDiagnostic,
  missingValueDiagnostic,
  severityFor,
  summarizeDiagnostics,
} from './diagnostics';
import type { ExpressionError } from './expression';

const loc: DiagnosticLocation = { elementId: 'el_1', columnKey: 'amt', role: 'cell' };

const exprError: ExpressionError = {
  kind: 'evaluate',
  message: 'boom',
  expr: '$bad()',
  code: 'T1006',
};

// --- severityFor -------------------------------------------------------------

describe('severityFor', () => {
  it('maps expression-error to error and every warning code to warning', () => {
    expect(severityFor('expression-error')).toBe('error');
    expect(severityFor('missing-value')).toBe('warning');
    expect(severityFor('format-mismatch')).toBe('warning');
    expect(severityFor('invalid-format')).toBe('warning');
  });
});

// --- expressionDiagnostic ----------------------------------------------------

describe('expressionDiagnostic', () => {
  it('wraps the error with severity error and carries it through', () => {
    const d = expressionDiagnostic(exprError, loc);
    expect(d.severity).toBe('error');
    expect(d.code).toBe('expression-error');
    expect(d.message).toBe('boom');
    expect(d.expr).toBe('$bad()');
    expect(d.error).toBe(exprError);
    expect(d.location).toEqual(loc);
  });

  it('omits location when not supplied', () => {
    const d = expressionDiagnostic(exprError);
    expect(d.location).toBeUndefined();
  });
});

// --- missingValueDiagnostic --------------------------------------------------

describe('missingValueDiagnostic', () => {
  it('is a warning carrying the expr and no underlying error', () => {
    const d = missingValueDiagnostic('a.b.c', loc);
    expect(d.severity).toBe('warning');
    expect(d.code).toBe('missing-value');
    expect(d.expr).toBe('a.b.c');
    expect(d.message).toContain('a.b.c');
    expect(d.error).toBeUndefined();
    expect(d.location).toEqual(loc);
  });
});

// --- formatDiagnostic --------------------------------------------------------

describe('formatDiagnostic', () => {
  it('maps mismatch → format-mismatch warning', () => {
    const d = formatDiagnostic('mismatch', 'amount', 'currency:USD', loc);
    expect(d?.severity).toBe('warning');
    expect(d?.code).toBe('format-mismatch');
    expect(d?.message).toContain('currency:USD');
    expect(d?.location).toEqual(loc);
  });

  it('maps bad-token → invalid-format warning', () => {
    const d = formatDiagnostic('bad-token', 'amount', 'currency:US');
    expect(d?.code).toBe('invalid-format');
    expect(d?.message).toContain('currency:US');
  });

  it('tolerates a null/undefined token in the message', () => {
    expect(formatDiagnostic('mismatch', 'x', null)?.message).toContain("''");
    expect(formatDiagnostic('bad-token', 'x', undefined)?.message).toContain("''");
  });

  it('returns undefined for ok and empty (not format problems)', () => {
    expect(formatDiagnostic('ok', 'x', 'number:0.00')).toBeUndefined();
    expect(formatDiagnostic('empty', 'x', 'number:0.00')).toBeUndefined();
  });
});

// --- summarizeDiagnostics ----------------------------------------------------

describe('summarizeDiagnostics', () => {
  it('partitions into errors and warnings, preserving order', () => {
    const mismatch = formatDiagnostic('mismatch', 'b', 'number:0.00');
    if (!mismatch) {
      throw new Error('expected a format diagnostic');
    }
    const stream: Diagnostic[] = [
      missingValueDiagnostic('a'),
      expressionDiagnostic(exprError),
      mismatch,
    ];
    const report = summarizeDiagnostics(stream);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].code).toBe('expression-error');
    expect(report.warnings.map((w) => w.code)).toEqual(['missing-value', 'format-mismatch']);
    expect(report.hasErrors).toBe(true);
    expect(report.hasWarnings).toBe(true);
  });

  it('reports an empty stream as clean', () => {
    const report = summarizeDiagnostics([]);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.hasErrors).toBe(false);
    expect(report.hasWarnings).toBe(false);
  });

  it('flags warnings-only and errors-only streams correctly', () => {
    const warnOnly = summarizeDiagnostics([missingValueDiagnostic('a')]);
    expect(warnOnly.hasErrors).toBe(false);
    expect(warnOnly.hasWarnings).toBe(true);

    const errOnly = summarizeDiagnostics([expressionDiagnostic(exprError)]);
    expect(errOnly.hasErrors).toBe(true);
    expect(errOnly.hasWarnings).toBe(false);
  });
});
