import { STYLE_TABLE, SHAPE_TABLE, BOKEN_TUNING as TUNE } from './mineBokenConfig';
import type { Fit, Work } from './mineBokenFit';
import type { FloorGeo } from './mineBokenFloors';
import type { BokenStyle } from './mineBokenStyle';
import { DV, Frame } from './mineShaftBuild';
import { tryWinding } from './mineShaftSide';
import type { Hub, SideLim } from './mineSideBuild';
import type { PathCell, ShaftSide } from './mineShaftTypes';
import type { Rng } from './random';

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
}
export interface SidesOut {
  sides: ShaftSide[];
  /** 横穴ごとの 階の 番号〔いちばん 下の へやは −1〕 */
  floorOf: number[];
  /** 横穴ごとの 道の マス */
  slices: PathCell[][];
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

export function* planBokenSides(c: SidesCtx): Generator<void, SidesOut | null> {
  const { fit, rng } = c;
  const lev = STYLE_TABLE.level.find((l) => l.id === c.style.level)!;
  const out: SidesOut = { sides: [], floorOf: [], slices: [] };
  const S = SHAPE_TABLE.side;
  const place = function* (hubs: { x: number; z: number; hub: Hub }[], f: number, want: number, mouths: { x: number; z: number }[]): Generator<void, boolean> {
    const order = hubs.map((h) => ({ h, r: rng() })).sort((p, q) => p.r - q.r).map((e) => e.h);
    let made = 0;
    for (const cand of order) {
      if (made >= want) break;
      if (mouths.some((m) => cheb(m, cand) < TUNE.mouthGap)) continue;
      for (let t = 0; t < 6 && made < want; t++) {
        if (c.work.sides++ >= SHAPE_TABLE.limit.tries.sides) return false;
        yield;
        const long = c.style.size >= S.longMinSize && rng() < S.longShare;
        const lim: SideLim = { maxBox: fit.maxExt, lengthMin: long ? S.longLength[0] : S.length[0], lengthMax: long ? S.longLength[1] : S.length[1], aimTries: 0 };
        const p0 = fit.b.path.length;
        const sgn = rng() < 0.5 ? -1 : 1;
        const side = tryWinding(fit.env.G, fit.b, cand.hub, rng, cand.hub.frame, fit.env.region, fit.env.site, c.chestCells, sgn, undefined, lim, true, (cells) => cells.every((q) => fit.freshCol(q.x, q.z)));
        if (!side) continue;
        const slice = fit.b.path.slice(p0);
        for (const q of slice) fit.extend(q.x, q.z, q.x, q.z);
        out.sides.push(side);
        out.floorOf.push(f);
        out.slices.push(slice);
        mouths.push({ x: cand.x, z: cand.z });
        made++;
        break;
      }
    }
    return made >= want;
  };
  for (let f = 0; f < c.floors.length; f++) {
    const fl = c.floors[f]!;
    const want = lev.sides[0] + Math.floor(rng() * (lev.sides[1] - lev.sides[0] + 1));
    const hubs = roadSpots(fl).map((s) => ({ x: fl.main[s.i]!.x, z: fl.main[s.i]!.z, hub: s.hub }));
    if (!(yield* place(hubs, f, want, c.mouths[f]!))) return null;
  }
  if (rng() < 0.5) {
    const h = c.roomHub;
    const ok = yield* place([{ x: h.frame.x(h.u, 0), z: h.frame.z(h.u, 0), hub: h }], -1, 1, []);
    void ok;
  }
  return out;
}
