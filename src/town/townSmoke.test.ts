import { describe, expect, it } from 'vitest';
import { TownSmoke, SMOKE } from './townSmoke';
import { TOWN } from './townTuning';

/** TOWN-1 1B-2: かじやの えんとつの けむり。つぶは 24 こまで 使い回す・近くに いる ときだけ 出る・上へ のぼって きえる・乱数は シード付き */
const DT = 1 / 60;
const SPOT = { x: 10.5, y: 160, z: 20.5 };

function run(s: TownSmoke, steps: number, spot: typeof SPOT | null, near: boolean): number {
  let peak = 0;
  for (let i = 0; i < steps; i++) {
    s.update(DT, spot, near);
    peak = Math.max(peak, s.activeCount());
  }
  return peak;
}

describe('かじやの けむり', () => {
  it('つぶは 表の 上限（24）を こえない・数は 作った ときから かわらない（使い回す）', () => {
    const s = new TownSmoke(5);
    const arr = s.puffs;
    const n = arr.length;
    const peak = run(s, 60 * 30, SPOT, true);
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(TOWN.perf.smokeMax);
    expect(s.puffs).toBe(arr);
    expect(s.puffs.length).toBe(n);
    expect(n).toBeLessThanOrEqual(TOWN.perf.smokeMax);
  });

  it('近くに いない ときは 新しく 出ない・のこった つぶは きえる', () => {
    const s = new TownSmoke(5);
    run(s, 240, SPOT, true);
    expect(s.activeCount()).toBeGreaterThan(0);
    run(s, Math.ceil((SMOKE.life * 1.3) / DT), SPOT, false);
    expect(s.activeCount()).toBe(0);
  });

  it('ゆっくり 上へ のぼり、年を とるほど うすく（age/life が 大きく）なって きえる', () => {
    const s = new TownSmoke(5);
    run(s, 90, SPOT, true);
    const act = s.puffs.filter((p) => p.active);
    expect(act.length).toBeGreaterThan(0);
    const old = act.reduce((a, b) => (b.age > a.age ? b : a));
    expect(old.y).toBeGreaterThan(SPOT.y);
    expect(old.y - SPOT.y).toBeLessThan(SMOKE.rise * old.age * 1.3 + 0.5);
    expect(old.age).toBeLessThan(old.life);
  });

  it('同じ シードなら 同じ 動き', () => {
    const a = new TownSmoke(9);
    const b = new TownSmoke(9);
    run(a, 200, SPOT, true);
    run(b, 200, SPOT, true);
    expect(a.puffs.map((p) => [p.x, p.y, p.z, p.age])).toEqual(b.puffs.map((p) => [p.x, p.y, p.z, p.age]));
  });
});
