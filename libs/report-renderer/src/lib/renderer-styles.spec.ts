import { describe, expect, it } from 'vitest';

import {
  RDR_THEME_TOKENS,
  RENDERER_DOCUMENT_CSS,
  RENDERER_PAGE_CSS,
  RENDERER_SURFACE_CSS,
  RENDERER_THEME_CSS,
} from './renderer-styles';

/**
 * Unit tests for the shared renderer style foundation (E4-S5). They guard the
 * three things the isolation/theming story relies on: the theme tokens and their
 * defaults stay in sync between the machine-readable record and the literal CSS;
 * the reset pins the inheritable typography that would otherwise bleed from the
 * host; and the surface stylesheet bundles reset + chrome for the shadow root.
 */
describe('renderer-styles (E4-S5)', () => {
  it('declares every theme token default literally in the theme CSS', () => {
    // The CSS must be an authored string literal (Angular statically evaluates a
    // component's `styles`), so it can drift from RDR_THEME_TOKENS — pin them.
    for (const [token, value] of Object.entries(RDR_THEME_TOKENS)) {
      expect(RENDERER_THEME_CSS).toContain(`${token}: ${value};`);
    }
  });

  it('scopes the tokens + reset to the render root', () => {
    // `:host` resolves to the component element (emulated) or the shadow host
    // (Shadow DOM), so one block works for every consumer.
    expect(RENDERER_THEME_CSS.trimStart().startsWith(':host {')).toBe(true);
    expect(RENDERER_THEME_CSS).toContain('display: block;');
  });

  it('resets the inheritable typography that crosses from the host', () => {
    // These properties inherit (and cross a shadow boundary), so the reset must
    // pin each one or a hostile host page could still re-style the report text.
    for (const property of [
      'color:',
      'font-family:',
      'font-size:',
      'font-weight:',
      'font-style:',
      'line-height:',
      'letter-spacing:',
      'word-spacing:',
      'text-align:',
      'text-transform:',
      'text-indent:',
      'text-decoration:',
      'text-shadow:',
      'white-space:',
      'direction:',
    ]) {
      expect(RENDERER_THEME_CSS).toContain(property);
    }
    // The base typography defaults to the themeable tokens, not a host-coupled unit.
    expect(RENDERER_THEME_CSS).toContain('color: var(--rdr-text-color);');
    expect(RENDERER_THEME_CSS).toContain('font-family: var(--rdr-font-family);');
    expect(RENDERER_THEME_CSS).not.toMatch(/font-size:\s*\d*\.?\d+rem/);
  });

  it('drives the page + document chrome from theme tokens', () => {
    expect(RENDERER_PAGE_CSS).toContain('box-shadow: var(--rdr-page-shadow);');
    expect(RENDERER_PAGE_CSS).toContain('outline: 1px dashed var(--rdr-printable-guide);');
    expect(RENDERER_DOCUMENT_CSS).toContain('gap: var(--rdr-page-gap);');
  });

  it('bundles reset, theme and chrome into the surface stylesheet', () => {
    expect(RENDERER_SURFACE_CSS).toContain(RENDERER_THEME_CSS);
    expect(RENDERER_SURFACE_CSS).toContain(RENDERER_PAGE_CSS);
    expect(RENDERER_SURFACE_CSS).toContain(RENDERER_DOCUMENT_CSS);
  });
});
