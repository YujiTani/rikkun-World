import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SEA_Y } from '../../contracts';
import { colKey } from '../stream/ring';
import {
  GenCols,
  SEEDS_20,
  genColumn,
  hook1c,
  ptKey,
  sampleShafts,
  shaftCoveredCols,
  standable,
  touchedColKeys,
  walkDist,
  type Box3,
  type OldCols,
  type PathCell,
  type Pt,
  type Shaft,
} from './mineShaftKit';
import { SHAFT_CONFIG } from './mineShaftConfig';
import { heightAt, spawnOf } from './terrain';

/**
 * MINE-1C コードレビュー A〔重大 1・2・4、軽微 4・9〕で 見つかった 穴の テスト〔直す 前に 赤〕。仕様 docs/design/MINE-1.md §4.5.2・§4.5.3・§4.8・§5。
 *
 *   ・R1（重大 1）: 入口の 外の 立てる マス〔入口の 前 4〜8 マス〕と 入口が 歩いて 行き来 できる〔両方 向き〕
 *   ・R2（重大 2）: スタートの まわりが 古い 列ばかりでも 列の 生成が 投げない・はじまりの 坑道は 古い 列に かからない
 *   ・R4（重大 4）: 天井の 上の 石〔地面まで cover.ground 以上・海の 下は 海の 底まで cover.sea 以上。入口から roofedWithin までは のぞく〕
 *   ・R5（軽微 4）: 横穴の 出口の たいまつは 道の 両がわ
 *   ・R6（軽微 9）: キットの「実際に 坑道が かえる 列」⊆ 実装の touchesShaft。広く 答えすぎ〔くらべる 列が へる〕も 見張る
 *   数〔cover・roofedWithin〕は 実装の 設定〔mineShaftConfig.ts〕から 読む。件数・並びは 決め打ちしない〔#311〕。時間では 合否を きめない。
 */

vi.setConfig({ testTimeout: 120_000 });

interface Sample {
  seed: number;
  shaft: Shaft;
  path: PathCell[];
  g: GenCols;
}
const samples: Sample[] = [];

beforeAll(() => {
  SEEDS_20.forEach((seed) => {
    const s = sampleShafts(seed, 4);
    for (const shaft of s.shafts) samples.push({ seed, shaft, path: s.hook.shaftPath(shaft.id), g: s.g });
  });
}, 240_000);

// ------------------------------------------------------------------ R1 入口の 前

const DIR_VEC = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
] as const;

