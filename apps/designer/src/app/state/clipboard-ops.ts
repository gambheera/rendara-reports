import type { TemplateElement } from '@rendara/report-schema';
import type { PageSizeMm } from './drag-create';
import { moveFramesAsGroup } from './frame-ops';

/**
 * Offset (mm) applied to pasted/duplicated elements so a clone doesn't land
 * exactly on top of its source — the familiar "cascade" of a paste.
 */
export const PASTE_OFFSET_MM = 5;

/**
 * Clones elements for paste/duplicate (E5-S9): each clone gets a **fresh id**, a
 * frame shifted down-right by `offsetMm`, and an ascending **z so the pasted set
 * lands on top** (in source order). The whole set is offset *as a rigid group*
 * via {@link moveFramesAsGroup}, so multi-element pastes keep their relative
 * layout and stay clamped onto the sheet. Everything else (type, text, style,
 * binding…) is copied by shallow spread — the model is immutable, so sharing the
 * untouched sub-objects is safe.
 *
 * `newId` supplies ids (injected so callers control id generation and tests stay
 * deterministic); `startZ` is the z of the first clone, with each subsequent clone
 * one higher.
 */
export function cloneElementsForPaste(
  elements: readonly TemplateElement[],
  newId: () => string,
  startZ: number,
  pageMm: PageSizeMm,
  offsetMm: number = PASTE_OFFSET_MM,
): TemplateElement[] {
  if (elements.length === 0) return [];
  const frames = moveFramesAsGroup(
    elements.map((el) => el.frame),
    offsetMm,
    offsetMm,
    pageMm,
  );
  return elements.map(
    (el, i) => ({ ...el, id: newId(), frame: frames[i], z: startZ + i }) as TemplateElement,
  );
}
