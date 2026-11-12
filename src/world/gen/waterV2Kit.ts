import type { BlockId } from '../../contracts';
import type { PlacedBlock } from './countryKit';
import { hash01 } from './random';
import { WATER_BLOCKS as B, WATER_TUNE as T } from './waterV2Table';

/** 水の 景色 v2 の 道具箱（滝・川・池が 同じ 道具を 使う。ほかの 水 v2 ファイルを import しない = 輪に ならない） */

/** (x, z) の 地面の 高さ（置けない 列は -1） */
export type Ground = (x: number, z: number) => number;
/** 四角（x0, z0, x1, z1。両はし ふくむ） */
export type Rect = readonly [number, number, number, number];

/** 向き（歩く 方向 dx, dz） */
export type Dir = readonly [number, number];
export const DIR4: readonly Dir[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/** 書きたい ブロックを ためる（あとから 書いた 方が かつ。列ごとに 持つ） */
export class Edit {
  private readonly cols = new Map<number, Map<number, BlockId>>();
  private x0 = Infinity;
  private z0 = Infinity;
  private x1 = -Infinity;
  private z1 = -Infinity;

  private static key(x: number, z: number): number {
    return (x + 1000000) * 2000003 + (z + 1000000);
  }

  set(x: number, y: number, z: number, id: BlockId): void {
    const k = Edit.key(x, z);
    let m = this.cols.get(k);
    if (m === undefined) this.cols.set(k, (m = new Map()));
    m.set(y, id);
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (z < this.z0) this.z0 = z;
    if (z > this.z1) this.z1 = z;
  }

  get(x: number, y: number, z: number): BlockId | undefined {
    return this.cols.get(Edit.key(x, z))?.get(y);
  }

  /** その 列で 書いた いちばん 上の y（なければ -1） */
  topOf(x: number, z: number): number {
    const m = this.cols.get(Edit.key(x, z));
    if (m === undefined) return -1;
    let t = -1;
    for (const y of m.keys()) if (y > t) t = y;
    return t;
  }

  /** この 列を 書いたか（水・空気・いし どれでも） */
  has(x: number, z: number): boolean {
    return this.cols.has(Edit.key(x, z));
  }

  /** 書いた 列の 数 */
  columns(): number {
    return this.cols.size;
  }

  blocks(): PlacedBlock[] {
    const out: PlacedBlock[] = [];
    for (const [k, m] of this.cols) {
      const x = Math.floor(k / 2000003) - 1000000;
      const z = (k % 2000003) - 1000000;
      for (const [y, id] of m) out.push({ x, y, z, id });
    }
    return out.sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y); // 決まった 順（テストで くらべやすい）
  }

  /** 書いた 列の 四角（なければ null） */
  bounds(): Rect | null {
    return this.x0 > this.x1 ? null : [this.x0, this.z0, this.x1, this.z1];
  }
}

/** 乱数で 選ぶ（場所 ＋ 目的の 番号だけで 決まる） */
export function pick<T>(seed: number, list: readonly T[], x: number, z: number, n: number): T {
  return list[Math.floor(hash01(seed, x, z, n) * list.length)]!;
}

