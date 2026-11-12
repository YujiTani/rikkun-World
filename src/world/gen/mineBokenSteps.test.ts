// 古い 形（v1）の 世界を 確かめる テスト: 既定は 新しい 景色（木 v2・山 v2・目じるし）なので、古い 形を はっきり 指定する（world/gen/lookFlags.ts。import より 前に きまる）
vi.hoisted(() => {
  (globalThis as { location?: unknown }).location = { search: '?trees=v1&mountain=v1&structures=0&drift=0' };
});
import { describe, expect, it, vi } from 'vitest';
import { colKey } from '../stream/ring';
import SIGS from './__fixtures__/mineBokenPlanSigs.json';
import { buildOps, buildOpsSteps } from './mineShaftOps';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { regionJobC } from './mineShaftRegionC';
import { regionHit, regionLand } from './mineShaftSite';
import { ShaftWorld } from './mineShafts';

/**
 * MINE-1E 性能ループ（docs/design/MINE-1E.md §4.14「計画は 先読みで 1 ステップ 3 ms ずつ」）:
 * 計画を 細かく 区切って yield しても、同じ シードなら 計画の 中身〔ブロック配置〕が 1 ブロックも かわらない こと。
 *
 *   見本 `__fixtures__/mineBokenPlanSigs.json` は 区切る 前〔PR #430 の 頭 cf3b654a〕の コードで 作った:
 *   シード 2 つ × 区画 200 こ〔スタートに 近い 順〕の 計画を ハッシュに した もの。置かれた 区画だけ 書いて あり、ほかは 計画が null。
 *   ハッシュは 坑道の 記録・道・空気・かべ・置く 物・列ごとの 置く 物・かかる 列・部屋の 列・場所の 窓口を ぜんぶ ふくむ。
 *   〔見本は 書きかえて 通さない。ハッシュの 作り方は `sigOf`〕
 *   〔HOUSE-2A（#364）で 一度だけ 作りなおした: 坑道の 計画に レシピ〔shaft.recipe・宝箱の ない 坑道の まきもの ブロック〕を 足した ため。
 *     作りなおし方 ＝ 下の `sigOf`・`regions200`・`regionJob` と 同じ 式で 2 シード × 200 区画を 回して 置かれた 区画の ハッシュを 書き出す。
 *     たしかめ ＝ shaft の recipe 欄を ぬいて 計算すると 宝箱の 坑道は 古い 見本と ぴったり 同じ・ちがうのは まきものの 坑道 だけ〕
 */

vi.setConfig({ testTimeout: 900_000 });

const fnv = (s: string): string => {
  let v = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) v = Math.imul(v ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return v.toString(16);
};

type Planned = NonNullable<ReturnType<ShaftWorld['region']>>;

/** 計画の ハッシュ〔ブロック配置の ぜんぶ〕 */
function sigOf(p: Planned): string {
  const ops = p.ops ?? buildOps(p.plan);
  const b = p.plan.b;
  const parts = [
    JSON.stringify(p.plan.shaft),
    p.plan.path.map((c) => `${c.part},${c.x},${c.y},${c.z}`).join(';'),
    [...b.air].join(','),
    [...b.ring].join(','),
    [...b.put].map(([k, v]) => `${k}:${v}`).join(','),
    [...ops].map(([k, o]) => `${k}:${[...o.ring].join('.')}|${[...o.air].join('.')}|${[...o.put].join('.')}`).join(';'),
    [...p.plan.cols].join(','),
    [...p.plan.roomCols].join(','),
    [...(p.plan.areas ?? [])].join(','),
  ];
  return fnv(parts.join('#'));
}

