import { STYLE_TABLE, SHAPE_TABLE, BOKEN_TUNING as TUNE } from './mineBokenConfig';
import type { Fit, Work } from './mineBokenFit';
import type { FloorGeo } from './mineBokenFloors';
import type { BokenStyle } from './mineBokenStyle';
import { DV, Frame } from './mineShaftBuild';
import { CAVE_CONFIG as CC, type CaveKind } from './mineCaveConfig';
import type { HiroiTryRow, PlacedCave } from './mineCaves';
import { layerAt } from './mineLayers';
import type { MineLayerId } from './mineConfig';
import { heyaSource, pickKind } from './mineShaftHeya';
import { tryWinding } from './mineShaftSide';
import type { Hub, SideLim } from './mineSideBuild';
import type { PathCell, ShaftSide } from './mineShaftTypes';
import { createRng, hash01, hashInts, subSeed, type Rng } from './random';

/** 横穴（MINE-1E §4.3）: 階の 本道の かべと いちばん 下の へやから 出す。1C の 作り方〔`tryWinding`〕を そのまま 使う。 */

export interface SidesCtx {
  fit: Fit;
  rng: Rng;
  style: BokenStyle;
  work: Work;
  floors: FloorGeo[];
  roomHub: Hub;
  chestCells: ReadonlySet<number>;
  /** 階ごとの 口の 場所〔横穴・迷路・キャンプ。口と口は 6 マス 以上〕 */
  mouths: { x: number; z: number }[][];
  /** 坑道の id〔坑道の へやの id に 使う〕 */
  shaftId: string;
  /** 古い 列〔1E の 一覧・坑道・部屋〕か。なければ すべて 新しい */
  isOld: ((k: number) => boolean) | null;
}
export interface SidesOut {
  sides: ShaftSide[];
  /** 横穴ごとの 階の 番号〔いちばん 下の へやは −1〕 */
  floorOf: number[];
  /** 横穴ごとの 道の マス */
  slices: PathCell[][];
  /** 坑道の へや〔横穴の 先の ふしぎな ほらあな。1D〕と ひろい ほらあなの ためし */
  rooms: PlacedCave[];
  tries: HiroiTryRow[];
}

const dirIndex = (dx: number, dz: number): 0 | 1 | 2 | 3 => DV.findIndex((d) => d[0] === dx && d[1] === dz) as 0 | 1 | 2 | 3;
const cheb = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));

/** 本道の 口に できる 場所 */
export function roadSpots(f: FloorGeo): { i: number; hub: Hub }[] {
  const out: { i: number; hub: Hub }[] = [];
  for (const leg of f.legs) {
    const o = f.main[leg.from]!;
    const fr = new Frame(o.x, o.z, dirIndex(-leg.dx, -leg.dz));
    for (const i of leg.ok) out.push({ i, hub: { kind: 'landing', y: f.y, u: i - leg.from, vMin: -1, vMax: 1, frame: fr, alongU: true } });
  }
  return out;
}

/** 坑道の へやを ためす 候補の 数〔当たりの 横穴 1 本が 部屋を 入れる ために 出られる 口を 何か所 ためすか〕 */
const HEYA_CANDS = 8;
/** 口 1 か所で 部屋の 形を ためす 回数 */
const HEYA_TRIES_PER_CAND = 12;
/** 部屋の ない ふつうの 横穴を 口 1 か所で ためす 回数 */
const PLAIN_TRIES = 6;