/** 円の 中（まん中 cx, cz は 実数。マスの まん中 = x + 0.5）か */
export const inCircle = (x: number, z: number, cx: number, cz: number, r: number): boolean => (x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= r * r;

/** 円の 中の マス（左上から 右下へ） */
export function circleCells(cx: number, cz: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (inCircle(x, z, cx, cz, r)) out.push([x, z]);
  return out;
}

/** 水面の 池・たまり（まるい）。level = 水の いちばん 上の マスの y */
export interface Basin {
  cx: number;
  cz: number;
  r: number;
  level: number;
  depth: number;
}

/** 池の ふちの はば（円の 外へ この だけ） */
const RING = 1.3;

/** 池が 作れるか: 中は まわりの 地面を けずる 量・うめる 量が 上限 以内、ふちは うめる 量が 上限 以内。置けない 列（-1）が あれば だめ */
export function basinFits(g: Ground, b: Basin, cut: number, fill: number, free: (x: number, z: number) => boolean = () => true): boolean {
  for (let z = Math.floor(b.cz - b.r - RING); z <= Math.ceil(b.cz + b.r + RING); z++) {
    for (let x = Math.floor(b.cx - b.r - RING); x <= Math.ceil(b.cx + b.r + RING); x++) {
      const inner = inCircle(x, z, b.cx, b.cz, b.r);
      if (!inner && !inCircle(x, z, b.cx, b.cz, b.r + RING)) continue;
      const h = g(x, z);
      if (h < 0 || !free(x, z)) return false;
      if (inner) {
        if (h > b.level + cut || h < b.level - b.depth - fill) return false;
      } else if (h < b.level - fill) return false;
    }
  }
  return true;
}

/** 池を 作る: 中は 水（底は すな・あらいし）、ふちは あらいし・こけの あらいし 系（まわりより 低ければ うめる）。壁の 高い 所は そのまま */
export function buildBasin(ed: Edit, g: Ground, seed: number, b: Basin, rim: readonly BlockId[], ochiba: boolean): void {
  for (let z = Math.floor(b.cz - b.r - RING); z <= Math.ceil(b.cz + b.r + RING); z++) {
    for (let x = Math.floor(b.cx - b.r - RING); x <= Math.ceil(b.cx + b.r + RING); x++) {
      const inner = inCircle(x, z, b.cx, b.cz, b.r);
      if (!inner && !inCircle(x, z, b.cx, b.cz, b.r + RING)) continue;
      const h = g(x, z);
      if (inner) waterColumn(ed, seed, x, z, h, b.level, b.depth);
      else rimColumn(ed, seed, x, z, h, b.level, rim, ochiba);
    }
  }
}

/** 水の 列: 底の 上から level まで 水。level の 上は 地面まで 空気（けずる）。底の 下が あいて いたら うめる */
export function waterColumn(ed: Edit, seed: number, x: number, z: number, ground: number, level: number, depth: number): void {
  const bed = level - depth;
  for (let y = ground + 1; y < bed; y++) ed.set(x, y, z, B.fill);
  ed.set(x, bed, z, pick(seed, B.bed, x, z, 1));
  for (let y = bed + 1; y <= level; y++) ed.set(x, y, z, B.water);
  const top = Math.max(ground, ed.topOf(x, z));
  for (let y = level + 1; y <= top; y++) ed.set(x, y, z, B.air);
}

/** ふちの 列: 水面と 同じ 高さ（以上）まで うめて、いちばん 上を ふちの いしに。高い 壁（水面 +1 より 上）は そのまま。ときどき 1 つ 積む */
export function rimColumn(ed: Edit, seed: number, x: number, z: number, ground: number, level: number, rim: readonly BlockId[], ochiba: boolean): void {
  if (ground > level + 1) return;
  const top = Math.max(ground, level);
  for (let y = ground + 1; y < top; y++) ed.set(x, y, z, B.fill);
  ed.set(x, top, z, pick(seed, rim, x, z, 2));
  if (hash01(seed, x, z, 3) < T.boulder) ed.set(x, top + 1, z, pick(seed, rim, x, z, 4));
  else if (ochiba && hash01(seed, x, z, 5) < T.ochiba) ed.set(x, top, z, B.ochiba);
}

/** 書いた 列を、木・草花を どける 四角の 一覧に する（同じ z の となりあう x を 1 つに まとめる。まわり 1 マス） */
export function clearRects(blocks: readonly PlacedBlock[]): Rect[] {
  const byZ = new Map<number, Set<number>>();
  for (const b of blocks) {
    let s = byZ.get(b.z);
    if (s === undefined) byZ.set(b.z, (s = new Set()));
    s.add(b.x);
  }
  const out: Rect[] = [];
  for (const [z, xs] of byZ) {
    const sorted = [...xs].sort((a, b) => a - b);
    let from = sorted[0]!;
    let prev = from;
    for (let i = 1; i <= sorted.length; i++) {
      const x = sorted[i];
      if (x !== undefined && x === prev + 1) {
        prev = x;
        continue;
      }
      out.push([from - 1, z - 1, prev + 1, z + 1]);
      if (x !== undefined) from = prev = x;
    }
  }
  return out;
}

/**
 * 水が もれる 所の 一覧（検査用）: 水の マスの よこの となりが 空気（または 置けない 列）なら 1。
 * となりは 書いた ブロックが あれば それ、なければ 自然の 地面（高さ g 以下は 固い）。わきどころ・いし・水は 固い あつかい。
 */
export function waterLeaks(blocks: readonly PlacedBlock[], g: Ground): { x: number; y: number; z: number; dx: number; dz: number }[] {
  const at = new Map<string, BlockId>();
  for (const b of blocks) at.set(`${b.x},${b.y},${b.z}`, b.id);
  const leaks: { x: number; y: number; z: number; dx: number; dz: number }[] = [];
  for (const b of blocks) {
    if (b.id !== B.water) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = at.get(`${b.x + dx},${b.y},${b.z + dz}`);
      if (n !== undefined) {
        if (n === B.air) leaks.push({ x: b.x, y: b.y, z: b.z, dx, dz });
        continue;
      }
      if (g(b.x + dx, b.z + dz) < b.y) leaks.push({ x: b.x, y: b.y, z: b.z, dx, dz }); // 自然の 地面が 水面より 低い（または 置けない 列）
    }
  }
  return leaks;
}
