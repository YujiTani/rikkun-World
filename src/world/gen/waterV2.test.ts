import { describe, expect, it, vi } from 'vitest';

// ?water=v2（と 山 v2）で ためす。フラグは 読みこみの ときに 決まる ので import より まえに 入れる
vi.hoisted(() => {
  (globalThis as { location?: unknown }).location = { search: '?mountain=v2&structures=1&water=v2' };
});

import { WORLD_HEIGHT } from '../../contracts';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { attach } from '../water/waterTestKit';
import { generateChunk } from './chunk';
import { featureSitesTouching, type FeatureSite } from './countryFeatures';
import { type Ctx } from './countryKit';
import { groundFn } from './countryStructureKit';
import { regionRect } from './region';
import { terrainFor } from './terrain';
import { waterSites } from './waterV2';
import { waterV2SpringsIn } from './waterV2Hook';
import { splashSpotsNear } from './waterV2Splash';
import { waterLeaks } from './waterV2Kit';

const seed = 20261012;
const T = terrainFor(seed);

/** 山の 升目（国だけの 物を さがす とき と 同じ Ctx） */
function mountains(): Ctx[] {
  const out: Ctx[] = [];
  for (let j = -12; j <= 12; j++) {
    for (let i = -12; i <= 12; i++) {
      const cell = T.map.cell(i, j);
      if (cell.mountain && cell.i === i && cell.j === j) out.push({ T, i, j, px: cell.px, pz: cell.pz, kind: cell.kind });
    }
  }
  return out;
}
const MOUNTS = mountains();
const WATER = new Set(['taki', 'kawa', 'ike']);
const all = MOUNTS.map((c) => ({ c, sites: waterSites(c, []) }));
const count = (t: string): number => all.reduce((n, a) => n + a.sites.filter((s) => s.type === t).length, 0);