export function* planBokenSides(c: SidesCtx): Generator<void, SidesOut | null> {
  const { fit, rng } = c;
  const G = fit.env.G;
  const lev = STYLE_TABLE.level.find((l) => l.id === c.style.level)!;
  const out: SidesOut = { sides: [], floorOf: [], slices: [], rooms: [], tries: [] };
  const S = SHAPE_TABLE.side;
  type Cand = { x: number; z: number; hub: Hub };
  const lim = (): SideLim => {
    const long = c.style.size >= S.longMinSize && rng() < S.longShare;
    return { maxBox: fit.maxExt, lengthMin: long ? S.longLength[0] : S.length[0], lengthMax: long ? S.longLength[1] : S.length[1], aimTries: 0 };
  };
  const fresh = (cells: readonly PathCell[]): boolean => cells.every((q) => fit.freshCol(q.x, q.z));
  const over = (): boolean => c.work.sides++ >= SHAPE_TABLE.limit.tries.sides;
  /** 横穴を 1 本 のこす〔記録〕 */
  const keep = (side: ShaftSide, p0: number, f: number, cand: Cand, mouths: { x: number; z: number }[]): void => {
    const slice = fit.b.path.slice(p0);
    for (const q of slice) fit.extend(q.x, q.z, q.x, q.z);
    out.sides.push(side);
    out.floorOf.push(f);
    out.slices.push(slice);
    mouths.push({ x: cand.x, z: cand.z });
  };
  /** 坑道の へやを つなぐ 横穴を 1 つの 口で ためす。できたら true */
  const heya = function* (cand: Cand, f: number, kind: CaveKind, layer: MineLayerId, mouths: { x: number; z: number }[]): Generator<void, boolean | null> {
    const src = heyaSource({ G, kind, layer, id: () => `${c.shaftId}_h${out.rooms.length}`, shaft: c.shaftId, salt: hashInts(cand.x, cand.z, cand.hub.y, 1), rooms: fit.b.reserved, isOld: c.isOld ?? (() => false), snap: false });
    const p0 = fit.b.path.length;
    const s0 = rng() < 0.5 ? -1 : 1;
    let done = false;
    for (let t = 0; t < HEYA_TRIES_PER_CAND && !done; t++) {
      if (over()) return null;
      yield;
      const hrng = createRng(hashInts(subSeed(G.seed, 953), cand.x, cand.z, cand.hub.y, t));
      // 部屋の 箱まで ふくめて 箱・区画に おさまる ときだけ 足す
      const side = tryWinding(G, fit.b, cand.hub, hrng, cand.hub.frame, fit.env.region, fit.env.site, c.chestCells, t % 2 === 0 ? s0 : -s0, src, lim(), true, (cells) => {
        const cave = src.built();
        return fresh(cells) && (!cave || fit.roomFits(cave.box));
      });
      const cave = src.built();
      if (side && cave) {
        out.rooms.push(cave);
        fit.extend(cave.box.x0 - 1, cave.box.z0 - 1, cave.box.x1 + 1, cave.box.z1 + 1);
        side.heyaHit = true;
        side.heyaKind = kind;
        keep(side, p0, f, cand, mouths);
        done = true;
      }
    }
    const row = src.row();
    if (row) out.tries.push(row);
    return done;
  };
  /** 部屋の ない ふつうの 横穴を 1 つの 口で ためす */
  const plain = function* (cand: Cand, f: number, hit: CaveKind | null, mouths: { x: number; z: number }[]): Generator<void, boolean | null> {
    for (let t = 0; t < PLAIN_TRIES; t++) {
      if (over()) return null;
      yield;
      const p0 = fit.b.path.length;
      const side = tryWinding(G, fit.b, cand.hub, rng, cand.hub.frame, fit.env.region, fit.env.site, c.chestCells, rng() < 0.5 ? -1 : 1, undefined, lim(), true, fresh);
      if (side) {
        if (hit) {
          side.heyaHit = true;
          side.heyaKind = hit;
        }
        keep(side, p0, f, cand, mouths);
        return true;
      }
    }
    return false;
  };
  /** 1 つの 階〔か いちばん 下の へや〕から 横穴を want 本 出す。出せなければ false */
  const place = function* (hubs: Cand[], f: number, want: number, mouths: { x: number; z: number }[]): Generator<void, boolean> {
    const order = hubs.map((h) => ({ h, r: rng() })).sort((p, q) => p.r - q.r).map((e) => e.h);
    for (let k = 0; k < want; k++) {
      const cands = order.filter((h) => !mouths.some((m) => cheb(m, h) < TUNE.mouthGap));
      if (cands.length === 0) return false;
      // 坑道の へやの くじ〔横穴 1 本ごと。1D と 同じ 表。口の 成り行きで 当たりが かたよらない ように 1 本めの 番号で 引く〕
      const layer = layerAt(cands[0]!.hub.y) ?? 'fukai';
      const hit = hash01(subSeed(G.seed, 951), fit.env.site.x, fit.env.site.z, cands[0]!.hub.y, k + 1) < CC.link[layer].chance;
      const kind = hit ? pickKind(layer, hash01(subSeed(G.seed, 952), fit.env.site.x, fit.env.site.z, cands[0]!.hub.y, k + 1)) : null;
      let done: boolean | null = false;
      if (kind) {
        for (const cand of cands.slice(0, HEYA_CANDS)) {
          done = yield* heya(cand, f, kind, layer, mouths);
          if (done !== false) break;
        }
      }
      if (done === null) return false;
      for (const cand of cands) {
        if (done) break;
        done = yield* plain(cand, f, kind, mouths);
        if (done === null) return false;
      }
      if (!done) return false;
    }
    return true;
  };
  for (let f = 0; f < c.floors.length; f++) {
    const fl = c.floors[f]!;
    const want = lev.sides[0] + Math.floor(rng() * (lev.sides[1] - lev.sides[0] + 1));
    const hubs = roadSpots(fl).map((s) => ({ x: fl.main[s.i]!.x, z: fl.main[s.i]!.z, hub: s.hub }));
    if (!(yield* place(hubs, f, want, c.mouths[f]!))) return null;
  }
  if (rng() < 0.5) {
    const h = c.roomHub;
    yield* place([{ x: h.frame.x(h.u, 0), z: h.frame.z(h.u, 0), hub: h }], -1, 1, []);
  }
  return out;
}
