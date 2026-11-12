import { hash01 } from '../random';
import type { GroundFn, PlacedCell } from './types';

/**
 * 石段（いしだたみの かいだん）。図では なく 「道に そって 置く」 物: はじめの マス・向き（東西南北の 1 つ）・地面の 高さから 作る。
 * はば 3、1 歩 = 1 列（はば 3 マス）、床の 高さは 1 歩ごとに 1 以下しか かわらない（地形に そって のぼり おり する）。
 * 両わきに 4〜6 歩ごとに とうろう（touro。いしの とうろう。こわれない）を 1 つずつ 立てる。
 * 地面に めりこむ 所は 上を けずり（空気）、うく 所は 下を いしだたみで うめる（うめる／けずる 上限 CUT_FILL）。
 */

/** 数の表（単位は ブロック／歩） */
export const ISHIDAN_TUNE = {
  /** 道の はば（歩く 所）。とうろうは その さらに 外がわの 1 マス */
  width: 3,
  /** とうろうを 立てる 間かく（歩）の はんい。毎回 シードで この 中から えらぶ */
  lanternEvery: [4, 6] as const,
  /** 1 歩で 床の 高さが かわる 上限 */
  stepMax: 1,
  /** 地面から 床までを うめる／けずる 上限 */
  cutFill: 4,
  /** 歩くのに あけておく 上の 空気 */
  air: 3,
  /** 短すぎる 道は 作らない（歩） */
  minSteps: 4,
  /** 長さの 上限（歩） */
  maxSteps: 60,
} as const;

/** 1 歩ぶんの 記録（床の まん中の マスと 高さ） */
interface StairStep {
  x: number;
  y: number;
  z: number;
}

export interface Stairs {
  blocks: PlacedCell[];
  /** 足もとの 四角（x0, z0, x1, z1。両はし ふくむ。とうろうの 列まで） */
  foot: readonly [number, number, number, number];
  /** 床の まん中の 列（はじめ = 上がわ から おわり へ） */
  path: StairStep[];
  /** とうろうの 場所（どちらの わきも） */
  lanterns: { x: number; y: number; z: number }[];
}

/** 向き。東西南北の どれか（dx, dz の どちらか 一方が 0） */
export type Dir4 = readonly [number, number];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * (sx, sz) から 向き dir へ のびる 石段。`stop(x, z)` が true の 列（山の すそ など）で おわる。
 * 地面が 置けない 列（ground < 0）に ぶつかった 所でも おわる。minSteps に とどかなければ null
 */
export function placeStairs(sx: number, sz: number, dir: Dir4, seed: number, ground: GroundFn, stop: (x: number, z: number) => boolean = () => false): Stairs | null {
  const K = ISHIDAN_TUNE;
  const [dx, dz] = dir;
  const px = -dz; // 道の よこ
  const pz = dx;
  const half = (K.width - 1) / 2;
  const reach = half + 1; // とうろうの 列
  const path: StairStep[] = [];
  const blocks: PlacedCell[] = [];
  const lanterns: { x: number; y: number; z: number }[] = [];
  let y = 0;
  let nextLantern = K.lanternEvery[0] - 1;
  for (let k = 0; k < K.maxSteps; k++) {
    const cx = sx + k * dx;
    const cz = sz + k * dz;
    const gs = [-reach, 0, reach].map((o) => ground(cx + o * px, cz + o * pz));
    const gc = gs[1]!;
    if (gc < 0) break;
    const y1 = k === 0 ? gc : clamp(gc, y - K.stepMax, y + K.stepMax);
    if (Math.abs(y1 - gc) > K.cutFill) break;
    const isLantern = k === nextLantern;
    // とうろうの 列が 置けない（ground < 0）か 床が 遠すぎる なら とうろうは 立てない
    const sideOk = (g: number): boolean => g >= 0 && Math.abs(y1 - g) <= K.cutFill;
    y = y1;
    for (let o = -reach; o <= reach; o++) {
      const x = cx + o * px;
      const z = cz + o * pz;
      const g = ground(x, z);
      const side = Math.abs(o) === reach;
      if (side && !(isLantern && sideOk(g))) continue; // わきは とうろうの 歩だけ（地面は そのまま）
      if (g < 0) continue;
      blocks.push({ x, y, z, id: 'ishidatami' });
      for (let yy = g + 1; yy < y; yy++) blocks.push({ x, y: yy, z, id: 'ishidatami' });
      for (let yy = y + 1; yy <= Math.max(g, y + (side ? 1 : K.air)); yy++) blocks.push({ x, y: yy, z, id: 'air' });
      if (side) {
        blocks.push({ x, y: y + 1, z, id: 'touro' });
        lanterns.push({ x, y: y + 1, z });
      }
    }
    if (isLantern) nextLantern = k + K.lanternEvery[0] + Math.floor(hash01(seed, sx, sz, k, 31) * (K.lanternEvery[1] - K.lanternEvery[0] + 1));
    path.push({ x: cx, y, z: cz });
    if (stop(cx, cz)) break;
  }
  if (path.length < K.minSteps) return null;
  const last = path[path.length - 1]!;
  const xs = [sx - reach * Math.abs(px), sx + reach * Math.abs(px), last.x - reach * Math.abs(px), last.x + reach * Math.abs(px)];
  const zs = [sz - reach * Math.abs(pz), sz + reach * Math.abs(pz), last.z - reach * Math.abs(pz), last.z + reach * Math.abs(pz)];
  const foot: [number, number, number, number] = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  return { blocks, foot, path, lanterns };
}
