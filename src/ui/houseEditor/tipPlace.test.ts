import { describe, expect, it } from 'vitest';
import { TIP_PLACE, tipPlace } from './tipPlace';

const VW = 1024;
const VH = 700;
const EDGE = 16;

describe('名前の ヘルプの 置き場所（カーソルの 近く）', () => {
  it('まず カーソルの 右下に ずらして 出る（カーソルの 先を かくさない）', () => {
    const p = tipPlace(400, 300, 200, 44, VW, VH, EDGE);
    expect(p).toEqual({ x: 400 + TIP_PLACE.dx, y: 300 + TIP_PLACE.dy });
    // カーソルの 点は ふきだしの 外
    expect(400 < p.x || 400 > p.x + 200 || 300 < p.y || 300 > p.y + 44).toBe(true);
  });

  it('同じ ボタンの 上で マウスを うごかすと 同じ だけ うごく（待ちなおさない）', () => {
    const a = tipPlace(400, 300, 200, 44, VW, VH, EDGE);
    const b = tipPlace(400, 310, 200, 44, VW, VH, EDGE);
    expect(b.x - a.x).toBe(0);
    expect(b.y - a.y).toBe(10);
  });

  it('右に 入らない ときは 左へ・下に 入らない ときは 上へ', () => {
    const p = tipPlace(900, 650, 356, 44, VW, VH, EDGE);
    expect(p.x + 356).toBe(900 - TIP_PLACE.flip);
    expect(p.y + 44).toBe(650 - TIP_PLACE.flip);
  });

  it('画面の ふちで 止めて はみ出さない（左・上も）', () => {
    const p = tipPlace(4, 4, 436, 76, VW, VH, EDGE);
    expect(p.x).toBeGreaterThanOrEqual(EDGE);
    expect(p.y).toBeGreaterThanOrEqual(EDGE);
    const q = tipPlace(1020, 695, 436, 76, VW, VH, EDGE);
    expect(q.x + 436).toBeLessThanOrEqual(VW - EDGE);
    expect(q.y + 76).toBeLessThanOrEqual(VH - EDGE);
  });

  it('ふちの あき（16・24・32）で 止める', () => {
    for (const edge of [16, 24, 32]) {
      const p = tipPlace(1000, 100, 436, 76, VW, VH, edge);
      expect(p.x + 436).toBeLessThanOrEqual(VW - edge);
    }
  });
});
