import { describe, expect, it } from 'vitest';

import {
  clampPage,
  keyToNavIntent,
  nextPage,
  prevPage,
  resolveNavIntent,
  type PageNavIntent,
} from './viewer-navigation';

describe('clampPage', () => {
  it('keeps an in-range page unchanged', () => {
    expect(clampPage(3, 10)).toBe(3);
    expect(clampPage(1, 10)).toBe(1);
    expect(clampPage(10, 10)).toBe(10);
  });

  it('clamps below the start and above the end', () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-5, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(999, 10)).toBe(10);
  });

  it('floors fractional inputs to an integer', () => {
    expect(clampPage(2.9, 10)).toBe(2);
    expect(clampPage(1.1, 10)).toBe(1);
  });

  it('returns 1 for non-finite inputs within a document', () => {
    expect(clampPage(Number.NaN, 10)).toBe(1);
    expect(clampPage(Number.POSITIVE_INFINITY, 10)).toBe(1);
  });

  it('returns 0 when there is no document', () => {
    expect(clampPage(1, 0)).toBe(0);
    expect(clampPage(5, -1)).toBe(0);
  });
});

describe('nextPage / prevPage', () => {
  it('advances and retreats within bounds', () => {
    expect(nextPage(1, 5)).toBe(2);
    expect(prevPage(3, 5)).toBe(2);
  });

  it('clamps at the document ends', () => {
    expect(nextPage(5, 5)).toBe(5);
    expect(prevPage(1, 5)).toBe(1);
  });
});

describe('keyToNavIntent', () => {
  it.each<[string, PageNavIntent]>([
    ['PageDown', 'next'],
    ['ArrowRight', 'next'],
    ['ArrowDown', 'next'],
    ['PageUp', 'prev'],
    ['ArrowLeft', 'prev'],
    ['ArrowUp', 'prev'],
    ['Home', 'first'],
    ['End', 'last'],
  ])('maps %s to %s', (key, intent) => {
    expect(keyToNavIntent(key)).toBe(intent);
  });

  it('returns null for unrelated keys', () => {
    expect(keyToNavIntent('a')).toBeNull();
    expect(keyToNavIntent('Enter')).toBeNull();
    expect(keyToNavIntent(' ')).toBeNull();
  });
});

describe('resolveNavIntent', () => {
  it('resolves each intent against the current page', () => {
    expect(resolveNavIntent('next', 2, 5)).toBe(3);
    expect(resolveNavIntent('prev', 2, 5)).toBe(1);
    expect(resolveNavIntent('first', 4, 5)).toBe(1);
    expect(resolveNavIntent('last', 4, 5)).toBe(5);
  });

  it('clamps at the bounds', () => {
    expect(resolveNavIntent('next', 5, 5)).toBe(5);
    expect(resolveNavIntent('prev', 1, 5)).toBe(1);
  });
});
