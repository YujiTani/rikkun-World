import { hash01 } from '../random';
import { ISHIDOUROU_CHU } from './ishidourouChu';
import { ISHIDOUROU_DAI } from './ishidourouDai';
import { ISHIDOUROU_SHO } from './ishidourouSho';
import { placeStructure } from './place';
import type { GroundFn, PlacedCell, StructureShape } from './types';

/**
 * 石段（いしだたみの かいだん）。図では なく 「道に そって 置く」 物: はじめの マス・向き（東西南北の 1 つ）・地面の 高さから 作る。
 * はば 3、1 歩 = 1 列（はば 3 マス）、床の 高さは 1 歩ごとに 1 以下しか かわらない（地形に そって のぼり おり する）。
 * 4〜6 歩ごとに いしどうろう（大・中・小の どれか。シードで きめる）を、左右 たがいちがいに 道の わきに 立てる。
 * 地面に めりこむ 所は 上を けずり（空気）、うく 所は 下を いしだたみで うめる（うめる／けずる 上限 CUT_FILL）。
 */

/** 数の表（単位は ブロック／歩） */
export const ISHIDAN_TUNE = {
  /** 道の はば（歩く 所）。いしどうろうは その すぐ 外がわに 立つ */
  width: 3,
  /** いしどうろうの まん中の 列が 道の まん中から はなれる きょり（大の 台 3×3 が 道に かからない） */
  lampOffset: 3,
  /** いしどうろうを 立てる 間かく（歩）の はんい。毎回 シードで この 中から えらぶ。左右 たがいちがい */
  lanternEvery: [4, 6] as const,
  /** いしどうろうの 大きさの くじ（大・中・小。合計 10）。中が 多め */
  lampWeights: { dai: 2, chu: 5, sho: 3 },
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

/** 道の まん中から 足もとの 四角の はしまでの きょり（大の 笠 5×5 まで） */
const REACH = ISHIDAN_TUNE.lampOffset + 2;

interface StairStep {
  x: number;
  y: number;
  z: number;
}

/** 立てた いしどうろう 1 つ（台の まん中の マスと 大きさ） */
export interface Lamp {
  x: number;
  y: number;
  z: number;
  size: 'dai' | 'chu' | 'sho';
}

export interface Stairs {
  blocks: PlacedCell[];
  /** 足もとの 四角（x0, z0, x1, z1。両はし ふくむ。いしどうろうの 笠まで） */
  foot: readonly [number, number, number, number];
  /** 床の まん中の 列（はじめ = 上がわ から おわり へ） */
  path: StairStep[];
  /** いしどうろう（左右 たがいちがい） */
  lanterns: Lamp[];
}

/** 向き。東西南北の どれか（dx, dz の どちらか 一方が 0） */
export type Dir4 = readonly [number, number];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const LAMP_SHAPES: Readonly<Record<Lamp['size'], StructureShape>> = { dai: ISHIDOUROU_DAI, chu: ISHIDOUROU_CHU, sho: ISHIDOUROU_SHO };

/** くじで 大きさを きめる */
function lampSize(r: number): Lamp['size'] {
  const w = ISHIDAN_TUNE.lampWeights;
  const total = w.dai + w.chu + w.sho;
  const v = r * total;
  return v < w.dai ? 'dai' : v < w.dai + w.chu ? 'chu' : 'sho';
}

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
  const path: StairStep[] = [];
  const blocks: PlacedCell[] = [];
  const lanterns: Lamp[] = [];
  let y = 0;
  let nextLamp = K.lanternEvery[0] - 1;
  for (let k = 0; k < K.maxSteps; k++) {
    const cx = sx + k * dx;
    const cz = sz + k * dz;
    const gc = ground(cx, cz);
    if (gc < 0) break;
    const y1 = k === 0 ? gc : clamp(gc, y - K.stepMax, y + K.stepMax);
    if (Math.abs(y1 - gc) > K.cutFill) break;
    y = y1;
    for (let o = -half; o <= half; o++) {
      const x = cx + o * px;
      const z = cz + o * pz;
      const g = ground(x, z);
      if (g < 0) continue;
      blocks.push({ x, y, z, id: 'ishidatami' });
      for (let yy = g + 1; yy < y; yy++) blocks.push({ x, y: yy, z, id: 'ishidatami' });
      for (let yy = y + 1; yy <= Math.max(g, y + K.air); yy++) blocks.push({ x, y: yy, z, id: 'air' });
    }
    path.push({ x: cx, y, z: cz });
    if (k === nextLamp) {
      // いしどうろう: 左右 たがいちがい。地面が ひくい 側は 台の 下を こけいしで うめる（床より 4 以上 ひくい 所は 床の 4 下を 地面と みなす）
      const side = lanterns.length % 2 === 0 ? 1 : -1;
      const size = lampSize(hash01(seed, sx, sz, k, 37));
      const lx = cx + side * K.lampOffset * px;
      const lz = cz + side * K.lampOffset * pz;
      const lamp = placeStructure(LAMP_SHAPES[size], lx, lz, 0, seed, (x, z) => {
        const g = ground(x, z);
        return g < 0 ? -1 : Math.max(g, y - 4);
      });
      if (lamp) {
        blocks.push(...lamp.blocks);
        lanterns.push({ x: lx, y: lamp.baseY, z: lz, size });
      }
      nextLamp = k + K.lanternEvery[0] + Math.floor(hash01(seed, sx, sz, k, 31) * (K.lanternEvery[1] - K.lanternEvery[0] + 1));
    }
    if (stop(cx, cz)) break;
  }
  if (path.length < K.minSteps) return null;
  const last = path[path.length - 1]!;
  const xs = [sx - REACH * Math.abs(px), sx + REACH * Math.abs(px), last.x - REACH * Math.abs(px), last.x + REACH * Math.abs(px)];
  const zs = [sz - REACH * Math.abs(pz), sz + REACH * Math.abs(pz), last.z - REACH * Math.abs(pz), last.z + REACH * Math.abs(pz)];
  const foot: [number, number, number, number] = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  return { blocks, foot, path, lanterns };
}
