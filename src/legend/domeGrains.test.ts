import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts';
import { createDomeGrains, IDLE_GRAINS, PULL_GRAINS_MAX, SHARD_COUNT } from './domeGrains';

/** WEAPON-9 AC58: すいよせの つぶ（かけら 24 ＋ つぶ ≦ 64・F41〜200 だけ・外から 内へ） */
const C: Vec3 = { x: 0, y: 3, z: 0 };
const run = (F0: number, F1: number, pulled: () => Vec3[], reduced = false) => {
  const g = createDomeGrains();
  const frames: { F: number; grains: { id: number; kind: string; d: number }[]; counts: ReturnType<typeof g.counts>; n: number }[] = [];
  for (let F = F0; F <= F1; F++) {
    const R = F >= 40 && F < 240 ? 7 : F < 40 ? (7 * F) / 40 : 0;
    g.step({ F, center: C, radius: R, pulled: pulled(), reduced });
    frames.push({ F, grains: g.list().slice(0, g.count()).map((q) => ({ id: q.id, kind: q.kind, d: Math.hypot(q.x - C.x, q.y - C.y, q.z - C.z) })), counts: g.counts(), n: g.count() });
  }
  return frames;
};

describe('AC58 つぶの 数', () => {
  it('妖怪なし F41〜200: つぶ 1〜16。かけらは 24', () => {
    const fr = run(1, 240, () => []);
    for (const f of fr.filter((q) => q.F >= 42 && q.F <= 200)) {
      expect(f.counts.idle + f.counts.pull, `F${f.F}`).toBeGreaterThanOrEqual(1);
      expect(f.counts.idle + f.counts.pull).toBeLessThanOrEqual(IDLE_GRAINS);
      expect(f.counts.shards).toBe(SHARD_COUNT);
    }
  });
  it('F1〜40・F201 以後は つぶ 0', () => {
    const fr = run(1, 260, () => [{ x: 9, y: 3, z: 0 }]);
    for (const f of fr.filter((q) => q.F <= 40 || q.F >= 201)) expect(f.counts.idle + f.counts.pull, `F${f.F}`).toBe(0);
  });
  it('すわれて いる 妖怪 10 体: つぶ ＋ かけら ≦ 64・妖怪なしより 多い', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ x: 9 + i * 0.1, y: 3, z: i * 0.2 }));
    const a = run(1, 200, () => ten);
    const b = run(1, 200, () => []);
    for (const f of a) expect(f.n).toBeLessThanOrEqual(64);
    expect(a.at(-1)!.n).toBeGreaterThan(b.at(-1)!.n);
    expect(a.at(-1)!.counts.pull).toBeLessThanOrEqual(PULL_GRAINS_MAX);
  });
  it('じわっと ふえる（10 ステップかけて）', () => {
    const ten = [{ x: 9, y: 3, z: 0 }];
    let on = false;
    const g = createDomeGrains();
    const pulls: number[] = [];
    for (let F = 1; F <= 130; F++) {
      if (F === 100) on = true;
      g.step({ F, center: C, radius: F < 40 ? (7 * F) / 40 : 7, pulled: on ? ten : [], reduced: false });
      if (F >= 99) pulls.push(g.counts().pull);
    }
    expect(pulls[0]).toBe(0);
    expect(pulls[1]!).toBeLessThan(pulls[9]!);
    expect(pulls.at(-1)!).toBeGreaterThan(0);
  });
});

describe('つぶは どの ステップも 中心へ 近づく', () => {
  it('同じ id の つぶは 前の ステップより 中心への きょりが へる', () => {
    const fr = run(1, 200, () => [{ x: 10, y: 3, z: 0 }]);
    const last = new Map<number, number>();
    for (const f of fr) {
      for (const q of f.grains.filter((x) => x.kind !== 'shard')) {
        if (last.has(q.id)) expect(q.d, `id ${q.id} F${f.F}`).toBeLessThan(last.get(q.id)!);
        last.set(q.id, q.d);
      }
    }
    expect(last.size).toBeGreaterThan(0);
  });
});

describe('「動きを減らす」', () => {
  it('つぶは 半分', () => {
    const a = run(1, 120, () => [], false).at(-1)!.counts.idle;
    const b = run(1, 120, () => [], true).at(-1)!.counts.idle;
    expect(b).toBe(Math.round(a / 2));
  });
});