describe('R1〔重大 1〕: 入口の 前に かべが ない', () => {
  it('入口の 外の 立てる マス〔入口の 前 4〜8 マス〕が あり、入口と 歩いて 行き来 できる〔両方 向き〕。20 シードの 坑道ぜんぶ', () => {
    expect(samples.length).toBeGreaterThanOrEqual(SEEDS_20.length);
    const bad: string[] = [];
    for (const s of samples) {
      const e = s.shaft.entrance;
      const v = DIR_VEC[e.dir];
      const box: Box3 = { x0: s.shaft.box.x0 - 12, x1: s.shaft.box.x1 + 12, z0: s.shaft.box.z0 - 12, z1: s.shaft.box.z1 + 12 };
      const outside: Pt[] = [];
      for (let d = 4; d <= 8; d++) {
        const x = e.x + v.x * d;
        const z = e.z + v.z * d;
        for (let y = e.y - 3; y <= e.y + 3; y++) if (standable(s.g, x, y, z)) outside.push({ x, y, z });
      }
      const from = { x: e.x, y: e.y, z: e.z };
      if (outside.length === 0) {
        bad.push(`seed ${s.seed} ${s.shaft.id}: 入口の 前 4〜8 マスに 立てる マスが ない`);
        continue;
      }
      const out = walkDist(s.g, from, box);
      const goIn = outside.filter((p) => out.has(ptKey(p)));
      const comeBack = goIn.filter((p) => walkDist(s.g, p, box, from).has(ptKey(from)));
      if (comeBack.length === 0) bad.push(`seed ${s.seed} ${s.shaft.id}: 入口 (${e.x}, ${e.y}, ${e.z}) と 入口の 前の 立てる マス ${outside.length} こが 行き来 できない`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 240_000);
});

// ------------------------------------------------------------------ R2 古い 列ばかり

/** スタートの 列の まわり 半径 r 列〔(2r+1)²〕を ぜんぶ 古い 列に する */
const oldAround = (seed: number, r: number): OldCols => {
  const sp = spawnOf(seed);
  const kodo = new Set<number>();
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) kodo.add(colKey((sp.x >> 4) + dx, (sp.z >> 4) + dz));
  return { kodo, heya: new Set<number>() };
};

const R2_SEEDS = [20261012, ...SEEDS_20.slice(1, 8)];

describe('R2〔重大 2〕: スタートの まわりが 古い 列ばかり〔9×9 列〕', () => {
  it.each(R2_SEEDS)('seed %i: 列の 生成が 投げない・世界の 窓口が 投げない', (seed) => {
    const old = oldAround(seed, 4);
    const sp = spawnOf(seed);
    const cx = sp.x >> 4;
    const cz = sp.z >> 4;
    expect(() => {
      // 起動で いちばん はじめに 作る 列〔スタートの 列〕と そのまわり
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-5, 0], [5, 5]] as const) genColumn(seed, cx + dx, cz + dz, old);
      hook1c(seed, { oldCols: old }).shafts(sp.x - 400, sp.z - 400, sp.x + 400, sp.z + 400);
    }).not.toThrow();
  });

  it.each(R2_SEEDS)('seed %i: はじまりの 坑道が あるなら 古い 列に かからない〔なければ 坑道 なしで よい。§5〕', (seed) => {
    const old = oldAround(seed, 4);
    const h = hook1c(seed, { oldCols: old });
    const sp = spawnOf(seed);
    // 160 マスより 遠くても 「いちばん 近い 置ける 所」なので 広く さがす
    const start = h.shafts(sp.x - 1200, sp.z - 1200, sp.x + 1200, sp.z + 1200).find((s) => s.start);
    if (start === undefined) return;
    const hit = [...touchedColKeys(start, h.shaftPath(start.id))].filter((k) => old.kodo.has(k));
    expect(hit.length, `seed ${seed}: 古い 列に かかる 列`).toBe(0);
  });

  it('古い 列が ばらばらに ある〔半径 8 列に 3 割〕世界でも 投げない', () => {
    for (const seed of R2_SEEDS.slice(0, 4)) {
      const sp = spawnOf(seed);
      const kodo = new Set<number>();
      for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) if ((dx * 7 + dz * 13 + ((dx * dz) & 3)) % 10 < 3) kodo.add(colKey((sp.x >> 4) + dx, (sp.z >> 4) + dz));
      const old: OldCols = { kodo, heya: new Set<number>() };
      expect(() => genColumn(seed, sp.x >> 4, sp.z >> 4, old), `seed ${seed}`).not.toThrow();
    }
  });
});

// ------------------------------------------------------------------ R4 天井の 上

const airHeight = (c: PathCell): number => (c.part === 'room' ? 5 : 4);

describe('R4〔重大 4〕: 天井の 上の 石', () => {
  it('道の 足の マスぜんぶで、天井の 上が 地面まで cover.ground 以上・海の 下は 海の 底まで cover.sea 以上〔入口から roofedWithin は のぞく〕', () => {
    const C = SHAFT_CONFIG.cover;
    const bad: string[] = [];
    let checked = 0;
    for (const s of samples) {
      const e = s.shaft.entrance;
      for (const c of s.path) {
        if (Math.hypot(c.x - e.x, c.z - e.z) <= C.roofedWithin) continue;
        checked++;
        const roof = c.y + airHeight(c); // 天井の ブロックの y
        const ground = heightAt(s.seed, c.x, c.z); // 地面〔海の 下では 海の 底〕の y
        const sea = ground <= SEA_Y - 1;
        const need = sea ? C.sea : C.ground;
        if (ground - roof < need) bad.push(`seed ${s.seed} ${s.shaft.id} ${c.part} (${c.x}, ${c.y}, ${c.z}): 天井 y ${roof} の 上 ${ground - roof} マス〔${sea ? '海の 底まで' : '地面まで'} ${need} 以上〕`);
      }
    }
    expect(checked, 'しらべた マス').toBeGreaterThan(0);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });
});

// ------------------------------------------------------------------ R5 出口の たいまつ

