import { BLOCK_INDEX } from '../blocks/blockTypes';
import { CHEST_RIGHT, chestBlockId } from '../blocks/chestBlock';
import { MINE_CONFIG } from './mineConfig';
import { BOKEN_TUNING as TUNE, SHAPE_TABLE, STYLE_TABLE } from './mineBokenConfig';
import { Fit, type Piece, type Work } from './mineBokenFit';
import { HALF_D, HALF_W, hirobaCells, lat, planRoad, type Leg, type Pt3, type Rect } from './mineBokenRoad';
import type { BokenStyle } from './mineBokenStyle';
import { chestPlaced, chestTierAt } from './mineChestTable';
import { COMPASS, DV, Frame, keyOf, type Pt3 as KPt } from './mineShaftBuild';
import type { Hub } from './mineSideBuild';
import type { Compass, PathCell, Shaft } from './mineShaftTypes';
import type { Rng } from './random';

/**
 * 階の かさなり（MINE-1E §4.2）の 骨組み: 入口 → さか道 → 1 つめの 階の 上り口 → 本道 → 下り口 → さか道 → … → いちばん 下の 階の 本道 → いちばん 下の へや。
 * 計画だけ〔世界には さわらない〕。部品は `Fit` に 足していく。
 */

const TORCH = BLOCK_INDEX.torch;
const WAKU = BLOCK_INDEX.kodo_waku;
const S1 = SHAPE_TABLE.floor;

export interface FloorGeo {
  y: number;
  up: Pt3;
  down: Pt3 | null;
  main: Pt3[];
  bends: number;
  legs: Leg[];
  corner: Pt3 | null;
  upRect: Rect;
  downRect: Rect | null;
}
/** わく 1 つ〔道の 中心 x, z・y・よこ向き〕 */
export interface FrameMark {
  x: number;
  z: number;
  y: number;
  px: number;
  pz: number;
  /** こわれた わくか */
  broken?: boolean;
}
export interface Skeleton {
  floors: FloorGeo[];
  frames: FrameMark[];
  room: Shaft['room'];
  chest: Shaft['chest'];
  chestCells: Set<number>;
  /** いちばん 下の へやから 出る 横穴の 出口 */
  roomHub: Hub;
  /** 入口の 向きの 枠 */
  F: Frame;
}

export interface FloorCtx {
  fit: Fit;
  rng: Rng;
  style: BokenStyle;
  F: Frame;
  ey: number;
  seed: number;
  shaftId: string;
  work: Work;
}

/** さか道の くみ〔段の 数の 並び〕が 入口側〔p ≥ 1〕から はみ出さず ひろばまで 入るか */
function rowFits(row: readonly number[]): boolean {
  let start = 1;
  let last = 0;
  let sgn = 1;
  for (let i = 0; i < row.length; i++) {
    sgn = i % 2 === 0 ? 1 : -1;
    if (i > 0) start = last;
    last = start + sgn * (2 * row[i]! - 1);
    if (Math.min(start, last) < 1) return false;
    if (i < row.length - 1 && Math.min(last + sgn, last + sgn * 3) < 1) return false;
  }
  const cp = last + sgn * (HALF_D + 1);
  return cp - HALF_D >= 1 && cp + HALF_D >= 1;
}

/** 階の y と 各 さか道の 段の 数。引けなければ null */
function planFloorYs(rng: Rng, style: BokenStyle, ey: number): { ys: number[]; ns: number[][] } | null {
  const [lo, hi] = S1.bottomY[style.depth];
  const yB = lo + Math.floor(rng() * (hi - lo + 1));
  const F = style.floors;
  const gap = 21; // さか道 2 本が ひろばまで 入る いちばん 小さい 落差。階の あいだの 表の 下限 16 を 満たす
  const top = ey - S1.topBelowEntrance;
  const bot = yB + gap;
  const layers = MINE_CONFIG.layers.filter((l) => l.minY <= ey && (l.maxY === null || l.maxY >= yB));
  for (let t = 0; t < TUNE.floorYTries; t++) {
    // 間を gap 以上 あけた 並びを 一様に: 間を つめた 範囲で 引いて、あとで ひらく
    const k = F - 1;
    const room = top - bot - (k - 1) * gap;
    if (room < 0) return null;
    const asc: number[] = [];
    for (let i = 0; i < k; i++) asc.push(bot + Math.floor(rng() * (room + 1)));
    asc.sort((a, b) => a - b);
    const ys = asc.map((u, i) => u + i * gap).reverse();
    ys.push(yB);
    const d0 = ey - ys[0]!;
    if (d0 < S1.topBelowEntrance || (d0 > 13 && d0 < gap)) continue;
    if (F >= layers.length && layers.some((l) => !ys.some((y) => y >= l.minY && (l.maxY === null || y <= l.maxY)))) continue;
    const ns: number[][] = [];
    let ok = true;
    for (let i = 0; i < F && ok; i++) {
      const D = i === 0 ? d0 : ys[i - 1]! - ys[i]!;
      const mLo = Math.ceil(D / 13);
      const mHi = Math.floor(D / 9);
      if (mHi < mLo) {
        ok = false;
        break;
      }
      let row: number[] | null = null;
      for (let q = 0; q < 60 && !row; q++) {
        const m = mLo + Math.floor(rng() * (mHi - mLo + 1));
        const cand = new Array<number>(m).fill(TUNE.stepsMin);
        let extra = D - 9 * m;
        while (extra > 0) {
          const j = Math.floor(rng() * m);
          if (cand[j]! < TUNE.stepsMax) {
            cand[j]!++;
            extra--;
          }
        }
        if (rowFits(cand)) row = cand;
      }
      if (!row) {
        ok = false;
        break;
      }
      ns.push(row);
    }
    if (ok) return { ys, ns };
  }
  return null;
}