describe('水の 景色 v2（?water=v2）', () => {
  it('山に 滝・川・池が 出る（0 本の 山も ある）', () => {
    expect(count('taki')).toBeGreaterThan(3);
    expect(all.filter((a) => a.sites.some((q) => q.type === 'taki')).length, '山の 7 割に 滝').toBeGreaterThanOrEqual(Math.ceil(MOUNTS.length * 0.7));
    expect(count('ike')).toBeGreaterThan(MOUNTS.length / 2);
    for (const a of all) expect(a.sites.filter((s) => s.type === 'taki').length, '1 つの 山に 0〜6 本（流れの 滝の 数の 上限）').toBeLessThanOrEqual(6);
  });

  it('高い かべ（落差 10 以上）の 滝の 6 割 以上は 段々（わきどころの 高さが 2 つ 以上）', () => {
    const takis = all.flatMap((a) => a.sites.filter((s) => s.type === 'taki'));
    const stages = (s: FeatureSite): number => new Set(s.blocks.filter((b) => b.id === 'wakimizu').map((b) => b.y)).size;
    // 落差 ≒ いちばん 上の わきどころ − いちばん 下の たきつぼ（たきつぼは 水面の 2〜4 下）
    const high = takis.filter((s) => Math.max(...s.blocks.filter((b) => b.id === 'wakimizu').map((b) => b.y)) - Math.min(...s.blocks.filter((b) => b.id === 'takitsubo').map((b) => b.y)) >= 12);
    expect(high.length).toBeGreaterThanOrEqual(3);
    expect(high.filter((s) => stages(s) >= 2).length / high.length, `段々 ${high.filter((s) => stages(s) >= 2).length} / ${high.length}`).toBeGreaterThanOrEqual(0.6);
    expect(Math.max(...takis.map(stages))).toBeLessThanOrEqual(4);
  });

  it('滝が ある 山には 川も 出る（滝つぼが くぼ地でも 出口を ほる）', () => {
    const withFall = all.filter((a) => a.sites.some((q) => q.type === 'taki'));
    const withRiver = withFall.filter((a) => a.sites.some((q) => q.type === 'kawa'));
    expect(withRiver.length).toBeGreaterThanOrEqual(Math.ceil(withFall.length * 0.8));
  });

  it('しぶきの 場所: 滝ごとに 1 つ 以上（落差 4 以上）・段々の 滝は 段の 数だけ', () => {
    const s = all.flatMap((a) => a.sites).find((q) => q.type === 'taki')!;
    const spots = splashSpotsNear(seed, s.x, s.z, 48, []);
    expect(spots.length).toBeGreaterThanOrEqual(1);
    for (const p of spots) expect(p.drop).toBeGreaterThanOrEqual(4);
  });

  it('池の ふち（水面の 近く）に いしれんがは 使わない', () => {
    for (const a of all) {
      for (const s of a.sites.filter((q) => q.type === 'ike')) {
        const water = Math.max(...s.blocks.filter((b) => b.id === 'water').map((b) => b.y));
        // 石どうろう（小）の 台は 池から はなれて 立つ ので、水の 2 マス 以内の いしれんがだけ 数える
        const wet = new Set(s.blocks.filter((b) => b.id === 'water').map((b) => `${b.x},${b.z}`));
        const near = (x: number, z: number): boolean => { for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (wet.has(`${x + dx},${z + dz}`)) return true; return false; };
        expect(s.blocks.filter((b) => b.y <= water + 2 && (b.id === 'renga_ishi' || b.id === 'koke_renga_ishi') && near(b.x, b.z)).length, `ike ${s.x},${s.z}`).toBe(0);
      }
    }
  });

  it('水は 外へ もれない（水の マスの よこは 水・いし・地面）', () => {
    for (const a of all) {
      const g = groundFn(a.c);
      const raw = (x: number, z: number): number => T.height(x, z);
      // 滝つぼと 川は つながって いる ので、山ごとに ぜんぶの ブロックを あわせて 見る（あとから 書いた 方が かつ）
      expect(waterLeaks(a.sites.flatMap((s) => s.blocks), (x, z) => (g(x, z) >= 0 ? g(x, z) : raw(x, z))), `mountain ${a.c.px},${a.c.pz}`).toEqual([]);
    }
  });

  it('同じ 結果（もういちど 作っても、順番を かえても 同じ）', { timeout: 120_000 }, () => {
    const rev = [...MOUNTS].reverse().map((c) => ({ c, sites: waterSites(c, []) })).reverse();
    rev.forEach((r, k) => expect(JSON.stringify(r.sites)).toBe(JSON.stringify(all[k]!.sites)));
  });

  it('てっぺんの 池・滝から すそ（海・すその 池）まで 1 本の 水が つながる（滝の ある 山の 7 割 以上）', () => {
    const withFall = all.filter((a) => a.sites.some((q) => q.type === 'taki'));
    const wet = (a: (typeof all)[number]): number[] => a.sites.filter((q) => WATER.has(q.type) && q.type !== 'ike').flatMap((q) => q.blocks.filter((b) => b.id === 'water').map((b) => b.y - T.map.baseHeight(b.x, b.z)));
    const reach = withFall.filter((a) => Math.min(...wet(a)) <= 6 && Math.max(...wet(a)) >= 8);
    expect(reach.length / withFall.length, `${reach.length} / ${withFall.length}`).toBeGreaterThanOrEqual(0.7);
    // 平らな 段の 池は 山に 2 こ ちかく（0 の 山は ない）
    for (const a of all) expect(a.sites.filter((q) => q.type === 'ike').length, `ike ${a.c.px},${a.c.pz}`).toBeGreaterThanOrEqual(1);
  });

  it('はじまりの 範囲（regionRect）には 置かない', () => {
    const r = regionRect(seed);
    for (const a of all) for (const s of a.sites) for (const b of s.blocks) expect(b.x >= r.x0 && b.x < r.x1 && b.z >= r.z0 && b.z < r.z1).toBe(false);
  });

  it('川は 下り つづける（水面が となりより 高くならない）: 段差は わきどころの 列だけ', () => {
    for (const a of all) {
      for (const s of a.sites.filter((q) => q.type === 'kawa')) {
        const water = new Map<string, number>(); // 列 → 水面（いちばん 上の 水の y）
        for (const b of s.blocks) if (b.id === 'water') water.set(`${b.x},${b.z}`, Math.max(water.get(`${b.x},${b.z}`) ?? 0, b.y));
        for (const [k, y] of water) {
          const [x, z] = k.split(',').map(Number) as [number, number];
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const n = water.get(`${x + dx},${z + dz}`);
            // 水どうしが となりあう ときは 同じ 高さ（水面が 平ら。ちがうと ふちを こえて 流れる）
            if (n !== undefined) expect(n, `${k}`).toBe(y);
          }
        }
      }
    }
  });

  it('段差の わきどころは 出口の 底が たきつぼ（つながる）。水は 量が かわらない・動く マスは 少ない', () => {
    const a = all.find((q) => q.sites.some((s) => s.type === 'kawa'))!;
    const R = 62;
    const near = featureSitesTouching(seed, a.c.px - R, a.c.pz - R, a.c.px + R, a.c.pz + R).filter((s: FeatureSite) => WATER.has(s.type));
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const s of near) { x0 = Math.min(x0, s.foot[0]); z0 = Math.min(z0, s.foot[1]); x1 = Math.max(x1, s.foot[2]); z1 = Math.max(z1, s.foot[3]); }
    const r = attach(new ArrayVoxelWorld({ x: 0, y: WORLD_HEIGHT, z: 0 }), seed, (cx, cz) => waterV2SpringsIn(seed, cx, cz));
    const cx0 = (x0 >> 4) - 1, cx1 = (x1 >> 4) + 1, cz0 = (z0 >> 4) - 1, cz1 = (z1 >> 4) + 1;
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) { r.world.loadColumn(generateChunk(seed, cx, cz)); r.sys.onColumnLoaded(cx, cz, 'generated'); }
    expect(r.sys.queue(), '読みこんだ だけでは ねむって いる').toBe(0);
    const box: [number, number, number, number, number, number] = [cx0 * 16, 0, cz0 * 16, cx1 * 16 + 15, WORLD_HEIGHT - 1, cz1 * 16 + 15];
    const total0 = r.sys.total(...box);
    const springs = near.flatMap((s) => s.blocks.filter((b) => b.id === 'wakimizu'));
    expect(springs.length).toBeGreaterThan(0);
    for (const b of springs) expect(r.sys.springLink(b.x, b.y, b.z), `つながる ${b.x},${b.y},${b.z}`).not.toBeNull();
    const mid = { x: (x0 + x1) >> 1, z: (z0 + z1) >> 1 };
    r.sys.setFocus(() => mid);
    r.step(60 * 20);
    expect(r.sys.total(...box), '量が かわらない').toBe(total0);
    expect(r.sys.queue(), '動いて いる マスの 数（まわりの 滝だけ）').toBeLessThan(400);
  }, 120_000);
});