/** スタートに 近い 順の 区画 200 こ〔見本を 作った ときと 同じ 順〕 */
function regions200(): [number, number][] {
  const regs: [number, number][] = [];
  for (let rz = -9; rz <= 9; rz++) for (let rx = -9; rx <= 9; rx++) regs.push([rx, rz]);
  regs.sort((a, b) => Math.hypot(a[0] + 0.5, a[1] + 0.5) - Math.hypot(b[0] + 0.5, b[1] + 0.5));
  return regs.slice(0, 200);
}

const SEEDS = Object.keys(SIGS).map(Number);
const expectedOf = (seed: number): Record<string, string> => (SIGS as Record<string, Record<string, string>>)[String(seed)]!;

describe('1E の 計画: 区切って 先読みしても 中身は 同じ', () => {
  it('見本が ある〔シード 2 つ・置かれた 区画が 20 こ 以上〕', () => {
    expect(SEEDS.length).toBe(2);
    for (const seed of SEEDS) expect(Object.keys(expectedOf(seed)).length, `seed ${seed}`).toBeGreaterThan(20);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: 区画 200 この 計画が 区切る 前と 1 ブロックも ちがわない〔先読みと 同じ 1 ステップずつの 仕事で すすめる〕`, () => {
      const w = new ShaftWorld(seed, undefined, undefined);
      const want = expectedOf(seed);
      const bad: string[] = [];
      let steps = 0;
      let placed = 0;
      for (const [rx, rz] of regions200()) {
        // `warm` が 毎ステップ すすめる のと 同じ 仕事を 1 つずつ すすめる
        const job = (w as unknown as { regionJob(rx: number, rz: number): Generator<void, Planned | null> }).regionJob(rx, rz);
        let r = job.next();
        steps++;
        while (!r.done) {
          r = job.next();
          steps++;
        }
        const got = r.value ? sigOf(r.value) : null;
        const exp = want[`${rx},${rz}`] ?? null;
        if (got !== exp) bad.push(`(${rx}, ${rz}): ${got} ≠ ${exp}`);
        if (r.value) placed++;
      }
      expect(bad.slice(0, 6), `${bad.length} 区画が ちがう`).toEqual([]);
      expect(placed, '置かれた 区画の 数').toBe(Object.keys(want).length);
      // 1 区画ごとに 1 回で 終わらず 細かく 区切って いる〔置かれた 区画は 1 つ あたり 数百 ステップ〕
      expect(steps / placed, '1 区画あたりの ステップ').toBeGreaterThan(300);
    });
  }

  it('region()〔いっきに 計画〕も 見本と 同じ', () => {
    const seed = SEEDS[0]!;
    const w = new ShaftWorld(seed, undefined, undefined);
    const want = expectedOf(seed);
    for (const key of Object.keys(want).slice(0, 8)) {
      const [rx, rz] = key.split(',').map(Number) as [number, number];
      const p = w.region(rx, rz);
      expect(p, key).not.toBeNull();
      expect(sigOf(p!), key).toBe(want[key]);
    }
  });
});

describe('置く 物〔buildOps〕を 区切って 作る', () => {
  it('大きい 計画では 何回かに 分かれ、いっきに 作った ときと 同じ', () => {
    const seed = SEEDS[0]!;
    const w = new ShaftWorld(seed, undefined, undefined);
    const key = Object.keys(expectedOf(seed))[0]!;
    const [rx, rz] = key.split(',').map(Number) as [number, number];
    const plan = w.region(rx, rz)!.plan;
    const cells = plan.b.ring.size + plan.b.air.size + plan.b.put.size;
    expect(cells, '標本の 計画が 1 回分より 大きい').toBeGreaterThan(S.plan.opsChunk);
    const job = buildOpsSteps(plan);
    let steps = 0;
    let r = job.next();
    while (!r.done) {
      steps++;
      r = job.next();
    }
    expect(steps).toBeGreaterThanOrEqual(Math.floor(cells / S.plan.opsChunk));
    const one = buildOps(plan);
    expect([...r.value.keys()]).toEqual([...one.keys()]);
    for (const [k, o] of one) {
      const q = r.value.get(k)!;
      expect([...q.ring, ...q.air, ...q.put]).toEqual([...o.ring, ...o.air, ...o.put]);
    }
  });
});

describe('古い 世界: 1E を 使う 区画では 1C の 計画を 作らない', () => {
  /** 1C の 計画の 列が 区画の まわり `v6Margin` マスの 中に おさまる〔おさまるから、その 外だけ なら 1C は 読まれない〕 */
  it('1C の 計画の 列は ぜんぶ 区画の まわり v6Margin マスの 中', () => {
    const R = S.region;
    const m = S.plan.v6Margin;
    let plans = 0;
    for (const seed of SEEDS) {
      const w = new ShaftWorld(seed, undefined, undefined);
      const env = { isOld: () => false, isOldHeya: () => false, link: null, heya: true } as const;
      for (const [rx, rz] of regions200().slice(0, 120)) {
        if (!(regionHit(seed, rx, rz) && regionLand(w.G, rx, rz) >= S.minLand)) continue;
        const job = regionJobC(w.G, env, rx, rz);
        let r = job.next();
        while (!r.done) r = job.next();
        if (!r.value) continue;
        plans++;
        const lo = [(rx * R - m) >> 4, (rz * R - m) >> 4] as const;
        const hi = [(rx * R + R - 1 + m) >> 4, (rz * R + R - 1 + m) >> 4] as const;
        for (const k of r.value.plan.cols) {
          const cx = Math.floor(k / 65536) - 32768;
          const cz = (k % 65536) - 32768;
          expect(cx >= lo[0] && cx <= hi[0] && cz >= lo[1] && cz <= hi[1], `seed ${seed} 区画 (${rx}, ${rz}) 列 (${cx}, ${cz})`).toBe(true);
        }
      }
    }
    expect(plans, '1C の 計画を 見た 数').toBeGreaterThan(5);
  });

  it('1E の 一覧が 遠くだけ なら、新しい 世界と 同じ 計画〔gen e〕。区画の 近くに あれば 1C の 計画も ためす', () => {
    const seed = SEEDS[0]!;
    const want = expectedOf(seed);
    const far = { kodo: new Set<number>(), heya: new Set<number>(), boken: new Set<number>([colKey(5000, 5000)]) };
    const w = new ShaftWorld(seed, far, undefined);
    const keys = Object.keys(want).slice(0, 6);
    for (const key of keys) {
      const [rx, rz] = key.split(',').map(Number) as [number, number];
      const p = w.region(rx, rz);
      expect(p?.plan.shaft.gen, key).toBe('e');
      expect(sigOf(p!), key).toBe(want[key]);
    }
    // 1C の 計画の 列に 1E の 列が かかる 区画は 1C の まま
    const plain = new ShaftWorld(seed, undefined, undefined);
    const env = { isOld: () => false, isOldHeya: () => false, link: null, heya: true } as const;
    let checked = 0;
    for (const [rx, rz] of regions200()) {
      if (plain.region(rx, rz) === null) continue; // 坑道が ない 区画・スタートの 区画
      const job = regionJobC(plain.G, env, rx, rz);
      let r = job.next();
      while (!r.done) r = job.next();
      const c = r.value;
      if (!c) continue;
      const near = new ShaftWorld(seed, { kodo: new Set<number>(), heya: new Set<number>(), boken: new Set<number>([[...c.plan.cols][0]!]) }, undefined);
      const p = near.region(rx, rz);
      expect(p?.plan.shaft.gen, `(${rx}, ${rz})`).toBe('c');
      expect(p!.plan.shaft.id, `(${rx}, ${rz})`).toBe(c.plan.shaft.id);
      expect(p!.plan.path.length, `(${rx}, ${rz})`).toBe(c.plan.path.length);
      if (++checked >= 2) break;
    }
    expect(checked, '1C の 計画が ある 区画').toBeGreaterThan(0);
  });
});