interface PadIn {
  /** 最後の 平らな 床の マス〔つぎの さか道の 手前〕 */
  x: number;
  z: number;
  y: number;
  /** さか道の 向き */
  ax: number;
  az: number;
}
interface DescentOut {
  piece: Piece;
  frames: FrameMark[];
  hiroba: { cx: number; cz: number; y: number; hx: number; hz: number };
  rect: Rect;
}

/** さか道の くみ 〔ns ＝ 1 本ごとの 段の 数〕。1 本ずつ 2 つの 道〔lane〕を こうごに おりかえし、さいごに 上り口の ひろばに 出る。p ≥ 1 を まもる */
function descent(rng: Rng, pad: PadIn, ns: readonly number[], first: PadIn | null): DescentOut | null {
  const R = 2; // 2 マスで 1 段
  const ls = rng() < 0.5 ? 1 : -1;
  const laneGap = 4;
  const [lx, lz] = lat(pad.ax, pad.az);
  const at = (p: number, q: number): { x: number; z: number } => ({ x: pad.x + pad.ax * p + lx * q, z: pad.z + pad.az * p + lz * q });
  const cells: PathCell[] = [];
  const torches: KPt[] = [];
  const frames: FrameMark[] = [];
  let y0 = pad.y;
  let start = 1;
  let since = TUNE.rampTorchEvery - 3;
  let last = 0;
  let lane = 0;
  let sgn = 1;
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i]!;
    sgn = i % 2 === 0 ? 1 : -1;
    lane = i % 2 === 0 ? 0 : ls * laneGap;
    if (i > 0) start = last;
    last = start + sgn * (R * n - 1);
    if (Math.min(start, last) < 1) return null;
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < R; j++) {
        const p = start + sgn * (R * k + j);
        const y = y0 - 1 - k;
        for (let q = lane - 1; q <= lane + 1; q++) {
          const c = at(p, q);
          cells.push({ x: c.x, y, z: c.z, part: 'ramp' });
        }
        if (++since >= TUNE.rampTorchEvery) {
          since = 0;
          const t = at(p, lane + (i % 2 === 0 ? 1 : -1) * (k % 2 === 0 ? 1 : -1));
          torches.push({ x: t.x, y, z: t.z });
        }
        if (j === 0 && k % (TUNE.frameEvery / R) === 0) {
          const c = at(p, lane);
          frames.push({ x: c.x, y, z: c.z, px: lx, pz: lz });
        }
      }
    }
    const ly = y0 - n - 1;
    if (i < ns.length - 1) {
      // おどりば: 7 × 3、平ら
      const rows = [1, 2, 3].map((d) => last + sgn * d);
      if (Math.min(...rows) < 1) return null;
      const qa = Math.min(0, ls * laneGap) - 1;
      const qb = Math.max(0, ls * laneGap) + 1;
      for (const p of rows) for (let q = qa; q <= qb; q++) {
        const c = at(p, q);
        cells.push({ x: c.x, y: ly, z: c.z, part: 'landing' });
      }
      const t = at(rows[1]!, ls * 2);
      torches.push({ x: t.x, y: ly, z: t.z });
    }
    y0 = ly;
  }
  // 上り口の ひろば
  const hx = pad.ax * sgn;
  const hz = pad.az * sgn;
  const cp = last + sgn * (HALF_D + 1);
  if (Math.min(cp - HALF_D, cp + HALF_D) < 1) return null;
  const c = at(cp, lane);
  const hb = hirobaCells({ cx: c.x, cz: c.z, y: y0, hx, hz });
  cells.push(...hb.cells);
  torches.push(...hb.torches);
  const puts: [number, number][] = torches.map((t) => [keyOf(t.x, t.y, t.z), TORCH]);
  const attach = first ? undefined : { x: pad.x + pad.ax, z: pad.z + pad.az, dx: pad.ax, dz: pad.az, y: pad.y };
  return { piece: { cells, puts, attach }, frames, hiroba: { cx: c.x, cz: c.z, y: y0, hx, hz }, rect: hb.rect };
}

