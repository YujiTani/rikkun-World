import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { colKey } from '../stream/ring';
import { legacyOld } from './mineShaftKit';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { shaftWorldFor } from './mineShafts';
import { planShaft, type PlanEnv, type ShaftPlan } from './mineShaftPlan';
import { geoFor, regionSites, startSites, type Site } from './mineShaftSite';
import type { ShaftSide } from './mineShaftTypes';

/**
 * MINE-1D 区切り 5 の 直し〔コードレビュー A の 重大 1・2。docs/design/MINE-1.md §4.7.1・§4.7.5〕:
 *  ・はじまりの 坑道: 場所は 1C の 順〔link なし〕で きまり、なかほどの いちばん 上の 横穴 1 本だけが ほたるへ。ほかの 横穴は 1C と 同じ。
 *  ・坑道の へや: 横穴ごとに 1C の 形を 先に 作り〔主の 乱数は 1C と 同じだけ すすむ〕、1C の 形・へやの 形の どちらかが 古い 列に かかれば 1C の 形。
 * 「1C」＝ 同じ 計画に `heya: false`〔へやの くじ・ほたるの つなぎ なし〕を わたした もの。
 */

vi.setConfig({ testTimeout: 240_000 });

const SEEDS = [20261012, 7, 31415, 1000, 2024, 99];
const env = (o: Partial<PlanEnv> = {}): PlanEnv => ({ isOld: () => false, isOldHeya: () => false, link: null, heya: true, ...o });
const view = (d: ShaftSide) => ({ layer: d.layer, from: d.from, to: d.to, end: d.end, length: d.length, bends: d.bends });

/** 1C の はじまりの 坑道: 1C の 順の さいしょの 成功 */
function start1C(seed: number): { site: Site; a: number; plan: ShaftPlan } {
  const G = geoFor(seed);
  for (const site of startSites(G)) {
    for (let a = 0; a < S.planTries; a++) {
      const plan = planShaft(G, site, 'start', true, env({ heya: false }), a);
      if (plan) return { site, a, plan };
    }
  }
  throw new Error('1C の はじまりの 坑道が ない');
}

const topNaka = (sides: readonly ShaftSide[]): number => {
  let best = -1;
  sides.forEach((d, i) => {
    if (d.layer === 'nakahodo' && (best < 0 || d.from.y > sides[best]!.from.y)) best = i;
  });
  return best;
};

describe('はじまりの 坑道は 1C の まま〔ほたるの 横穴 1 本 だけ ちがう〕', () => {
  for (const seed of SEEDS) {
    it(`シード ${seed}: 場所・ほかの 横穴は 1C と 同じ・いちばん 上の なかほどの 横穴だけ ほたるの ほらあなへ`, () => {
      const ref = start1C(seed);
      const plan = shaftWorldFor(seed).start()!.plan;
      expect(plan.shaft.entrance.x).toBe(ref.site.x);
      expect(plan.shaft.entrance.z).toBe(ref.site.z);
      const t = topNaka(ref.plan.shaft.sides);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(plan.shaft.sides.length).toBe(ref.plan.shaft.sides.length);
      plan.shaft.sides.forEach((d, i) => {
        if (i === t) {
          expect(d.layer).toBe('nakahodo');
          expect(d.from.y).toBe(ref.plan.shaft.sides[t]!.from.y);
          expect(d.end).toBe('cave');
          expect(d.cave).toMatch(/_nakahodo$/);
        } else {
          expect(view(d)).toEqual(view(ref.plan.shaft.sides[i]!));
        }
      });
      // わく・宝箱・入口・へや・山は 1C と 同じ
      expect(plan.shaft.chest).toEqual(ref.plan.shaft.chest);
      expect(plan.shaft.room).toEqual(ref.plan.shaft.room);
      expect(plan.shaft.mound).toEqual(ref.plan.shaft.mound);
      // 1C の 道の マスは、ほたるへ 変えた 横穴の ぶん〔1 本〕を のぞいて のこる
      const here = new Set(plan.path.map((c) => `${c.x},${c.y},${c.z}`));
      const lost = ref.plan.path.filter((c) => !here.has(`${c.x},${c.y},${c.z}`));
      const aroundTarget = ref.plan.shaft.sides[t]!;
      for (const c of lost) expect(Math.abs(c.y - aroundTarget.from.y)).toBeLessThanOrEqual(8);
    });
  }

  it('保存の 見本〔1C の あと〕: ほたるに ならなかった 2 本の 横穴は 見本と 同じ', () => {
    const fx = JSON.parse(readFileSync(new URL('../../save/__fixtures__/mine1c-before.json', import.meta.url), 'utf8')) as { start: { sides: { layer: string; from: unknown; to: unknown; end: string }[] } };
    const plan = shaftWorldFor(20261012).start()!.plan;
    const t = topNaka(fx.start.sides as never);
    const mine = plan.shaft.sides.map((d) => ({ layer: d.layer, from: d.from, to: d.to, end: d.end }));
    expect(mine.filter((_, i) => i !== t)).toEqual(fx.start.sides.filter((_, i) => i !== t));
  });
});

