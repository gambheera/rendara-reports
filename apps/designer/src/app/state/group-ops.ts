/**
 * The pure logic behind element **grouping** (E5-S7).
 *
 * Groups are a designer-editing convenience held in view-state (not in the
 * versioned Template schema, which has no group concept): selecting any member
 * selects the whole group, so a group **moves as a unit**. A group is just a list
 * of element ids; the invariants — every member exists, at least two members, and
 * no element in two groups — are enforced by {@link sanitizeGroups}, the single
 * chokepoint the store funnels every change through.
 *
 * Everything here is framework-agnostic and total, so the set maths is
 * exhaustively unit-testable.
 */

/** A group of element ids that select and move together. */
export type Group = readonly string[];

/** All groups in the document. The empty list means "no grouping". */
export type Groups = readonly Group[];

/**
 * Normalises `groups` against the ids that currently exist: each group is pruned
 * to existing, deduped members; an element is kept in only its **first** group;
 * and any group left with fewer than two members is dropped (a one-element group
 * is meaningless). The result is the canonical form every store mutation produces.
 */
export function sanitizeGroups(groups: Groups, existingIds: ReadonlySet<string>): Groups {
  const claimed = new Set<string>();
  const result: Group[] = [];
  for (const group of groups) {
    const members: string[] = [];
    for (const id of group) {
      if (existingIds.has(id) && !claimed.has(id)) {
        claimed.add(id);
        members.push(id);
      }
    }
    if (members.length >= 2) result.push(members);
  }
  return result;
}

/** The group containing `id`, or `undefined` when it is ungrouped. */
export function groupOf(groups: Groups, id: string): Group | undefined {
  return groups.find((group) => group.includes(id));
}

/**
 * Expands a raw selection to whole groups: any id that belongs to a group pulls
 * in all of that group's members. Order follows first appearance and members are
 * deduped, so the result is a stable, group-complete selection.
 */
export function expandSelection(groups: Groups, ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const add = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  };
  for (const id of ids) {
    const group = groupOf(groups, id);
    if (group) group.forEach(add);
    else add(id);
  }
  return result;
}

/**
 * Adds a new group from `memberIds`, first removing those ids from any existing
 * groups (an element lives in one group only), then re-sanitising against
 * `existingIds`. A request with fewer than two valid, distinct members leaves the
 * groups unchanged.
 */
export function addGroup(
  groups: Groups,
  memberIds: readonly string[],
  existingIds: ReadonlySet<string>,
): Groups {
  const members = [...new Set(memberIds)].filter((id) => existingIds.has(id));
  if (members.length < 2) return groups;
  const member = new Set(members);
  const remaining = groups.map((group) => group.filter((id) => !member.has(id)));
  return sanitizeGroups([...remaining, members], existingIds);
}

/** Drops every group that shares a member with `ids` (ungroup). */
export function removeGroupsTouching(groups: Groups, ids: readonly string[]): Groups {
  const touched = new Set(ids);
  return groups.filter((group) => !group.some((id) => touched.has(id)));
}

/** True when at least one of `ids` belongs to a group (so "ungroup" can act). */
export function anyGrouped(groups: Groups, ids: readonly string[]): boolean {
  return ids.some((id) => groupOf(groups, id) !== undefined);
}
