import { BLOCK_INDEX } from '../blocks/blockTypes';
import { keyOf } from './mineShaftBuild';
import { SHAPE_TABLE } from './mineBokenConfig';
import type { Piece } from './mineBokenFit';
import type { PathCell } from './mineShaftTypes';
import type { Rng } from './random';

/**
 * 階の 本道（MINE-1E §4.2）の 形。上り口の ひろばから 出て、まっすぐ か 1 回 曲がって、下り口の ひろば〔いちばん 下の 階は いちばん 下の へやの 前〕まで。
 * 床の まん中に ふるい レール。長さ〔歩数〕は ふくざつさ の 表。計算だけ〔世界には さわらない〕。
 */

const TORCH = BLOCK_INDEX.torch;
const RAIL_X = BLOCK_INDEX.furui_rail_x;
const RAIL_Z = BLOCK_INDEX.furui_rail_z;
const H = SHAPE_TABLE.floor.hiroba;
/** ひろばの 半分の おくゆき・はば（中心から はしの 床まで） */
export const HALF_D = (H.d - 1) / 2;
export const HALF_W = (H.w - 1) / 2;

export interface Pt3 {
  x: number;
  y: number;
  z: number;
}
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
/** 本道の まっすぐな 部分: 中心の 列 main[from..to]・向き */
export interface Leg {
  from: number;
  to: number;
  dx: number;
  dz: number;
  /** 口を 出して よい 中心の 番号〔前後 1 マスも 本道〕 */
  ok: number[];
}
export interface RoadPlan {
  main: Pt3[];
  legs: Leg[];
  bends: number;
  /** 向きの はじまり／おわり */
  end: { dx: number; dz: number };
  piece: Piece;
  /** 下り口の ひろばの 床〔いちばん 下の 階は null〕 */
  downRect: Rect | null;
  /** 曲がり角の 中心 */
  corner: Pt3 | null;
}

/** 向き (dx, dz) の 左がわの よこ向き */
export const lat = (dx: number, dz: number): [number, number] => [-dz, dx];

export interface HirobaIn {
  /** ひろばの 中心 */
  cx: number;
  cz: number;
  y: number;
  /** ひろばの おくゆきの 向き */
  hx: number;
  hz: number;
}

/** ひろば 1 つの 床の 列と たいまつ。center と 向きから */
export function hirobaCells(c: HirobaIn): { cells: PathCell[]; torches: Pt3[]; rect: Rect } {
  const [lx, lz] = lat(c.hx, c.hz);
  const cells: PathCell[] = [];
  for (let d = -HALF_D; d <= HALF_D; d++) for (let w = -HALF_W; w <= HALF_W; w++) cells.push({ x: c.cx + c.hx * d + lx * w, y: c.y, z: c.cz + c.hz * d + lz * w, part: 'hiroba' });
  const t = (d: number, w: number): Pt3 => ({ x: c.cx + c.hx * d + lx * w, y: c.y, z: c.cz + c.hz * d + lz * w });
  const xs = cells.map((p) => p.x);
  const zs = cells.map((p) => p.z);
  return { cells, torches: [t(1, HALF_W), t(-1, -HALF_W)], rect: { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) } };
}

const inRect = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/**
 * 上り口の ひろば `up` から 出る 本道を 作る。mainLen ＝ 歩数。bottom ＝ いちばん 下の 階〔下り口の かわりに へやの 前で おわる〕。
 * 出口は まっすぐ か よこ。形が 合わなければ null。
 */