// MINE-1E の 準備で 直した: 「へやの 古い 列」は 1C・1D の 作り方の 坑道〔`gen: 'c'`〕の きまり。新しい 世界の ほかの 坑道は 1E の 坑道に なる ので、
// 1E の 前の 世界〔`legacyOld`: スタートの まわりの 列が ぜんぶ 1E の 古い 列〕の 区画で 見る。
const legacyWorld = (seed: number) => shaftWorldFor(seed, legacyOld(seed) as never);

/** 区画 (rx, rz) の 坑道を 同じ 場所・同じ 試行で 別の env で 計画しなおす */
function replan(seed: number, rx: number, rz: number, e: PlanEnv): ShaftPlan | null {
  const world = legacyWorld(seed);
  const want = world.region(rx, rz)?.plan.shaft.entrance;
  if (!want) return null;
  const G = geoFor(seed);
  for (const site of regionSites(G, rx, rz)) {
    if (site === null || site.x !== want.x || site.z !== want.z) continue;
    for (let a = 0; a < S.planTries; a++) {
      const base = planShaft(G, site, `r${rx}_${rz}`, false, env(), a);
      if (base) return planShaft(G, site, `r${rx}_${rz}`, false, e, a);
    }
  }
  return null;
}

describe('坑道の へやの 古い 列: 1C の 形が 古い 列に かかれば 1C の まま', () => {
  it('へやに なった 横穴の 1C の 形の 先の 列だけ 古い → その 横穴は 1C の 形・ほかは そのまま', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      for (let rz = -5; rz <= 5 && checked < 3; rz++) {
        for (let rx = -5; rx <= 5 && checked < 3; rx++) {
          const planned = legacyWorld(seed).region(rx, rz);
          if (!planned) continue;
          const sides = planned.plan.shaft.sides;
          const i = sides.findIndex((d) => d.end === 'heya');
          if (i < 0) continue;
          const one = replan(seed, rx, rz, env({ heya: false }));
          if (!one) continue;
          if (one.shaft.sides.length <= i) continue; // 1C の 形が 作れず へやだけ 入った 横穴は 確かめない
          const to = one.shaft.sides[i]!.to;
          const old = colKey(to.x >> 4, to.z >> 4);
          const part = replan(seed, rx, rz, env({ isOldHeya: (k) => k === old }));
          if (!part) continue; // 古い 列で 計画ごと あきらめた ときは 確かめない
          expect(part.shaft.sides.length).toBe(one.shaft.sides.length);
          expect(view(part.shaft.sides[i]!)).toEqual(view(one.shaft.sides[i]!));
          expect(part.shaft.sides[i]!.end).not.toBe('heya');
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(1);
  });
});
