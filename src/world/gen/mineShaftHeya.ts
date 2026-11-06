import { SEA_Y } from '../../contracts';
import { colKey } from '../stream/ring';
import { CAVE_CONFIG as C, type CaveKind } from './mineCaveConfig';
import type { Overlay } from './mineCaveGrid';
import { finishRoom, stageRoom, type RoomBox, type RoomStage } from './mineCaveRoom';
import { makeShape, type LocalShape } from './mineCaveShape';
import type { HiroiTryRow, PlacedCave } from './mineCaves';
import type { MineLayerId } from './mineConfig';
import { tryHiroiPlan } from './mineHiroiPlan';
import { hiroiShape, turnCell, turnPlan, worldPlan, type HiroiLayout, type Turn } from './mineHiroiShape';
import { stageHiroi } from './mineHiroiStage';
import { layerSpan } from './mineLayers';
import { keyOf } from './mineShaftBuild';
import type { Geo } from './mineShaftSite';
import { createRng, hash01, hashInts, subSeed } from './random';

/**
 * 坑道の へや〔横穴の 先の ふしぎな ほらあな。docs/design/MINE-1.md §4.7.5〕: 部屋の 形・向き・場所を きめて、坑道の 道と つなぐ。
 * 坑道の 道の 空気・かべは「自然の ほらあな」として 部屋に 見せる〔`Overlay`〕ので、出口の 穴は 部屋づくりの 穴の しらべ〔歩いて 行き来 できるか〕が そのまま みる。
 * 出口は 部屋の 床の 高さ〔段差 0〕。横穴の 長さ・曲がりは 横穴の 計画〔mineShaftSide.ts〕が きめる。
 */

/** 部屋と 部屋の あいだの 空き〔マス。箱の すき間〕と、部屋の 外わく〔古い 列を しらべる まわり〕 */
const GAP = 4;
const OLD_MARGIN = 4;
/** 出口の 候補を ためす 数〔形ごと〕 */
const DOOR_PICKS = 3;
/** 1 回の prepare で しらべる 出口の 数 */
const DOOR_LIST = 12;

export interface HeyaEnv {
  G: Geo;
  kind: CaveKind;
  layer: MineLayerId;
  /** 部屋の id〔箱から〕 */
  id(box: RoomBox): string;
  /** 坑道の id〔はじまりの ほたるの ほらあなは null〕 */
  shaft: string | null;
  /** 乱数の 材料〔横穴ごとに ちがう 数〕 */
  salt: number;
  /** この 坑道に すでに ある 部屋の 箱 */
  rooms: readonly RoomBox[];
  /** 古い 列〔坑道・部屋〕か */
  isOld(k: number): boolean;
  /** はじまりの ほたるの ほらあな: 抽選の 区画〔64〕の ふちから 4 マス 内がわに おさめる */
  snap: boolean;
}

export interface HeyaBuilt {
  cave: PlacedCave;
}

/** 部屋の 場所まで きまった もの〔箱が わかる〕。ブロックの 計算は stage で */
export interface HeyaPrep {
  box: RoomBox;
  /** 道の 点〔(x, z) の まわり 2 マス〕に 部屋の 空気が かかるか〔ブロックの 計算の 前の 早い しらべ〕 */
  hits(points: readonly { x: number; y: number; z: number }[]): boolean;
  /** 坑道の 空気・かべを 見せて 部屋を 作る。ぶつかったり 出口が ふさがれたら null */
  stage(over: Overlay, door: { x: number; y: number; z: number }): HeyaBuilt | null;
}

export interface HeyaSource {
  prepare(e: { x: number; y: number; z: number }, d: readonly [number, number]): HeyaPrep | null;
  /** ひろい ほらあなの ためした 記録〔ほかの 種類は null〕 */
  row(): HiroiTryRow | null;
  /** 作れた 部屋〔なければ null〕 */
  built(): PlacedCave | null;
}

