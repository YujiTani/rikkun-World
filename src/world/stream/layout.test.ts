import { describe, expect, it } from 'vitest';
import { LAYOUT_MAX_COLUMNS, RingLayout, decideRings, ringSpecFor } from './layout';
import { DUO_TUNING as T } from '../../duo/tuning';
import { RING_FULL, RING_SMALL, colKey } from './ring';

/**
 * COOP-1 作業 2（#399）の 先行テスト（赤）。AC27（輪の 数・列の 上限・重なりは 1 回）。
 * つなぎ目の 約束: src/world/stream/layout.ts（宣言と 約束は layout.ts の 先頭）。
 * 数（48・32・595・17×17×2）は 仕様 §5・§9.5 の 値を そのまま 書く。
 */

/** 自分で 数える(RingLayout を 使わない): 中心のどれかから チェビシェフ距離 r 以内の 列の 数 */
function brute(centers: Array<{ cx: number; cz: number }>, r: number): number {
  const keys = new Set<number>();
  for (const c of centers) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) keys.add(colKey(c.cx + dx, c.cz + dz));
  return keys.size;
}

describe('AC27: 輪の 数(幅つき)', () => {
  it('1 のとき: 48 までは 1、48 より 遠いと 2', () => {
    expect(decideRings(1, 10)).toBe(1);
    expect(decideRings(1, T.ringsUpAt)).toBe(1);
    expect(decideRings(1, T.ringsUpAt + 0.01)).toBe(2);
    expect(decideRings(1, 100)).toBe(2);
  });
  it('2 のとき: 32 より 近いと 1、32 以上は 2 の まま', () => {
    expect(decideRings(2, 60)).toBe(2);
    expect(decideRings(2, 40)).toBe(2);
    expect(decideRings(2, T.ringsDownAt)).toBe(2);
    expect(decideRings(2, T.ringsDownAt - 0.01)).toBe(1);
    expect(decideRings(2, 0)).toBe(1);
  });
  it('32〜48 の あいだは 今のまま(行き来しても ゆれない)', () => {
    let r: 1 | 2 = 1;
    for (const d of [30, 40, 47, 40, 33, 45, 32.5]) {
      r = decideRings(r, d);
      expect(r).toBe(1);
    }
    r = 2;
    for (const d of [40, 47, 33, 45, 32.5, 47.9]) {
      r = decideRings(r, d);
      expect(r).toBe(2);
    }
  });
  it('輪の 大きさ: 1 つは 起動で 決めた 輪(base)・2 つは 小さい 輪', () => {
    expect(ringSpecFor(1, RING_FULL)).toBe(RING_FULL);
    expect(ringSpecFor(1, RING_SMALL)).toBe(RING_SMALL);
    expect(ringSpecFor(2, RING_FULL)).toBe(RING_SMALL);
    expect(ringSpecFor(2, RING_SMALL)).toBe(RING_SMALL);
  });
});

describe('AC27: 持つ 列の 上限と 重なり', () => {
  it('595 = 441 の 1.35 倍', () => {
    expect(LAYOUT_MAX_COLUMNS).toBe(T.layoutMaxColumns);
    expect(T.layoutMaxColumns).toBe(595);
    expect(Math.floor(RING_FULL.maxColumns * 1.35)).toBe(LAYOUT_MAX_COLUMNS);
  });
  it('1 人・ふだんの 輪: 残す 441 列・生成 289 列', () => {
    const l = new RingLayout([{ cx: 5, cz: -3 }], RING_FULL);
    expect(l.keepColumns()).toHaveLength(441);
    expect(l.genColumns()).toHaveLength(289);
  });
  it('離れた 小さい 輪 2 つ: 17×17×2 = 578 列 ≤ 595', () => {
    const l = new RingLayout([{ cx: 0, cz: 0 }, { cx: 40, cz: 0 }], RING_SMALL);
    expect(l.keepColumns()).toHaveLength(578);
    expect(l.keepColumns().length).toBeLessThanOrEqual(T.layoutMaxColumns);
  });
  it('中心の はなれ方(0〜40 列)を かえても 残す 列は いつも 595 以下・重なりは 1 回', () => {
    for (let off = 0; off <= 40; off++) {
      const centers = [{ cx: 3, cz: 3 }, { cx: 3 + off, cz: 3 - Math.floor(off / 2) }];
      const l = new RingLayout(centers, RING_SMALL);
      const cols = l.keepColumns();
      const keys = new Set(cols.map((c) => colKey(c.cx, c.cz)));
      expect(keys.size, `off ${off}: 同じ 列が 2 回`).toBe(cols.length);
      expect(cols.length, `off ${off}`).toBe(brute(centers, RING_SMALL.keep));
      expect(cols.length).toBeLessThanOrEqual(T.layoutMaxColumns);
    }
  });
  it('2 つの 輪が 重なるほど 列は へる(578 より 少ない)', () => {
    const l = new RingLayout([{ cx: 0, cz: 0 }, { cx: 5, cz: 0 }], RING_SMALL);
    expect(l.keepColumns().length).toBeLessThan(578);
    expect(l.keepColumns().length).toBe(brute([{ cx: 0, cz: 0 }, { cx: 5, cz: 0 }], 8));
  });
});

describe('AC27: どの 輪に 入るかは 近い 方の 中心との チェビシェフ距離', () => {
  const A = { cx: 0, cz: 0 };
  const B = { cx: 30, cz: 0 };
  const l = () => new RingLayout([A, B], RING_SMALL);
  it('dist は 2 つの 中心の うち 小さい 方', () => {
    expect(l().dist(3, 2)).toBe(3);
    expect(l().dist(28, -1)).toBe(2);
    expect(l().dist(15, 0)).toBe(15);
  });
  it('B の まわりだけ にいる 列も 描く・光・生成・残す に 入る(A から 遠くても)', () => {
    const x = l();
    expect(x.inDraw(30 + 4, 0)).toBe(true);
    expect(x.inDraw(30 + 5, 0)).toBe(false);
    expect(x.inLight(30 + 5, 0)).toBe(true);
    expect(x.inGen(30 + 6, 0)).toBe(true);
    expect(x.inGen(30 + 7, 0)).toBe(false);
    expect(x.inKeep(30 + 8, 0)).toBe(true);
    expect(x.inKeep(30 + 9, 0)).toBe(false);
    expect(x.shouldDropMesh(30 + 5, 0)).toBe(false);
    expect(x.shouldDropMesh(30 + 6, 0)).toBe(true);
  });
  it('2 つの 輪の あいだ(どちらからも 遠い)は ぜんぶ 外', () => {
    const x = l();
    expect(x.inKeep(15, 0)).toBe(false);
    expect(x.inGen(15, 0)).toBe(false);
  });
  it('近い順の 並び: 小さい 方の 距離で 並ぶ(keepColumns の dist が 増えるだけ)', () => {
    const x = l();
    const d = x.keepColumns().map((c) => x.dist(c.cx, c.cz));
    for (let i = 1; i < d.length; i++) expect(d[i]!).toBeGreaterThanOrEqual(d[i - 1]!);
    expect(d[0]).toBe(0);
  });
  it('どの 並びも いつも 同じ(決定的)', () => {
    expect(l().genColumns()).toEqual(l().genColumns());
  });
});