export function planRoad(rng: Rng, up: HirobaIn, upRect: Rect, mainLen: [number, number], bottom: boolean): RoadPlan | null {
  const [mlo, mhi] = mainLen;
  const L = mlo + Math.floor(rng() * (mhi - mlo + 1));
  const [lx, lz] = lat(up.hx, up.hz);
  // 出口: まっすぐ〔おくゆき方向〕・左・右
  const pick = Math.floor(rng() * 4);
  const exit: [number, number] = pick < 2 ? [up.hx, up.hz] : pick === 2 ? [lx, lz] : [-lx, -lz];
  const straight = pick < 2;
  const off = straight ? HALF_D + 1 : HALF_W + 1;
  const bends = rng() < 0.45 ? 1 : 0;
  const minLeg = off + 3;
  const tail = bottom ? 3 : HALF_D + 3;
  let L1 = L;
  let turn = 1;
  if (bends === 1) {
    const hi = L - Math.max(4, tail);
    if (hi < minLeg) return null;
    L1 = minLeg + Math.floor(rng() * (hi - minLeg + 1));
    turn = rng() < 0.5 ? -1 : 1;
  }
  const [h1x, h1z] = exit;
  const [m1x, m1z] = lat(h1x, h1z);
  const h2: [number, number] = bends === 1 ? [m1x * turn, m1z * turn] : exit;
  const L2 = L - L1;
  const y = up.y;
  const main: Pt3[] = [];
  for (let i = 0; i <= L1; i++) main.push({ x: up.cx + h1x * i, y, z: up.cz + h1z * i });
  const K = main[L1]!;
  for (let j = 1; j <= L2; j++) main.push({ x: K.x + h2[0] * j, y, z: K.z + h2[1] * j });
  const end = main[main.length - 1]!;
  const cells = new Map<number, PathCell>();
  const putCell = (x: number, z: number, part: PathCell['part']): void => {
    const k = x * 65536 + z;
    if (part === 'hiroba' || !cells.has(k)) cells.set(k, { x, y, z, part });
  };
  /** 中心 (cx, cz) を 向き (hx, hz) に 直角な はば 3 で ならべる */
  const strip = (cx: number, cz: number, hx: number, hz: number): void => {
    const [sx, sz] = lat(hx, hz);
    for (let w = -1; w <= 1; w++) putCell(cx + sx * w, cz + sz * w, 'main');
  };
  for (let i = off; i <= L1; i++) strip(main[i]!.x, main[i]!.z, h1x, h1z);
  if (bends === 1) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) putCell(K.x + dx, K.z + dz, 'main');
    for (let i = L1 + 1; i < main.length; i++) strip(main[i]!.x, main[i]!.z, h2[0], h2[1]);
  }
  let downRect: Rect | null = null;
  let downTorches: Pt3[] = [];
  if (!bottom) {
    const hb = hirobaCells({ cx: end.x, cz: end.z, y, hx: h2[0], hz: h2[1] });
    for (const c of hb.cells) putCell(c.x, c.z, 'hiroba');
    downRect = hb.rect;
    downTorches = hb.torches;
  }
  // 上り口の ひろばの 中は 部品に 入れない
  for (const [k, c] of cells) if (inRect(upRect, c.x, c.z)) cells.delete(k);
  const out = [...cells.values()];
  // たいまつ: 6 マスごと 左右こうご〔ひろばの 中・曲がり角の まわりは のぞく〕。曲がり角に 1 本
  const torches: Pt3[] = [...downTorches];
  const free = (x: number, z: number): boolean => cells.has(x * 65536 + z) && cells.get(x * 65536 + z)!.part === 'main';
  main.forEach((c, i) => {
    if (i % 6 !== 2 || i < off + 1 || i >= main.length - 2) return;
    const leg = i <= L1 ? [h1x, h1z] : h2;
    const [sx, sz] = lat(leg[0]!, leg[1]!);
    const sg = (i / 6) % 2 < 1 ? 1 : -1;
    if (free(c.x + sx * sg, c.z + sz * sg)) torches.push({ x: c.x + sx * sg, y, z: c.z + sz * sg });
  });
  if (bends === 1) torches.push({ x: K.x + 1, y, z: K.z + 1 });
  if (bottom) torches.push({ x: end.x - h2[1], y, z: end.z + h2[0] }, { x: end.x + h2[1], y, z: end.z - h2[0] });
  const puts: [number, number][] = torches.map((t) => [keyOf(t.x, t.y, t.z), TORCH]);
  // ふるい レール: 本道の まん中〔はし 3 マスと 曲がり角の まわりを のぞく〕
  main.forEach((c, i) => {
    if (i < 3 || i >= main.length - 3) return;
    if (bends === 1 && Math.max(Math.abs(c.x - K.x), Math.abs(c.z - K.z)) <= 1) return;
    const nb = main[i + 1]!;
    puts.push([keyOf(c.x, c.y, c.z), nb.x !== c.x ? RAIL_X : RAIL_Z]);
  });
  const legs: Leg[] = [];
  const mouthOk = (i: number): boolean => {
    for (let d = -1; d <= 1; d++) {
      const c = main[i + d];
      if (!c || !free(c.x, c.z)) return false;
    }
    return true;
  };
  const sliceOk = (from: number, to: number): number[] => {
    const ok: number[] = [];
    for (let i = from + 1; i < to; i++) if (i >= off + 1 && mouthOk(i) && (bends === 0 || Math.max(Math.abs(main[i]!.x - K.x), Math.abs(main[i]!.z - K.z)) > 2)) ok.push(i);
    return ok;
  };
  legs.push({ from: 0, to: L1, dx: h1x, dz: h1z, ok: sliceOk(0, L1) });
  if (bends === 1) legs.push({ from: L1, to: main.length - 1, dx: h2[0], dz: h2[1], ok: sliceOk(L1, main.length - 1) });
  return { main, legs, bends, end: { dx: h2[0], dz: h2[1] }, piece: { cells: out, puts, attach: { x: up.cx + h1x * off, z: up.cz + h1z * off, dx: h1x, dz: h1z, y } }, downRect, corner: bends === 1 ? K : null };
}