describe('R5〔軽微 4〕: 横穴の 出口の たいまつは 道の 両がわ', () => {
  it('ほらあな／つなぎの へやへ ひらく 出口〔cave・joint〕の まわり 2 マスに、道の 左と 右の たいまつが 1 本ずつ', () => {
    const bad: string[] = [];
    let exits = 0;
    for (const s of samples) {
      const inPath = new Set(s.path.map((c) => `${c.x},${c.z}`));
      for (const d of s.shaft.sides) {
        if (d.end === 'koheya') continue;
        exits++;
        const to = d.to;
        // 道の はば の 向き〔出口の 左右の となりが どちらも 道の 軸〕
        const lateral = inPath.has(`${to.x + 1},${to.z}`) && inPath.has(`${to.x - 1},${to.z}`) ? ([1, 0] as const) : inPath.has(`${to.x},${to.z + 1}`) && inPath.has(`${to.x},${to.z - 1}`) ? ([0, 1] as const) : null;
        if (lateral === null) {
          bad.push(`seed ${s.seed} ${s.shaft.id}: 出口 (${to.x}, ${to.y}, ${to.z}) の 左右が 道でない〔向きが わからない〕`);
          continue;
        }
        const along: readonly [number, number] = [lateral[1], lateral[0]];
        let left = 0;
        let right = 0;
        for (let dx = -3; dx <= 3; dx++) {
          for (let dz = -3; dz <= 3; dz++) {
            const lat = dx * lateral[0] + dz * lateral[1];
            const alo = dx * along[0] + dz * along[1];
            if (Math.abs(alo) > 2 || lat === 0) continue;
            for (let y = to.y; y <= to.y + 3; y++) if (s.g.id(to.x + dx, y, to.z + dz) === 'torch') (lat > 0 ? right++ : left++);
          }
        }
        if (left < 1 || right < 1) bad.push(`seed ${s.seed} ${s.shaft.id} 横穴 ${d.end} 出口 (${to.x}, ${to.y}, ${to.z}): たいまつ 左 ${left}・右 ${right}`);
      }
    }
    expect(exits, 'しらべた 出口').toBeGreaterThan(0);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 120_000);
});

// ------------------------------------------------------------------ R6 touchesShaft の 見張り

/** 範囲に 入る 列の colKey の 集まり */
const colKeysIn = (b: { x0: number; z0: number; x1: number; z1: number }): Set<number> => {
  const out = new Set<number>();
  for (let cz = b.z0 >> 4; cz <= b.z1 >> 4; cz++) for (let cx = b.x0 >> 4; cx <= b.x1 >> 4; cx++) out.add(colKey(cx, cz));
  return out;
};

describe('R6〔軽微 9〕: キットの「実際に 坑道が かえる 列」⊆ touchesShaft・広く 答えすぎない', () => {
  const SEEDS = SEEDS_20.slice(0, 6);
  it.each(SEEDS)('seed %i: 道 ±2・山が かかる 列は ぜんぶ touchesShaft。touchesShaft の 列の 数は その 1.6 倍 以下〔ゆるい 上限。今は 1.2〜1.3 倍〕', (seed) => {
    const sp = spawnOf(seed);
    const box = { x0: sp.x - 1024, z0: sp.z - 1024, x1: sp.x + 1023, z1: sp.z + 1023 };
    const h = hook1c(seed);
    const boxCols = colKeysIn(box);
    const real = new Set<number>();
    // 調べる 範囲の 中の 列だけ くらべる〔範囲の ふちに かかる 坑道は 外がわの 列が 範囲の 外〕
    const inBox = (k: number): boolean => boxCols.has(k);
    for (const s of h.shafts(box.x0, box.z0, box.x1, box.z1)) for (const k of touchedColKeys(s, h.shaftPath(s.id))) if (inBox(k)) real.add(k);
    const covered = shaftCoveredCols(seed, box.x0, box.z0, box.x1, box.z1);
    expect(real.size, 'しらべる 列').toBeGreaterThan(0);
    const missing = [...real].filter((k) => !covered.has(k));
    expect(missing.length, 'touchesShaft が 答えない 列').toBe(0);
    expect(covered.size, `touchesShaft ${covered.size} 列 / 実際 ${real.size} 列`).toBeLessThanOrEqual(real.size * 1.6);
  });
});
