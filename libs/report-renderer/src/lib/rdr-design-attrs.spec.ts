import { describe, expect, it } from 'vitest';
import { Component, signal } from '@angular/core';
import { render } from '@testing-library/angular';

import { RdrDesignAttrs } from './rdr-design-attrs';
import type { AttrMap } from './page-view-model';

/**
 * Directive tests (E4-S6). The directive bridges the pure design-anchor attribute
 * map onto the live DOM, so it must apply every attribute, and remove ones that
 * disappear when the map shrinks or clears (view mode), leaving no residue.
 */
@Component({
  selector: 'rdr-attrs-host',
  imports: [RdrDesignAttrs],
  template: `<div data-testid="target" [rdrDesignAttrs]="attrs()"></div>`,
})
class AttrsHost {
  readonly attrs = signal<AttrMap | null>(null);
}

async function renderHost() {
  const view = await render(AttrsHost);
  const target = view.container.querySelector<HTMLElement>('[data-testid="target"]');
  if (target === null) throw new Error('expected the target element');
  return { view, target };
}

describe('RdrDesignAttrs (E4-S6)', () => {
  it('applies no attributes for a null map (view mode)', async () => {
    const { target } = await renderHost();
    expect(target.hasAttribute('data-rdr-hit')).toBe(false);
  });

  it('applies every attribute of the map', async () => {
    const { view, target } = await renderHost();
    view.fixture.componentInstance.attrs.set({
      'data-rdr-hit': 'element',
      'data-rdr-x': '12',
    });
    view.detectChanges();

    expect(target.getAttribute('data-rdr-hit')).toBe('element');
    expect(target.getAttribute('data-rdr-x')).toBe('12');
  });

  it('removes attributes that disappear when the map clears to null', async () => {
    const { view, target } = await renderHost();
    view.fixture.componentInstance.attrs.set({ 'data-rdr-hit': 'table', 'data-rdr-w': '50' });
    view.detectChanges();
    expect(target.getAttribute('data-rdr-hit')).toBe('table');

    view.fixture.componentInstance.attrs.set(null);
    view.detectChanges();
    expect(target.hasAttribute('data-rdr-hit')).toBe(false);
    expect(target.hasAttribute('data-rdr-w')).toBe(false);
  });

  it('removes only the stale keys when the map shrinks', async () => {
    const { view, target } = await renderHost();
    view.fixture.componentInstance.attrs.set({
      'data-rdr-hit': 'element',
      'data-rdr-h': '40',
    });
    view.detectChanges();
    expect(target.getAttribute('data-rdr-h')).toBe('40');

    // A growing element drops data-rdr-h; the role marker must remain.
    view.fixture.componentInstance.attrs.set({ 'data-rdr-hit': 'element' });
    view.detectChanges();
    expect(target.hasAttribute('data-rdr-h')).toBe(false);
    expect(target.getAttribute('data-rdr-hit')).toBe('element');
  });
});