const DIR: readonly (readonly [number, number])[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/** 道を すすむ 向き d で 入る 部屋の 出口〔ひろい ほらあな〕の 向き */
function turnFor(d: readonly [number, number]): Turn {
  return DIR.findIndex((q) => q[0] === -d[0] && q[1] === -d[1]) as Turn;
}

/** 部屋の 形を turn 回 まわす〔ひろい ほらあな いがい〕 */
function turnShape(s: LocalShape, t: Turn): LocalShape {
  if (t === 0) return s;
  const odd = t % 2 === 1;
  const nx = odd ? s.sz : s.sx;
  const nz = odd ? s.sx : s.sz;
  const spin = (a: Int8Array): Int8Array => {
    const out = new Int8Array(nx * nz);
    for (let z = 0; z < s.sz; z++) {
      for (let x = 0; x < s.sx; x++) {
        const [p, q] = turnCell(t, s.sx, s.sz, x, z);
        out[q * nx + p] = a[z * s.sx + x]!;
      }
    }
    return out;
  };
  return { ...s, sx: nx, sz: nz, ceil: spin(s.ceil), water: spin(s.water) };
}

/** 道が すすむ 向き d の まっすぐな 線 m の k ばんめの マス〔部屋の 中の 番号〕。k ＝ 0 は 道が 入る がわの ふち */
function lineAt(d: readonly [number, number], sx: number, sz: number, m: number, k: number): [number, number] {
  if (d[1] === 1) return [m, k];
  if (d[1] === -1) return [m, sz - 1 - k];
  if (d[0] === 1) return [k, m];
  return [sx - 1 - k, m];
}

interface Door {
  shape: LocalShape;
  /** 出口の マス〔部屋の 中〕 */
  ix: number;
  iz: number;
  layout: HiroiLayout | null;
  width: number;
}

/** 形に 出口を つくれる 場所〔最初に 空気に あたる 線〕。広い 順 */
function doors(s: LocalShape, d: readonly [number, number], r: number): Door[] {
  const L = d[0] === 0 ? s.sx : s.sz;
  const K = d[0] === 0 ? s.sz : s.sx;
  const first: number[] = [];
  for (let m = 0; m < L; m++) {
    let k = 0;
    while (k < K) {
      const [x, z] = lineAt(d, s.sx, s.sz, m, k);
      if (s.ceil[z * s.sx + x]! > 0) break;
      k++;
    }
    first.push(k);
  }
  const out: Door[] = [];
  for (let m = 0; m < L; m++) {
    const k = first[m]!;
    if (k >= K) continue;
    const [x, z] = lineAt(d, s.sx, s.sz, m, k);
    if (s.ceil[z * s.sx + x]! < 2 || s.water[z * s.sx + x]! > 0) continue;
    let ok = true;
    for (let j = -2; j <= 2; j++) if (m + j >= 0 && m + j < L && first[m + j]! < k) ok = false;
    if (!ok) continue;
    let width = 1;
    for (const j of [-1, 1]) {
      if (m + j < 0 || m + j >= L || first[m + j] !== k) continue;
      const [qx, qz] = lineAt(d, s.sx, s.sz, m + j, k);
      if (s.ceil[qz * s.sx + qx]! >= 2 && s.water[qz * s.sx + qx]! === 0) width++;
    }
    out.push({ shape: s, ix: x, iz: z, layout: null, width });
  }
  // 広い 順・同じ 広さは くじ
  return out
    .map((o) => ({ o, r: hash01(r, o.ix, o.iz, 3) }))
    .sort((a, b) => b.o.width - a.o.width || a.r - b.r)
    .map((e) => e.o);
}

interface Bounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 箱が 層・地面・海・洞くつの 口・いけに ぶつからないか〔ブロックの 計算の 前に 見る〕 */
function fits(env: HeyaEnv, b: RoomBox, sy: number, snap: Bounds | null): boolean {
  const { G } = env;
  const span = layerSpan(env.layer);
  if (b.y0 < span.lo || b.y1 > span.hi) return false;
  if (snap && (b.x0 < snap.x0 || b.x1 > snap.x1 || b.z0 < snap.z0 || b.z1 > snap.z1)) return false;
  for (const o of env.rooms) {
    if (o.x0 - GAP <= b.x1 && b.x0 <= o.x1 + GAP && o.z0 - GAP <= b.z1 && b.z0 <= o.z1 + GAP && o.y0 - GAP <= b.y1 && b.y0 <= o.y1 + GAP) return false;
  }
  // 地面の いちばん ひくい 所〔まず あらく 見て 入らなければ すぐ やめる。あらい 見かたの ほうが 高くは ならない〕
  let hmin = Infinity;
  for (let z = b.z0 - 1; z <= b.z1 + 1; z += 3) for (let x = b.x0 - 1; x <= b.x1 + 1; x += 3) hmin = Math.min(hmin, G.h(x, z));
  const need = hmin <= SEA_Y - 1 ? C.roof.sea : C.roof.ground;
  if (b.y0 + sy > hmin - need) return false;
  for (let z = b.z0 - 1; z <= b.z1 + 1; z++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) hmin = Math.min(hmin, G.h(x, z));
  if (b.y0 + sy > hmin - (hmin <= SEA_Y - 1 ? C.roof.sea : C.roof.ground)) return false;
  let mouth = Infinity;
  for (let z = b.z0 - 3; z <= b.z1 + 3; z += 3) for (let x = b.x0 - 3; x <= b.x1 + 3; x += 3) mouth = Math.min(mouth, G.mouthBottom(x, z, 3) ?? Infinity);
  if (b.y0 + sy - 1 > mouth - 6) return false;
  for (let z = b.z0 - 3; z <= b.z1 + 3; z += 4) for (let x = b.x0 - 3; x <= b.x1 + 3; x += 4) if (G.special(x, z, 3)) return false;
  for (let cz = (b.z0 - OLD_MARGIN) >> 4; cz <= (b.z1 + OLD_MARGIN) >> 4; cz++) for (let cx = (b.x0 - OLD_MARGIN) >> 4; cx <= (b.x1 + OLD_MARGIN) >> 4; cx++) if (env.isOld(colKey(cx, cz))) return false;
  return true;
}

/** 坑道の へやの 元に なる もの〔1 つの くじに つき 1 つ。形・計画は 横穴を ためし なおしても 同じ〕 */
export function heyaSource(env: HeyaEnv): HeyaSource {
  const { G, kind } = env;
  const seed = G.seed;
  const salt = env.salt;
  let shape0: LocalShape | null | undefined;
  let hiroi: ReturnType<typeof tryHiroiPlan> | undefined;
  let row: HiroiTryRow | null = null;
  let built: PlacedCave | null = null;

  const doorCache = new Map<number, Door[]>();
  const doorsFor = (d: readonly [number, number]): Door[] => {
    const dk = d[0] * 3 + d[1];
    let c = doorCache.get(dk);
    if (!c) doorCache.set(dk, (c = doorsRaw(d)));
    return c;
  };
  const doorsRaw = (d: readonly [number, number]): Door[] => {
    if (kind === 'hiroi') {
      hiroi ??= tryHiroiPlan(hashInts(subSeed(seed, 933), salt, 0, 1));
      row ??= { rx: 0, rz: 0, layer: env.layer, shaft: env.shaft, cave: null, placed: hiroi.plan !== null, small: hiroi.small, work: hiroi.work };
      if (!hiroi.plan) return [];
      const layout = turnPlan(hiroi.plan, turnFor(d));
      return [{ shape: hiroiShape(layout), ix: layout.exit.x, iz: layout.exit.z, layout, width: 3 }];
    }
    if (shape0 === undefined) shape0 = makeShape(kind, createRng(hashInts(subSeed(seed, 954), salt, 0)));
    if (!shape0) return [];
    const out: Door[] = [];
    for (let t = 0; t < 4; t++) out.push(...doors(turnShape(shape0, t as Turn), d, hashInts(subSeed(seed, 955), salt, t)));
    return out.sort((a, b) => b.width - a.width);
  };

  return {
    row: () => row,
    built: () => built,
    prepare(e, d) {
      const list = doorsFor(d);
      let tried = 0;
      for (const dr of list.slice(0, DOOR_LIST)) {
        const s = dr.shape;
        const ox = e.x - dr.ix;
        const oz = e.z - dr.iz;
        const oy = e.y - s.floorK;
        const box: RoomBox = { x0: ox, y0: oy, z0: oz, x1: ox + s.sx - 1, y1: oy + s.sy - 1, z1: oz + s.sz - 1 };
        const R = C.region;
        const snap = env.snap ? { x0: Math.floor(e.x / R) * R + C.edge, z0: Math.floor(e.z / R) * R + C.edge, x1: Math.floor(e.x / R) * R + R - 1 - C.edge, z1: Math.floor(e.z / R) * R + R - 1 - C.edge } : null;
        if (!fits(env, box, s.sy, snap)) continue;
        if (++tried > DOOR_PICKS) break;
        return {
          box,
          hits(points) {
            for (const p of points) {
              if (p.y < box.y0 - 2 || p.y > box.y1 + 2) continue;
              for (let dz = -2; dz <= 2; dz++) {
                for (let dx = -2; dx <= 2; dx++) {
                  const lx = p.x + dx - ox;
                  const lz = p.z + dz - oz;
                  if (lx >= 0 && lz >= 0 && lx < s.sx && lz < s.sz && s.ceil[lz * s.sx + lx]! > 0) return true;
                }
              }
            }
            return false;
          },
          stage(over, door) {
            let st: RoomStage;
            let layout = dr.layout;
            if (kind === 'hiroi') {
              const r = stageHiroi(G, seed, [salt, 7], dr.layout!, ox, oy, oz, over);
              if (!r) return null;
              st = r.room;
              layout = r.layout;
            } else {
              st = stageRoom({ G, seed, kind, shape: s, ox, oy, oz, rng: createRng(hashInts(subSeed(seed, 956), salt, dr.ix, dr.iz)), over });
            }
            if (!connected(st, over, e, door)) return null;
            const room = finishRoom(st);
            room.stats.torches = 2; // 出口の 両がわの たいまつは 坑道の さいごの 列に ある
            if (row) {
              row.cave = env.id(box);
              row.rx = Math.floor(box.x0 / C.region);
              row.rz = Math.floor(box.z0 / C.region);
            }
            built = { id: env.id(box), kind, layer: env.layer, box, room, shaft: env.shaft, hiroi: layout && hiroi?.plan ? worldPlan(layout, { x: box.x0, y: box.y0, z: box.z0 }, hiroi.work) : null };
            return { cave: built };
          },
        };
      }
      return null;
    },
  };
}

/** 部屋の 空気・かべが 坑道に かかって いないか・出口が 空いて いるか */
function connected(st: RoomStage, over: Overlay, e: { x: number; y: number; z: number }, door: { x: number; y: number; z: number }): boolean {
  const { g } = st;
  if (g.a[g.idx(e.x, e.y, e.z)] !== 1) return false;
  if (g.b[g.idx(door.x, door.y, door.z)] !== 0) return false;
  for (let y = g.y0; y < g.y0 + g.gy; y++) {
    for (let z = g.z0; z < g.z0 + g.gz; z++) {
      for (let x = g.x0; x < g.x0 + g.gx; x++) {
        const i = g.idx(x, y, z);
        if (g.a[i]) {
          if (over.taken(keyOf(x, y, z))) return false;
        } else if (g.b[i] && over.air(keyOf(x, y, z))) return false;
      }
    }
  }
  return st.openings > 0;
}

/** くじ: 層の 表から 種類を 引く〔u は 0 以上 1 未満。引く 重みは 表の 比 × fit〕 */
export function pickKind(layer: MineLayerId, u: number): CaveKind {
  const row = C.link[layer].kinds as Partial<Record<CaveKind, number>>;
  const fit = C.link[layer].fit as Partial<Record<CaveKind, number>>;
  const list = (Object.entries(row) as [CaveKind, number][]).map(([k, w]) => [k, w * (fit[k] ?? 1)] as const);
  let r = u * list.reduce((t, e) => t + e[1], 0);
  for (const [k, w] of list) {
    r -= w;
    if (r < 0) return k;
  }
  return list[list.length - 1]![0];
}
