import { describe, expect, it } from 'vitest';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { INK_FADE_STEPS, createInkModel, type InkArrowIn } from './kokuryuInkModel';
import { INK_PX_BLOCK, INK_STRIP_H, INK_STRIP_W, paintInkStrip } from './kokuryuInkPaint';

/** LEGEND-4 K12・K13（見た目の 決まり）: 墨の すじの 長さ・のこり方・同時に 3 本まで・絵 */
const K = LEGEND4_TUNING.kokuryu;
const arrow = (id: number, x: number, speed = 28, straight = true): InkArrowIn => ({ id, position: { x, y: 10, z: 0 }, velocity: { x: speed, y: 0, z: 0 }, straight });

describe('墨の すじの 長さ', () => {
  it('飛んで いる 間: うしろの はしは 速さ × trailSteps/60 マス うしろ（出た 所より 前には 出ない）', () => {
    const m = createInkModel();
    const x0 = 5; // 矢が 見えた はじめの 場所（うった 所）
    let x = x0;
    for (let i = 0; i < K.trailSteps + 10; i++) {
      const r = m.step([arrow(1, x)], false);
      expect(r).toHaveLength(1);
      const t = r[0]!;
      const want = Math.min(x - x0, (28 * K.trailSteps) / 60);
      expect(t.length).toBeCloseTo(want, 6);
      expect(t.head.x).toBeCloseTo(x, 9);
      expect(t.tail.x).toBeCloseTo(x - want, 6);
      expect(t.opacity).toBe(1);
      x += 28 / 60;
    }
  });
  it('ふつうの 矢（straight でない）は すじを 出さない', () => {
    expect(createInkModel().step([arrow(1, 0, 28, false)], false)).toHaveLength(0);
  });
});

describe('矢が 消えた あと', () => {
  it('trailSteps ステップ のこって 縮み、すっかり 消える。さいごの INK_FADE_STEPS で うすく なる', () => {
    const m = createInkModel();
    let x = 0;
    for (let i = 0; i < 40; i++) m.step([arrow(1, (x += 28 / 60))], false);
    const L0 = m.list()[0]!.length;
    const lens: number[] = [];
    const ops: number[] = [];
    for (let i = 0; i < K.trailSteps; i++) {
      const r = m.step([], false);
      if (r.length === 0) break;
      lens.push(r[0]!.length);
      ops.push(r[0]!.opacity);
      expect(r[0]!.head.x).toBeCloseTo(x, 9); // 先は うごかない
    }
    expect(lens.length).toBe(K.trailSteps);
    expect(lens[0]!).toBeLessThanOrEqual(L0);
    expect(lens[1]!).toBeLessThan(L0);
    for (let i = 1; i < lens.length; i++) expect(lens[i]!).toBeLessThanOrEqual(lens[i - 1]!);
    expect(ops[0]).toBe(1);
    expect(ops[ops.length - 1]!).toBeLessThan(0.2);
    expect(ops.filter((o) => o < 1).length).toBeLessThanOrEqual(INK_FADE_STEPS);
    expect(m.step([], false)).toHaveLength(0);
  });
  it('「動きを へらす」: 矢が 消えたら すぐ 消える', () => {
    const m = createInkModel();
    m.step([arrow(1, 1)], true);
    expect(m.step([], true)).toHaveLength(0);
  });
});

describe('同時に 出る 数', () => {
  it('trailMax 本まで。古い 物から 消える', () => {
    const m = createInkModel();
    const r = m.step([arrow(1, 1), arrow(2, 2), arrow(3, 3)], false);
    expect(r.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(K.trailMax).toBe(3);
    const r2 = m.step([arrow(1, 1), arrow(2, 2), arrow(3, 3), arrow(4, 4)], false);
    expect(r2).toHaveLength(K.trailMax);
    expect(r2.map((t) => t.id)).toContain(4);
    expect(r2.map((t) => t.id)).not.toContain(1);
  });
});

describe('墨の すじの 絵', () => {
  const px = paintInkStrip();
  it('大きさ・1 点の 大きさ・毎回 同じ 絵', () => {
    expect(px).toHaveLength(INK_STRIP_W * INK_STRIP_H * 4);
    expect(INK_STRIP_W * INK_PX_BLOCK).toBeGreaterThanOrEqual((K.trailSteps / 60) * 28); // 最大の 長さ（段 3 の 速さ）が 1 まいに おさまる
    expect(paintInkStrip()).toEqual(px);
  });
  it('黒い けむり ＋ 水色の さし色が ある・先（右）が 左より こい', () => {
    let dark = 0;
    let cyan = 0;
    let right = 0;
    let left = 0;
    for (let y = 0; y < INK_STRIP_H; y++) {
      for (let x = 0; x < INK_STRIP_W; x++) {
        const i = (y * INK_STRIP_W + x) * 4;
        if (px[i + 3]! < 40) continue;
        const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
        if (r < 90 && g < 90 && b < 110) dark++;
        if (b > 150 && b > r + 60) cyan++;
        if (x >= INK_STRIP_W / 2) right++;
        else left++;
      }
    }
    expect(dark).toBeGreaterThan(2000);
    expect(cyan).toBeGreaterThan(20);
    expect(right).toBeGreaterThan(left * 0.3);
  });
});
