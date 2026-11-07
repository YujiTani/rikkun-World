import { BLOCK_INDEX } from '../blocks/blockTypes';
import { colKey } from '../stream/ring';
import { BOKEN_TUNING as TUNE, DEAD_END_TABLE as DT, SHAPE_TABLE, STYLE_TABLE } from './mineBokenConfig';
import { mouthSpots, planEdaOn, type Branch, type EdaCtx } from './mineBokenEda';
import { rimCells, orePuts } from './mineBokenEnd';
import { Fit, newWork } from './mineBokenFit';
import { WAKU_BLOCK, frameCells, planSkeleton, type FrameMark } from './mineBokenFloors';
import { placeCamp, type CampOut } from './mineBokenCamp';
import { placeMaze, type MazeOut } from './mineBokenMaze';
import { planBokenSides } from './mineBokenSides';
import type { BokenStyle } from './mineBokenStyle';
import { Frame, keyOf, keyX, keyZ } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { outsideWalkable, type ShaftPlan } from './mineShaftPlan';
import { surfaceOf } from './mineShaftSurface';
import type { Geo, Site } from './mineShaftSite';
import type { Shaft } from './mineShaftTypes';
import { createRng, hashInts, subSeed } from './random';

/**
 * 1E の 坑道 1 つの 計画（MINE-1E §4）。入口 → さか道 → 階 … → いちばん 下の へや、迷路・キャンプ・横穴・えだ道。
 * 部品は `Fit` に 1 つずつ 足す〔ぶつかる 部品は 足さない〕。世界の ブロックには さわらない。
 */

const BROKEN = BLOCK_INDEX.kowareta_waku;
type Area = 'kakushi' | 'mukashi' | 'meiro' | 'camp';

export interface BokenPlanEnv {
  isBoken: ((k: number) => boolean) | null;
}

/** 入口の 前を 歩いて 出られる か〔入口だけで きまる。ためす 回数に 数えない〕 */
export function bokenSiteOk(G: Geo, site: Site): boolean {
  return outsideWalkable(G, new Frame(site.x, site.z, site.dir), site.y);
}

