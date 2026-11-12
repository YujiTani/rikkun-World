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

  /** from の ブロックを ぜんぶ to(x, y, z) の ブロックに 置きかえる（ささえ岩を 山の 岩に する） */
  recolor(from: BlockId, to: (x: number, y: number, z: number) => BlockId): void {
    for (const [k, m] of this.cols) {
      const x = Math.floor(k / 2000003) - 1000000;
      const z = (k % 2000003) - 1000000;
      for (const [y, id] of m) if (id === from) m.set(y, to(x, y, z));
    }
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

/** 水面の 池・たまり（いびつな 形）。level = 水の いちばん 上の マスの y。r = 平均の 半径、p1・p2 = ゆがみの 位相（角度ごとに 半径が 1 ± amp で ゆれる） */
export interface Basin {
  cx: number;
  cz: number;
  r: number;
  level: number;
  /** まん中の ふかさ（ふちほど あさい） */
  depth: number;
  amp: number;
  p1: number;
  p2: number;
  /** 受け皿の 形（なければ 丸）: 向き (ux, uz) = かべから 外へ。ax = かべに そって のばす 比（だ円）・flat = かべがわの 半径の 比（半月。1 = 丸） */
  shape?: { ux: number; uz: number; ax: number; flat: number };
}

/** 池を 作る（形の ゆがみは 場所の 乱数から） */
export function makeBasin(seed: number, cx: number, cz: number, r: number, level: number, depth: number): Basin {
  const k = Math.floor(cx) * 31 + Math.floor(cz);
  return { cx, cz, r, level, depth, amp: T.blob, p1: hash01(seed, k, 1, 91) * 6.283, p2: hash01(seed, k, 2, 92) * 6.283 };
}

/** (x, z) の マスの まん中 → 池の ふちまでの 距離を 1 と した 値（1 以下 = 水、1〜1 + 1.3 / r = ふち）。ふちは 角度で ゆれる */
export function basinNorm(b: Basin, x: number, z: number): number {
  const dx = x + 0.5 - b.cx;
  const dz = z + 0.5 - b.cz;
  const th = Math.atan2(dz, dx);
  const f = 1 + b.amp * (0.6 * Math.sin(2 * th + b.p1) + 0.4 * Math.sin(3 * th + b.p2));
  const sh = b.shape;
  if (sh === undefined) return Math.hypot(dx, dz) / (b.r * f);
  const p = dx * sh.ux + dz * sh.uz;
  const q = -dx * sh.uz + dz * sh.ux;
  const sa = Math.sqrt(sh.ax);
  return Math.hypot((p < 0 ? p / sh.flat : p) * sa, q / sa) / (b.r * f);
}

/** 池の ふちの はば（水の へりから この だけ） */
export const RING = 1.9;
/** 池の まわりを しらべる 四角（ゆがみの ぶん ひろげる） */
const reachOf = (b: Basin): number => b.r * (1 + b.amp) * Math.sqrt(b.shape?.ax ?? 1) + RING + 1;
/** 池の まわりの 列（水・ふち。左上から 右下へ） */
export function basinCells(b: Basin): { x: number; z: number; n: number }[] {
  const out: { x: number; z: number; n: number }[] = [];
  const R = reachOf(b);
  for (let z = Math.floor(b.cz - R); z <= Math.ceil(b.cz + R); z++) {
    for (let x = Math.floor(b.cx - R); x <= Math.ceil(b.cx + R); x++) {
      const n = basinNorm(b, x, z);
      if (n <= 1 + RING / b.r) out.push({ x, z, n });
    }
  }
  return out;
}

/** その 列の 水の ふかさ（まん中 = depth、ふち = 1） */
export const depthAt = (b: Basin, n: number): number => Math.max(1, Math.round(b.depth * (1 - 0.6 * Math.min(1, n))));

/** 池が 作れるか: 中は まわりの 地面を けずる 量・うめる 量が 上限 以内、ふちは うめる 量が 上限 以内。置けない 列（-1）が あれば だめ */
export function basinFits(g: Ground, b: Basin, cut: number, fill: number, free: (x: number, z: number) => boolean = () => true): boolean {
  for (const { x, z, n } of basinCells(b)) {
    const h = g(x, z);
    if (h < 0 || !free(x, z)) return false;
    if (n <= 1) {
      if (h > b.level + cut || h < b.level - depthAt(b, n) - fill) return false;
    } else if (h < b.level - fill) return false;
  }
  return true;
}

/** 池を 作る: 中は 水（まん中が ふかい。底は すな・あらいし）、ふちは 大きさの ちがう 岩・すなの あさせ・草（まわりより 低ければ うめる）。壁の 高い 所は そのまま */
export function buildBasin(ed: Edit, g: Ground, seed: number, b: Basin, rim: readonly BlockId[], ochiba: boolean): void {
  for (const { x, z, n } of basinCells(b)) {
    const h = g(x, z);
    if (n <= 1) waterColumn(ed, seed, x, z, h, b.level, depthAt(b, n));
    else rimColumn(ed, seed, x, z, h, b.level, rim, ochiba);
  }
}

const FLOOR_LAYERS = 2;

/** 水の 列: 底の 上から level まで 水。level の 上は 地面まで 空気（けずる）。底の 下が あいて いたら うめる */
export function waterColumn(ed: Edit, seed: number, x: number, z: number, ground: number, level: number, depth: number): void {
  const bed = level - depth;
  for (let y = ground + 1; y < bed; y++) ed.set(x, y, z, B.fill);
  ed.set(x, bed, z, pick(seed, B.bed, x, z, 1));
  // 底の 下 2 だんは 岩（山の 中が ほら穴で あいていても 水が ぬけない ように）
  for (let y = bed - 1; y >= bed - FLOOR_LAYERS; y--) ed.set(x, y, z, B.fill);
  for (let y = bed + 1; y <= level; y++) ed.set(x, y, z, B.water);
  const top = Math.max(ground, ed.topOf(x, z));
  for (let y = level + 1; y <= top; y++) ed.set(x, y, z, B.air);
}

/**
 * ふちの 列（わくに しない）: 水面と 同じ 高さまで うめて、くじで 変える。
 * 岩（あらいし・こけの あらいし・いし の 1〜2 だん）・すなの あさせ・そのままの 地面（草）。高い 壁（水面 +1 より 上）は そのまま。
 */
export function rimColumn(ed: Edit, seed: number, x: number, z: number, ground: number, level: number, rim: readonly BlockId[], ochiba: boolean): void {
  if (ground > level + 1) return;
  const top = Math.max(ground, level);
  for (let y = ground + 1; y < top; y++) ed.set(x, y, z, B.fill);
  const roll = hash01(seed, x, z, 2);
  if (roll < T.rimRock) {
    const h = hash01(seed, x, z, 3) < T.rockTall ? 2 : 1; // ふつうは 1 だん、たまに 2 だん
    for (let k = 0; k < h; k++) ed.set(x, top + k, z, pick(seed, rim, x, z, 5 + k));
  } else if (roll < T.rimRock + T.rimSand) ed.set(x, top, z, B.shore);
  else if (ground < level) ed.set(x, top, z, B.shore); // うめた 所は すなに（岩に しない 所）
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
