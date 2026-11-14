import { describe, expect, it } from 'vitest';
import { shapedTreeCells } from '../world/gen/treeShapes';
import { chooseTown } from './townPlace';
import { TownPlan } from './townPlan';
import { townBuildingColumns } from './townBuildings';
import { CANAL, SURF, at, inLocal } from './townLayout';
import { TOWN } from './townTuning';

/** AC45〔1B-2〕木: 街の 木は 今の 木（treeV2）の 形・上限 以下・建物・道・橋・門・あきちに かからない・同じ シードで 同じ */
const SEEDS = [1, 2, 3, 5, 7, 11, 19, 42, 77, 100];
const FORMS = ['round', 'maple', 'pine', 'conifer'];

function planOf(seed: number): TownPlan {
  return new TownPlan(chooseTown(seed)!);
}

describe('AC45 街の 木', () => {
  it('数は 上限 以下で、さくら（ひろば・用水路ぞい）と ふつうの 木が ある', () => {
    for (const seed of SEEDS) {
      const t = planOf(seed).trees();
      expect(t.length).toBeLessThanOrEqual(TOWN.trees.max);
      expect(t.filter((x) => x.sakura).length).toBeGreaterThanOrEqual(5);
      expect(t.filter((x) => !x.sakura).length).toBeGreaterThanOrEqual(8);
      expect(planOf(seed).info().trees.length).toBe(t.length);
    }
  });

  it('ぜんぶ 今の 木（treeV2）の 形の どれか・同じ シードで 同じ 木', () => {
    for (const seed of SEEDS) {
      const a = planOf(seed).trees();
      const b = planOf(seed).trees();
      expect(a).toEqual(b);
      for (const t of a) {
        expect(FORMS).toContain(t.form);
        expect(['s', 'm', 'l']).toContain(t.size);
        expect(t.trunk).toBeGreaterThan(0);
      }
    }
  });

  it('みきも はっぱも 建物・道・橋・門・用水路・あきち・石どうろうに かからない（20 シード）', { timeout: 120_000 }, () => {
    const cols = townBuildingColumns();
    for (let seed = 1; seed <= 20; seed++) {
      const plan = planOf(seed);
      const L = plan.layout;
      for (const t of plan.trees()) {
        for (const c of shapedTreeCells(t)) {
          const p = plan.toLocal(c.x, c.z);
          expect(p, `seed ${seed} 街の 外に はみ出し`).not.toBeNull();
          const k = at(p!.u, p!.v);
          expect(inLocal(p!.u, p!.v)).toBe(true);
          expect(L.canal[k]).toBe(CANAL.none);
          expect([SURF.ground, SURF.terrace]).toContain(L.surf[k]);
          expect(L.rail[k] + L.notch[k] + L.wall[k]).toBe(0);
          expect(L.bridge[k]).toBe(0);
          expect(cols.has(k), `seed ${seed} 建物に かかる ${p!.u},${p!.v}`).toBe(false);
          expect(plan.toroAt.has(k)).toBe(false);
          expect(plan.lotPostAt.has(k)).toBe(false);
          expect(plan.stairTopAt.has(k)).toBe(false);
        }
      }
    }
  });

  it('門に ちかい 手前（v > vMax）には 植えない・木どうしは はなれる', () => {
    for (const seed of SEEDS) {
      const plan = planOf(seed);
      const ts = plan.trees();
      for (const t of ts) {
        const p = plan.toLocal(t.x, t.z)!;
        expect(p.v).toBeLessThanOrEqual(TOWN.trees.vMax);
      }
      for (let i = 0; i < ts.length; i++) {
        for (let j = i + 1; j < ts.length; j++) {
          expect(Math.hypot(ts[i]!.x - ts[j]!.x, ts[i]!.z - ts[j]!.z)).toBeGreaterThanOrEqual(TOWN.trees.gapPlain);
        }
      }
    }
  });

  it('さくらは ひろばの まわり か 用水路ぞいに ある', () => {
    for (const seed of SEEDS) {
      const plan = planOf(seed);
      const L = plan.layout;
      const sak = plan.trees().filter((t) => t.sakura);
      const plazaN = sak.filter((t) => {
        const p = plan.toLocal(t.x, t.z)!;
        const d = Math.max(L.plaza.u0 - p.u, p.u - L.plaza.u1, L.plaza.v0 - p.v, p.v - L.plaza.v1);
        return d >= TOWN.trees.plazaNear.min && d <= TOWN.trees.plazaNear.max;
      }).length;
      expect(plazaN).toBeGreaterThanOrEqual(3);
      expect(sak.length - plazaN).toBeGreaterThanOrEqual(3);
      // ひろばの まわりでは ない さくらは 用水路ぞい
      for (const t of sak) {
        const p = plan.toLocal(t.x, t.z)!;
        const d = Math.max(L.plaza.u0 - p.u, p.u - L.plaza.u1, L.plaza.v0 - p.v, p.v - L.plaza.v1);
        const nearPlaza = d >= TOWN.trees.plazaNear.min && d <= TOWN.trees.plazaNear.max;
        let canalD = Infinity;
        for (let dv = -8; dv <= 8; dv++) for (let du = -8; du <= 8; du++) if (inLocal(p.u + du, p.v + dv) && L.canal[at(p.u + du, p.v + dv)] !== CANAL.none) canalD = Math.min(canalD, Math.max(Math.abs(du), Math.abs(dv)));
        expect(nearPlaza || (canalD >= TOWN.trees.canalNear.min && canalD <= TOWN.trees.canalNear.max)).toBe(true);
      }
    }
  });
});

describe('AC45 ふちの 石どうろう', () => {
  it('ふちに そって となりどうしが 8 マス 以下（門の 前の 1 か所 だけ のぞく）・光る 物は 上限 以下', () => {
    const plan = planOf(1);
    const L = plan.layout;
    const n = TOWN.size;
    // ふちを ぐるっと 1 周する 長さ（左上から 時計まわり）
    const along = (p: { u: number; v: number }): number => (p.v === 0 ? p.u : p.u === n - 1 ? n - 1 + p.v : p.v === n - 1 ? 2 * (n - 1) + (n - 1 - p.u) : 3 * (n - 1) + (n - 1 - p.v));
    const ring = 4 * (n - 1);
    const pos = L.toro.map(along).sort((a, b) => a - b);
    for (const p of L.toro) expect(p.u === 0 || p.v === 0 || p.u === n - 1 || p.v === n - 1).toBe(true);
    const gaps = pos.map((p, i) => ((pos[(i + 1) % pos.length]! - p + ring) % ring));
    const big = gaps.filter((g) => g > 8);
    expect(big.length).toBe(1);
    expect(big[0]!).toBeLessThanOrEqual((TOWN.toro.skipNearGate + 1) * 8);
    const info = plan.info();
    expect(info.lights.length).toBeLessThanOrEqual(TOWN.lightsMax);
    expect(info.lights.filter((l) => l.kind === 'toro').length).toBe(L.toro.length);
  });
});