/** 入口の 平らな 2 マスと 山の 外へ ひらく 面 */
function entrancePiece(F: Frame, ey: number): Piece {
  const cells: PathCell[] = [];
  for (let u = 0; u < 2; u++) for (let v = -1; v <= 1; v++) cells.push({ x: F.x(u, v), y: ey, z: F.z(u, v), part: 'entrance' });
  const puts: [number, number][] = [-1, 1].map((v) => [keyOf(F.x(0, v), ey, F.z(0, v)), TORCH]);
  const exempt: number[] = [];
  for (let v = -1; v <= 1; v++) for (let k = 0; k < 4; k++) exempt.push(keyOf(F.x(-1, v), ey + k, F.z(-1, v)));
  return { cells, puts, exempt };
}

const dirIndex = (dx: number, dz: number): number => DV.findIndex((d) => d[0] === dx && d[1] === dz);

/** 骨組みを 作る。作れなければ null。1 つ 作るごとに yield */
export function* planSkeleton(c: FloorCtx): Generator<void, Skeleton | null> {
  const { fit, rng, style, F, ey } = c;
  const plan = planFloorYs(rng, style, ey);
  if (!plan) return null;
  const level = STYLE_TABLE.level.find((l) => l.id === style.level)!;
  const floors: FloorGeo[] = [];
  const frames: FrameMark[] = [];
  /** 部品を 作って 足す〔ためす ごとに yield。先読みが 時間で 止まれる ように〕 */
  const tryAdd = function* <T extends { piece: Piece }>(make: () => T | null): Generator<void, T | null> {
    for (let t = 0; t < TUNE.roadTries; t++) {
      if (c.work.floors++ >= SHAPE_TABLE.limit.tries.floors) return null;
      yield;
      const m = make();
      if (!m) continue;
      yield;
      if (fit.add(m.piece)) return m;
    }
    return null;
  };
  // 入口 ＋ 1 つめの さか道
  const pad0: PadIn = { x: F.x(1, 0), z: F.z(1, 0), y: ey, ax: F.ux, az: F.uz };
  const ent = entrancePiece(F, ey);
  const first: DescentOut | null = yield* tryAdd(() => {
    const d = descent(rng, pad0, plan.ns[0]!, pad0);
    return d ? { ...d, piece: { cells: [...ent.cells, ...d.piece.cells], puts: [...ent.puts!, ...d.piece.puts!], exempt: ent.exempt } } : null;
  });
  if (!first) return null;
  let cur: DescentOut = first;
  frames.push(...cur.frames);
  yield;
  for (let f = 0; f < style.floors; f++) {
    const bottom = f === style.floors - 1;
    const up = cur.hiroba;
    const upRect = cur.rect;
    const made = yield* tryAdd(() => {
      const road = planRoad(rng, up, upRect, level.mainLength as [number, number], bottom);
      if (!road) return null;
      if (!bottom) return { piece: road.piece, road, room: null };
      const room = bottomRoom(c, road);
      return { piece: { ...road.piece, cells: [...road.piece.cells, ...room.roomCells], puts: [...road.piece.puts!, ...room.puts] }, road, room };
    });
    if (!made) return null;
    const rd = made.road;
    yield;
    floors.push({
      y: up.y,
      up: { x: up.cx, y: up.y, z: up.cz },
      down: rd.downRect ? { x: rd.main[rd.main.length - 1]!.x, y: up.y, z: rd.main[rd.main.length - 1]!.z } : null,
      main: rd.main,
      bends: rd.bends,
      legs: rd.legs,
      corner: rd.corner,
      upRect,
      downRect: rd.downRect,
    });
    for (let i = 6; i < rd.main.length - 3; i += TUNE.frameEvery) {
      const m = rd.main[i]!;
      const leg = rd.legs.find((l) => i >= l.from && i <= l.to)!;
      const [px, pz] = lat(leg.dx, leg.dz);
      if (rd.corner && Math.max(Math.abs(m.x - rd.corner.x), Math.abs(m.z - rd.corner.z)) <= 2) continue;
      frames.push({ x: m.x, y: up.y, z: m.z, px, pz });
    }
    if (made.room) {
      const r = made.room;
      return { floors, frames, room: r.room, chest: r.chest, chestCells: r.cells, roomHub: r.hub, F };
    }
    // つぎの さか道
    const end = rd.main[rd.main.length - 1]!;
    const hx = rd.end.dx;
    const hz = rd.end.dz;
    const [lx, lz] = lat(hx, hz);
    const next = yield* tryAdd(() => {
      const pick = Math.floor(rng() * 4);
      const a: [number, number] = pick < 2 ? [hx, hz] : pick === 2 ? [lx, lz] : [-lx, -lz];
      const reach = pick < 2 ? HALF_D : HALF_W;
      const pad: PadIn = { x: end.x + a[0] * reach, z: end.z + a[1] * reach, y: up.y, ax: a[0], az: a[1] };
      return descent(rng, pad, plan.ns[f + 1]!, null);
    });
    if (!next) return null;
    cur = next;
    frames.push(...cur.frames);
    yield;
  }
  return null;
}

