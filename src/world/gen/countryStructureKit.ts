import { groundAt, MOUNTAIN_TUNE, site, type Ctx, type FeatureSite, type FeatureType } from './countryKit';
import type { Dir4 } from './structures/ishidan';
import { placeStructure } from './structures/place';
import type { Placed, Rot, StructureShape } from './structures/types';

/** 山の 上の 目じるしを 置く 道具（countryStructures.ts と countryStructuresExtra.ts が 使う。ほかを import しない = 輪に ならない） */

/** 向き（歩く 方向）→ 正面が その 向きに なる 図の 向き。図の 正面は 向き 0 で 南（+z）、1 = 西、2 = 北、3 = 東 */
const ROT_OF_DIR: ReadonlyMap<string, Rot> = new Map<string, Rot>([['0,1', 0], ['-1,0', 1], ['0,-1', 2], ['1,0', 3]]);
export const rotOf = (d: Dir4): Rot => ROT_OF_DIR.get(`${d[0]},${d[1]}`)!;
export const DIRS: readonly Dir4[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/** (x, z) から (tx, tz) を 向く 4 方位（大きい 差の 軸） */
export function facing(x: number, z: number, tx: number, tz: number): Dir4 {
  const dx = tx - x;
  const dz = tz - z;
  return Math.abs(dx) >= Math.abs(dz) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dz) || 1];
}

/** 列の 地面の 高さ（置けない 列は -1）。1 回の さがしの 間だけ 覚える */
export const groundFn = (c: Ctx): ((x: number, z: number) => number) => {
  const memo = new Map<number, number>();
  return (x, z) => {
    const k = (x + 100000) * 200003 + (z + 100000);
    let h = memo.get(k);
    if (h === undefined) memo.set(k, (h = groundAt(c, x, z, null)));
    return h;
  };
};

const tooHigh = (p: Placed, shape: StructureShape): boolean => p.baseY + shape.layers.length > MOUNTAIN_TUNE.maxY;

/** 足もとの 四角どうしが かさなるか（ほかの 目じるしと ぶつからない ため。まわり margin だけ ひろげて 見る） */
export function overlaps(a: readonly [number, number, number, number], b: readonly [number, number, number, number], margin = 1): boolean {
  return a[2] + margin >= b[0] && a[0] - margin <= b[2] && a[3] + margin >= b[1] && a[1] - margin <= b[3];
}

/** 頂上の まわりで、近い 順に 建物を 置ける 所を さがす（同じ 距離なら 土台が 少ない 方）。from 以上・to 以下（チェビシェフ） */
export function findNear(shape: StructureShape, cx: number, cz: number, rot: Rot, seed: number, ground: (x: number, z: number) => number, from: number, to: number): { x: number; z: number; placed: Placed } | null {
  for (let d = from; d <= to; d++) {
    let best: { x: number; z: number; placed: Placed; score: number } | null = null;
    for (let dz = -d; dz <= d; dz++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
        const p = placeStructure(shape, cx + dx, cz + dz, rot, seed, ground);
        if (p === null || tooHigh(p, shape)) continue;
        const base = p.blocks.filter((b) => b.y < p.baseY).length; // 土台の 数（地面が たいらな 所ほど 少ない）
        if (best === null || base < best.score) best = { x: cx + dx, z: cz + dz, placed: p, score: base };
      }
    }
    if (best !== null) return best;
  }
  return null;
}

/**
 * 輪の 上を ためして さがす: 中心から 距離 from〜to（step ごと）の 4 方位 × 5 点 に 置いてみる。向きは face(x, z)（その 場所で 向く 方向）。
 * ok(x, z, placed) が true の 最初の 所を 返す。順番は 距離の 近い 方から（決まった 順）
 */
export function ringSearch(
  shape: StructureShape, cx: number, cz: number, from: number, to: number, step: number, seed: number,
  ground: (x: number, z: number) => number, face: (x: number, z: number) => Dir4, ok: (x: number, z: number, p: Placed) => boolean, order: readonly Dir4[] = DIRS,
): { x: number; z: number; placed: Placed } | null {
  for (let r = from; r <= to; r += step) {
    for (const d of order) {
      for (let k = -2; k <= 2; k++) {
        const x = cx + d[0] * r + (d[0] === 0 ? k * step : 0);
        const z = cz + d[1] * r + (d[1] === 0 ? k * step : 0);
        const p = placeStructure(shape, x, z, rotOf(face(x, z)), seed, ground);
        if (p !== null && !tooHigh(p, shape) && ok(x, z, p)) return { x, z, placed: p };
      }
    }
  }
  return null;
}

/**
 * 中心の まわりを 近い 順に（チェビシェフ きょり from〜to）、step ごとの 格子で くまなく ためす。ok が true の 最初の 所を 返す。
 * ringSearch より 点が 多い ので、平らな 所が すくない 地形で 大きな 物を 置く ときに 使う
 */
export function gridSearch(
  shape: StructureShape, cx: number, cz: number, from: number, to: number, step: number, seed: number,
  ground: (x: number, z: number) => number, face: (x: number, z: number) => Dir4, ok: (x: number, z: number, p: Placed) => boolean,
): { x: number; z: number; placed: Placed } | null {
  for (let d = from; d <= to; d += step) {
    for (let dz = -d; dz <= d; dz += step) {
      for (let dx = -d; dx <= d; dx += step) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
        const x = cx + dx;
        const z = cz + dz;
        const p = placeStructure(shape, x, z, rotOf(face(x, z)), seed, ground);
        if (p !== null && !tooHigh(p, shape) && ok(x, z, p)) return { x, z, placed: p };
      }
    }
  }
  return null;
}

/** 置いた 結果を 国だけの 物 1 こに する */
export const siteOf = (c: Ctx, type: FeatureType, x: number, z: number, p: Placed): FeatureSite => site(c, type, x, p.baseY, z, p.blocks, p.foot);