export function* planBokenSteps(G: Geo, site: Site, id: string, rx: number, rz: number, style: BokenStyle, env: BokenPlanEnv, attempt: number): Generator<void, ShaftPlan | null> {
  const seed = G.seed;
  const rng = createRng(hashInts(subSeed(seed, 831), site.x, site.z, attempt));
  const F = new Frame(site.x, site.z, site.dir);
  if (!outsideWalkable(G, F, site.y)) return null;
  const work = newWork();
  work.entrance = attempt + 1;
  const fit = new Fit({ G, site, size: style.size, region: { x0: rx * S.region, z0: rz * S.region }, isBoken: env.isBoken });
  const sk = yield* planSkeleton({ fit, rng, style, F, ey: site.y, seed, shaftId: id, work });
  if (!sk) return null;
  const lev = STYLE_TABLE.level.find((l) => l.id === style.level)!;
  const frames: FrameMark[] = [...sk.frames];
  const chestKeys = new Set<number>(sk.chestCells);
  const mouths = sk.floors.map(() => [] as { x: number; z: number }[]);
  const order = (n: number): number[] => [...Array(n).keys()].map((i) => ({ i, r: rng() })).sort((a, b) => a.r - b.r).map((e) => e.i);
  const nF = sk.floors.length;
  // 迷路
  let maze: MazeOut | null = null;
  let mazeFloor = -1;
  if (style.maze) {
    const elig = [...Array(nF).keys()].filter((i) => i < nF - 1 && (nF < 3 || i > 0));
    for (const f of elig.map((i) => ({ i, r: rng() })).sort((a, b) => a.r - b.r).map((e) => e.i)) {
      work.maze++;
      yield;
      const r = placeMaze({ fit, rng, seed, style, chestKeys, frames }, sk.floors[f]!, mouths[f]!);
      if (r) {
        maze = r.maze;
        mazeFloor = f;
        mouths[f]!.push(r.mouth);
        break;
      }
    }
    if (!maze) return null;
  }
  // キャンプ
  let camp: CampOut | null = null;
  if (style.camp) {
    for (const f of order(nF)) {
      yield;
      const r = placeCamp({ fit, rng, frames }, sk.floors[f]!, mouths[f]!);
      if (r) {
        camp = r.camp;
        mouths[f]!.push(r.mouth);
        break;
      }
    }
    if (!camp) return null;
  }
  // 横穴
  const so = yield* planBokenSides({ fit, rng, style, work, floors: sk.floors, roomHub: sk.roomHub, chestCells: chestKeys, mouths, shaftId: id, isOld: env.isBoken });
  if (!so) return null;
  // えだ道
  const branches: Branch[] = [];
  const ec: EdaCtx = { fit, rng, seed, style, work, chestKeys, frames };
  for (let i = 0; i < so.sides.length; i++) {
    yield;
    const want = lev.eda[0] + Math.floor(rng() * (lev.eda[1] - lev.eda[0] + 1));
    const side = so.sides[i]!;
    const spots = mouthSpots(so.slices[i]!, side.from, side.to);
    const made = planEdaOn(ec, i, spots, want, lev.edaMax - branches.length, []);
    branches.push(...made);
  }
  yield;
  // いちばん 下の へやの かべの 鉱石
  const b = fit.b;
  const room = sk.room;
  const taken = (k: number): boolean => b.air.has(k) || b.put.has(k);
  const o = orePuts(seed, rimCells(room, 5, taken), DT.ores[style.depth].bottom, 2);
  for (const [k, v] of o.puts) b.put.set(k, v);
  // わく
  for (const f of frames) {
    const blk = f.broken ?? rng() < TUNE.brokenFrameShare ? BROKEN : WAKU_BLOCK;
    for (const k of frameCells(f)) if (!b.air.has(k) && !b.put.has(k)) b.put.set(k, blk);
  }
  yield;
  const { mound, noTrees, noPlants } = surfaceOf(G, site, b, F);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const c of b.path) {
    x0 = Math.min(x0, c.x);
    x1 = Math.max(x1, c.x);
    z0 = Math.min(z0, c.z);
    z1 = Math.max(z1, c.z);
  }
  if (mound) {
    const h = Math.ceil(mound.width / 2);
    x0 = Math.min(x0, mound.x - h);
    x1 = Math.max(x1, mound.x + h);
    z0 = Math.min(z0, mound.z - h);
    z1 = Math.max(z1, mound.z + h);
  }
  for (const r of so.rooms) {
    x0 = Math.min(x0, r.box.x0 - 1);
    x1 = Math.max(x1, r.box.x1 + 1);
    z0 = Math.min(z0, r.box.z0 - 1);
    z1 = Math.max(z1, r.box.z1 + 1);
  }
  const m = S.boxMargin;
  const box = { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
  if (box.x1 - box.x0 + 1 > style.size || box.z1 - box.z0 + 1 > style.size) return null;
  const R = S.region;
  if (Math.floor(box.x0 / R) !== Math.floor(box.x1 / R) || Math.floor(box.z0 / R) !== Math.floor(box.z1 / R)) return null;
  // 形が かわる 列
  const cols = new Set<number>();
  const addCols = (xa: number, za: number, xb: number, zb: number): void => {
    for (let cz = za >> 4; cz <= zb >> 4; cz++) for (let cx = xa >> 4; cx <= xb >> 4; cx++) cols.add(colKey(cx, cz));
  };
  for (const set of [b.air, b.ring, b.put]) for (const k of set instanceof Map ? set.keys() : set) cols.add(colKey(keyX(k) >> 4, keyZ(k) >> 4));
  for (const c of b.path) for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) cols.add(colKey((c.x + dx) >> 4, (c.z + dz) >> 4));
  if (mound) {
    const h = Math.ceil(mound.width / 2);
    for (let x = mound.x - h; x <= mound.x + h; x += 2) for (let z = mound.z - h; z <= mound.z + h; z += 2) for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) cols.add(colKey((x + dx) >> 4, (z + dz) >> 4));
  }
  for (const r of noTrees) addCols(r[0] - 5, r[1] - 5, r[2] + 5, r[3] + 5);
  for (const r of noPlants) addCols(r[0], r[1], r[2], r[3]);
  if (env.isBoken) for (const k of cols) if (env.isBoken(k)) return null;
  const roomCols = new Set<number>();
  for (const r of so.rooms) for (const k of r.room.ops.keys()) roomCols.add(k);
  // 場所の 窓口
  const areas = new Map<number, Area>();
  const floorKeys = (r: { x0: number; z0: number; x1: number; z1: number; y: number }, a: Area): void => {
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) areas.set(keyOf(x, r.y, z), a);
  };
  for (const br of branches) {
    if (br.old) for (const k of br.eda) areas.set(k, 'mukashi');
  }
  const ends = [...branches.map((br) => br.end), ...(maze?.deadEnds ?? [])];
  for (const e of ends) if (e.room && (e.kind === 'hibi_naka' || e.kind === 'hibi_oo')) floorKeys(e.room, 'kakushi');
  if (maze) {
    const far = maze.deadEnds[maze.farthest]!;
    areas.set(keyOf(far.at.x, far.at.y, far.at.z), 'meiro');
    if (far.room) floorKeys(far.room, 'meiro');
  }
  if (camp) {
    floorKeys(camp.room, 'camp');
    for (const c of b.path) if (c.part === 'camp') areas.set(keyOf(c.x, c.y, c.z), 'camp');
  }
  const sideList = so.sides.map((s, i) => ({ ...s, floor: so.floorOf[i]! }));
  const shaft: Shaft = {
    id,
    start: false,
    entrance: { x: site.x, y: site.y, z: site.z, dir: site.dir, kind: site.kind },
    mound,
    room,
    chest: sk.chest,
    sides: sideList,
    box,
    gen: 'e',
    style: { depth: style.depth, floors: style.floors, size: style.size, level: style.level, camp: style.camp, maze: style.maze },
    floors: sk.floors.map((f) => ({ y: f.y, up: { ...f.up }, down: f.down ? { ...f.down } : null, main: f.main.map((p) => ({ ...p })), bends: f.bends })),
    branches: branches.map((br) => ({ side: br.side, from: br.from, to: br.to, length: br.length, bends: br.bends, old: br.old, rubble: br.rubble, end: br.end })),
    maze: maze ? { ...maze } : null,
    camp: camp ? { room: camp.room, tansu: camp.tansu, lantern: camp.lantern, futon: camp.futon, takibi: camp.takibi } : null,
    work: { ...work },
  };
  void mazeFloor;
  void SHAPE_TABLE;
  return { shaft, path: b.path, b, noTrees, noPlants, cols, rooms: so.rooms, roomCols, tries: so.tries, ref: { sigs: [], target: -1 }, areas };
}
