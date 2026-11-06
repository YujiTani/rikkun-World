import { describe, expect, it } from 'vitest';
import { smoothTips } from './mineHiroiRanges';
import { tryHiroiPlan } from './mineHiroiPlan';
import { turnPlan } from './mineHiroiShape';
import { hiroiTable } from './mineHiroiTable';

/** ひろい ほらあな B の 計画（純粋な 関数）。数は hiroiTable() から 読む（#311）。形の くわしい きまりは mineCaveHiroi.test.ts（D15）が ブロックで 見る */
describe('ひろい ほらあな B の 計画', () => {
  const T = hiroiTable();
  const seeds = Array.from({ length: 40 }, (_, i) => 100 + i * 7);

  it('同じ シードは 同じ 形', () => {
    const a = tryHiroiPlan(5, 'nakahodo').plan;
    const b = tryHiroiPlan(5, 'nakahodo').plan;
    expect(a && JSON.stringify([a.pillars, a.knobs, a.bumps, [...a.lo], [...a.hi]])).toBe(b && JSON.stringify([b.pillars, b.knobs, b.bumps, [...b.lo], [...b.hi]]));
  });

  it('ほとんどの シードで 置ける', () => {
    expect(seeds.filter((s) => tryHiroiPlan(s, 'nakahodo').plan).length).toBeGreaterThanOrEqual(seeds.length * 0.9);
  });

  it('ためす 回数は どの 部屋でも 上の 限り 以下・置けた 部屋の 計画に 同じ 数が ある', () => {
    for (let i = 0; i < 80; i++) {
      const r = tryHiroiPlan(i * 13 + 1, 'nakahodo');
      for (const key of Object.keys(T.work) as (keyof typeof T.work)[]) expect(r.work[key]).toBeLessThanOrEqual(T.work[key]);
      if (r.plan) expect(r.plan.work).toEqual(r.work);
    }
  });

  it('ほった 形に 1 マスの とがりが 残らない（柱の 列を のぞく）', () => {
    for (const s of seeds) {
      const p = tryHiroiPlan(s, 'nakahodo').plan;
      if (!p) continue;
      const { x: sx, z: sz } = p.size;
      const lo = p.lo.slice();
      const hi = p.hi.slice();
      expect(smoothTips(sx, sz, lo, hi, p.pillars, () => true), `seed ${s}`).toBe(true);
      expect([...hi], `seed ${s}: ならし 済み`).toEqual([...p.hi]);
    }
  });

  it('向きを まわしても 列の 数・空気の 列の 数が かわらない', () => {
    const p = tryHiroiPlan(7, 'nakahodo').plan!;
    const air = (l: { lo: Int8Array; hi: Int8Array }): number => [...l.hi].filter((h, i) => h > l.lo[i]!).length;
    for (const t of [0, 1, 2, 3] as const) {
      const l = turnPlan(p, t);
      expect(air(l)).toBe(air(p));
      expect(l.size.x * l.size.z).toBe(p.size.x * p.size.z);
      expect(l.pillars.length).toBe(p.pillars.length);
    }
  });
});
