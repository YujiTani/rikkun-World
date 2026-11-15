import { describe, expect, it } from 'vitest';
import { chooseTown } from './townPlace';
import { TownPlan } from './townPlan';
import { ATHLETIC } from './townAthletic';
import { townBuildingCells } from './townBuildings';
import { TownDrum } from './townDrum';

/** AC47: town.info().athletic（TOWN-1.md §6.1）の 中身は 表の とおり。太鼓の 位置の ブロックは 本当に 太鼓 */
describe('info().athletic', () => {
  const plan = new TownPlan(chooseTown(1)!);
  const a = plan.info().athletic;

  it('くい 8 以上・とび石 4 以上・丸太・やぐら・つり橋・すべり台・太鼓が ある。高さは 表から', () => {
    expect(a.posts.length).toBeGreaterThanOrEqual(8);
    expect(a.stones.length).toBeGreaterThanOrEqual(4);
    for (const k of ['log', 'tower', 'bridge', 'slide', 'drum'] as const) expect(Number.isFinite(a[k].x + a[k].y + a[k].z)).toBe(true);
    const G = plan.rec.groundY;
    expect(a.log.y).toBe(G + 1 + ATHLETIC.logs.h);
    expect(a.drum.y).toBe(G + 1 + ATHLETIC.goalTower.h);
    expect(a.posts.map((p) => p.y - G - 1).sort()).toEqual(ATHLETIC.stakes.map((s) => s[2]).sort());
  });

  it('はんい（min・max）は かこいの 四角。太鼓は その 中', () => {
    expect(a.min.x).toBeLessThanOrEqual(a.drum.x);
    expect(a.max.x).toBeGreaterThanOrEqual(a.drum.x);
    expect(a.min.z).toBeLessThanOrEqual(a.drum.z);
    expect(a.max.z).toBeGreaterThanOrEqual(a.drum.z);
  });

  it('太鼓の 位置は 表の 太鼓の ブロック。TownDrum は そこだけ 太鼓', () => {
    const t = townBuildingCells().find((c) => c.id === 'town_taiko' && c.u === ATHLETIC.goalTower.u0 && c.v === 81)!;
    const w = plan.toWorld(t.u, t.v);
    expect(Math.floor(a.drum.x)).toBe(w.x);
    expect(Math.floor(a.drum.z)).toBe(w.z);
    const d = new TownDrum(a.drum);
    expect(d.isDrum(w.x, plan.rec.groundY + 1 + t.dy, w.z)).toBe(true);
  });
});
