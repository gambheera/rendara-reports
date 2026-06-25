import { describe, expect, it } from 'vitest';
import {
  addGroup,
  anyGrouped,
  expandSelection,
  groupOf,
  removeGroupsTouching,
  sanitizeGroups,
} from './group-ops';

const ALL = new Set(['a', 'b', 'c', 'd']);

describe('sanitizeGroups', () => {
  it('prunes missing members and drops groups left with fewer than two', () => {
    expect(
      sanitizeGroups(
        [
          ['a', 'gone', 'b'],
          ['c', 'missing'],
        ],
        ALL,
      ),
    ).toEqual([['a', 'b']]);
  });

  it('dedupes members within a group', () => {
    expect(sanitizeGroups([['a', 'a', 'b']], ALL)).toEqual([['a', 'b']]);
  });

  it('keeps an element in only its first group (second loses the shared member)', () => {
    // a,b form group 1; group 2 would be [b,c] but b is already claimed → [c] → dropped.
    expect(
      sanitizeGroups(
        [
          ['a', 'b'],
          ['b', 'c'],
        ],
        ALL,
      ),
    ).toEqual([['a', 'b']]);
  });
});

describe('groupOf / anyGrouped', () => {
  const groups = [['a', 'b']];
  it('finds the group a member belongs to', () => {
    expect(groupOf(groups, 'b')).toEqual(['a', 'b']);
    expect(groupOf(groups, 'c')).toBeUndefined();
  });
  it('reports whether any id is grouped', () => {
    expect(anyGrouped(groups, ['c', 'a'])).toBe(true);
    expect(anyGrouped(groups, ['c', 'd'])).toBe(false);
  });
});

describe('expandSelection', () => {
  const groups = [['a', 'b', 'c']];
  it('pulls in every member of a touched group, deduped and ordered', () => {
    expect(expandSelection(groups, ['b'])).toEqual(['a', 'b', 'c']);
  });
  it('leaves ungrouped ids alone', () => {
    expect(expandSelection(groups, ['d'])).toEqual(['d']);
  });
  it('merges a group with extra ungrouped ids without duplicates', () => {
    expect(expandSelection(groups, ['d', 'a'])).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('addGroup', () => {
  it('creates a group from two or more distinct, existing ids', () => {
    expect(addGroup([], ['a', 'b'], ALL)).toEqual([['a', 'b']]);
  });
  it('refuses a group with fewer than two valid members', () => {
    expect(addGroup([], ['a'], ALL)).toEqual([]);
    expect(addGroup([], ['a', 'missing'], ALL)).toEqual([]);
  });
  it('moves members out of any prior group when regrouping', () => {
    // a,b were grouped; grouping b,c steals b → old group [a] is dropped.
    expect(addGroup([['a', 'b']], ['b', 'c'], ALL)).toEqual([['b', 'c']]);
  });
});

describe('removeGroupsTouching', () => {
  it('drops only the groups sharing a member with the ids', () => {
    const groups = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    expect(removeGroupsTouching(groups, ['a'])).toEqual([['c', 'd']]);
  });
});
