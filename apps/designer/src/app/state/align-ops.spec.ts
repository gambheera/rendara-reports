import { describe, expect, it } from 'vitest';
import type { Frame } from '@rendara/report-schema';
import { alignFrames, distributeFrames } from './align-ops';

/** A fixed-size frame at (x, y). */
function f(xMm: number, yMm: number, wMm = 20, hMm: number | null = 10): Frame {
  return { xMm, yMm, wMm, hMm };
}

describe('alignFrames', () => {
  // Three frames spanning x:[10,90], y:[5,60]; widths/heights vary.
  const frames: Frame[] = [
    { xMm: 10, yMm: 5, wMm: 20, hMm: 10 },
    { xMm: 40, yMm: 30, wMm: 40, hMm: 20 },
    { xMm: 70, yMm: 50, wMm: 20, hMm: 10 },
  ];

  it('aligns left edges to the bounding box left', () => {
    expect(alignFrames(frames, 'left').map((fr) => fr.xMm)).toEqual([10, 10, 10]);
  });

  it('aligns right edges to the bounding box right', () => {
    // bounding right = max(30, 80, 90) = 90 → x = 90 - w.
    expect(alignFrames(frames, 'right').map((fr) => fr.xMm)).toEqual([70, 50, 70]);
  });

  it('aligns horizontal centres to the bounding box centre', () => {
    // bounding x:[10,90] → centre 50 → x = 50 - w/2.
    expect(alignFrames(frames, 'hcenter').map((fr) => fr.xMm)).toEqual([40, 30, 40]);
  });

  it('aligns top edges to the bounding box top', () => {
    expect(alignFrames(frames, 'top').map((fr) => fr.yMm)).toEqual([5, 5, 5]);
  });

  it('aligns bottom edges to the bounding box bottom', () => {
    // bounding bottom = max(15, 50, 60) = 60 → y = 60 - h.
    expect(alignFrames(frames, 'bottom').map((fr) => fr.yMm)).toEqual([50, 40, 50]);
  });

  it('aligns vertical middles to the bounding box middle', () => {
    // bounding y:[5,60] → middle 32.5 → y = 32.5 - h/2.
    expect(alignFrames(frames, 'vmiddle').map((fr) => fr.yMm)).toEqual([27.5, 22.5, 27.5]);
  });

  it('treats a growing element (hMm: null) as zero height for bottom align', () => {
    const grown: Frame[] = [f(0, 0, 20, 10), { xMm: 50, yMm: 40, wMm: 30, hMm: null }];
    // bottom = max(10, 40) = 40; the growing element's top aligns to 40.
    expect(alignFrames(grown, 'bottom').map((fr) => fr.yMm)).toEqual([30, 40]);
  });

  it('returns the input unchanged for fewer than two frames', () => {
    expect(alignFrames([f(3, 7)], 'left')).toEqual([f(3, 7)]);
    expect(alignFrames([], 'top')).toEqual([]);
  });

  it('rounds positions to 0.1 mm', () => {
    // bounding x:[0,46], centre 23 → x = 23 - 6.5 = 16.5.
    const out = alignFrames([f(0, 0, 13), f(33, 0, 13)], 'hcenter');
    expect(out[0].xMm).toBeCloseTo(16.5, 5);
  });
});

describe('distributeFrames', () => {
  it('spaces three centres evenly along the horizontal axis', () => {
    // centres at 5, 30, 95 → even centres at 5, 50, 95.
    const frames: Frame[] = [f(0, 0, 10), f(20, 0, 20), f(90, 0, 10)];
    expect(distributeFrames(frames, 'horizontal').map((fr) => fr.xMm)).toEqual([0, 40, 90]);
  });

  it('keeps the extreme frames fixed and only moves the interior', () => {
    const frames: Frame[] = [f(0, 0, 10), f(15, 0, 10), f(100, 0, 10)];
    const out = distributeFrames(frames, 'horizontal');
    expect(out[0].xMm).toBe(0);
    expect(out[2].xMm).toBe(100);
    // centres 5 and 105 → middle centre 55 → x = 50.
    expect(out[1].xMm).toBe(50);
  });

  it('distributes vertical centres, honouring source order regardless of position', () => {
    // Out-of-order input: the maths ranks by centre but returns input order.
    const frames: Frame[] = [f(0, 100, 10, 10), f(0, 0, 10, 10), f(0, 40, 10, 10)];
    const out = distributeFrames(frames, 'vertical');
    // centres 105, 5, 45 → extremes 5 & 105, middle 55 → y = 50 for the interior one.
    expect(out.map((fr) => fr.yMm)).toEqual([100, 0, 50]);
  });

  it('returns the input unchanged for fewer than three frames', () => {
    const two: Frame[] = [f(0, 0), f(50, 0)];
    expect(distributeFrames(two, 'horizontal')).toEqual(two);
    expect(distributeFrames([f(0, 0)], 'vertical')).toEqual([f(0, 0)]);
  });

  it('treats a growing element as zero height when distributing vertically', () => {
    const frames: Frame[] = [
      { xMm: 0, yMm: 0, wMm: 10, hMm: 10 },
      { xMm: 0, yMm: 30, wMm: 10, hMm: null },
      { xMm: 0, yMm: 100, wMm: 10, hMm: 10 },
    ];
    // centres 5, 30, 105 → middle target 55 → growing top = 55 (h treated as 0).
    expect(distributeFrames(frames, 'vertical')[1].yMm).toBe(55);
  });
});
