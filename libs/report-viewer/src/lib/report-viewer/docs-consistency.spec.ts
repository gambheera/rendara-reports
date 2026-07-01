import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { reflectComponentType } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { defaultPdfExporter } from './default-pdf-exporter';
import { ReportViewer } from './report-viewer';
import { DEFAULT_TOOLBAR_CONFIG, DEFAULT_VIEWER_CONFIG } from './viewer-api';

/**
 * E9-S6 doc-drift guard. The README quick-start and the generated TypeDoc API
 * reference describe a concrete public surface — a `rdr-report-viewer` element with
 * `template`/`data`/`config`/`theme` inputs and `rendered`/`pageChange`/`error`
 * outputs, plus the exported config defaults and the default PDF exporter. If any
 * of that is renamed, the copy-pasteable docs silently rot; this test fails first,
 * so the docs and the public API can't drift apart unnoticed.
 */
describe('E9-S6 · docs stay in sync with the public API', () => {
  const mirror = reflectComponentType(ReportViewer);

  it('exposes the `rdr-report-viewer` selector the quick-start uses', () => {
    expect(mirror?.selector).toBe('rdr-report-viewer');
  });

  it('declares the brief-§8 inputs the README documents', () => {
    const inputs = mirror?.inputs.map((i) => i.templateName) ?? [];
    expect(inputs).toEqual(expect.arrayContaining(['template', 'data', 'config', 'theme']));
  });

  it('declares the brief-§8 outputs the README documents', () => {
    const outputs = mirror?.outputs.map((o) => o.templateName) ?? [];
    expect(outputs).toEqual(expect.arrayContaining(['rendered', 'pageChange', 'error']));
  });

  it('exports the config defaults + default PDF exporter the docs reference', () => {
    expect(typeof defaultPdfExporter.export).toBe('function');
    expect(Object.keys(DEFAULT_VIEWER_CONFIG)).toEqual(
      expect.arrayContaining(['initialZoom', 'toolbar', 'watermark', 'pageMode', 'thumbnails']),
    );
    // Every toolbar button the README lists is a real, defaulted flag.
    expect(Object.keys(DEFAULT_TOOLBAR_CONFIG)).toEqual(
      expect.arrayContaining([
        'visible',
        'title',
        'navigation',
        'zoom',
        'print',
        'export',
        'watermark',
        'source',
        'search',
        'thumbnails',
      ]),
    );
  });

  // Vitest runs with the working directory set to the vite `root` — the package
  // dir (`libs/report-viewer`) — so the docs resolve directly beneath it.
  const pkgDir = process.cwd();

  it('ships a Changesets-versioned CHANGELOG headed by the package name', () => {
    const changelog = readFileSync(join(pkgDir, 'CHANGELOG.md'), 'utf8');
    expect(changelog.startsWith('# @rendara/report-viewer')).toBe(true);
  });

  it('keeps the README quick-start selector + import path accurate', () => {
    const readme = readFileSync(join(pkgDir, 'README.md'), 'utf8');
    expect(readme).toContain('## Quick start');
    expect(readme).toContain('<rdr-report-viewer');
    expect(readme).toContain("from '@rendara/report-viewer'");
  });
});