/** いちばん 下の へや〔9 × 9 × 高さ 5〕と 宝箱。道の おわりの 向きに のびる */
interface RoomOut {
  roomCells: PathCell[];
  puts: [number, number][];
  room: NonNullable<Shaft['room']>;
  chest: Shaft['chest'];
  hub: Hub;
  cells: Set<number>;
}

function bottomRoom(c: FloorCtx, road: NonNullable<ReturnType<typeof planRoad>>): RoomOut {
  const end = road.main[road.main.length - 1]!;
  const { dx, dz } = road.end;
  const [lx, lz] = lat(dx, dz);
  const size = 9;
  const y = end.y;
  const roomCells: PathCell[] = [];
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let k = 1; k <= size; k++) {
    for (let v = -4; v <= 4; v++) {
      const x = end.x + dx * k + lx * v;
      const z = end.z + dz * k + lz * v;
      roomCells.push({ x, y, z, part: 'room' });
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  }
  const puts: [number, number][] = [];
  for (const [k, v] of [[1, -4], [1, 4], [size, -4], [size, 4]] as const) puts.push([keyOf(end.x + dx * k + lx * v, y, end.z + dz * k + lz * v), TORCH]);
  // 宝箱〔ある 坑道だけ〕。前 ＝ へやの ほう ＝ −向き
  let chest: Shaft['chest'] = null;
  const cells = new Set<number>();
  if (chestPlaced(c.seed, c.shaftId)) {
    const front = COMPASS[dirIndex(-dx, -dz)] as Compass;
    const [rx, rz] = CHEST_RIGHT[front];
    const mid = { x: end.x + dx * size, z: end.z + dz * size };
    const same = mid.x >> 4 === (mid.x + rx) >> 4 && mid.z >> 4 === (mid.z + rz) >> 4;
    const cs: Pt3[] = same ? [{ x: mid.x, y, z: mid.z }, { x: mid.x + rx, y, z: mid.z + rz }] : [{ x: mid.x - rx, y, z: mid.z - rz }, { x: mid.x, y, z: mid.z }];
    const main = cs[0]!;
    const tier = chestTierAt(c.seed, main.x, main.y, main.z);
    cs.forEach((p, i) => {
      const k = keyOf(p.x, p.y, p.z);
      const ix = puts.findIndex((q) => q[0] === k);
      if (ix >= 0) puts.splice(ix, 1);
      puts.push([k, BLOCK_INDEX[chestBlockId(tier, false, i === 1)]]);
      cells.add(k);
    });
    chest = { x: main.x, y: main.y, z: main.z, cells: cs.map((p) => ({ ...p })), front, tier };
  }
  const f = new Frame(end.x, end.z, dirIndex(-dx, -dz) as 0 | 1 | 2 | 3);
  const hub: Hub = { kind: 'room', y, u: Math.ceil(size / 2), vMin: -4, vMax: 4, frame: f, alongU: true };
  return { roomCells, puts, room: { x0, y, z0, x1, z1 }, chest, hub, cells };
}

/** わくを 置く マス〔道の 中心から よこ ±2・高さ 4 と 天井の 5 マス〕。こわれた わくの わりあいは `broken` で きまる */
export function frameCells(f: FrameMark): number[] {
  const out: number[] = [];
  for (const v of [-2, 2]) for (let k = 0; k < 4; k++) out.push(keyOf(f.x + f.px * v, f.y + k, f.z + f.pz * v));
  for (let v = -2; v <= 2; v++) out.push(keyOf(f.x + f.px * v, f.y + 4, f.z + f.pz * v));
  return out;
}
export const WAKU_BLOCK = WAKU;
