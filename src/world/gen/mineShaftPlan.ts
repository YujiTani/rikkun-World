import { SEA_Y } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { CHEST_RIGHT, chestBlockId } from '../blocks/chestBlock';
import { colKey } from '../stream/ring';
import { chestPlaced, chestTierAt } from './mineChestTable';
import { COMPASS, DV, Frame, ShaftBuilder, airHeightOf, keyOf, keyX, keyY, keyZ, type Pt3 } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { planSides } from './mineShaftSide';
import { surfaceOf } from './mineShaftSurface';
import type { Hub } from './mineSideBuild';
import type { SideRef, StartLink } from './mineShaftHeya';
import { Geo, coverOk, type Dir, type Site } from './mineShaftSite';
import type { HiroiTryRow, PlacedCave } from './mineCaves';
import type { Compass, PathCell, Shaft } from './mineShaftTypes';
import type { FloorGeo } from './mineBokenFloors';
import type { YakataBuilt } from './mineYakataTypes';
import { createRng, hashInts, subSeed, type Rng } from './random';

/**
 * 坑道 1 つの 計画（MINE-1C。docs/design/MINE-1.md §4.5.2）。入口 → さか道 → おどりば → … → いちばん 下の へや、横穴、たいまつ、わく、山。
 * 世界の ブロックには さわらず `ShaftBuilder` に ためる（列を 作る ときに mineShaftCarve.ts が 置く）。
 * 道の 座標は 入口を 原点に した (u, v)〔u ＝ 奥へ、v ＝ 横〕で 組んで 世界の 座標に 写す。
 */

const TORCH = BLOCK_INDEX.torch;
const WAKU = BLOCK_INDEX.kodo_waku;
const KIN = BLOCK_INDEX.kin_ore;
const IRON = BLOCK_INDEX.iron_ore;

export interface ShaftPlan {
  shaft: Shaft;
  path: PathCell[];
  b: ShaftBuilder;
  /** この 坑道で 木を おかない 四角（x0, z0, x1, z1。両はし ふくむ） */
  noTrees: [number, number, number, number][];
  /** 草花を おかない 四角 */
  noPlants: [number, number, number, number][];
  /** 形が かわる 列（colKey）。古い 列と かさなる 場所には 置かない ための 一覧 */
  cols: Set<number>;
  /** 坑道の へや〔1D。はじまりの 坑道は ほたるの ほらあな〕 */
  rooms: PlacedCave[];
  /** 部屋が かかる 列〔colKey〕 */
  roomCols: Set<number>;
  /** 坑道の へやの ひろい ほらあなを ためした 記録 */
  tries: HiroiTryRow[];
  /** 横穴の しるし〔はじまりの 坑道を 1C の まま に する ための くらべ〕 */
  ref: SideRef;
  /** 1F: やかたを つける ための 手がかり〔いちばん 下の 階と、その 階の 口の 場所。1E の 坑道〔深い ほう〕だけ〕 */
  boken?: { bottom: FloorGeo; mouths: { x: number; z: number }[] };
  /** 1F: 置いた やかた〔なければ 省略〕。空気・かべは 上の `b` に 入って いる */
  yakata?: YakataBuilt;
  /** 1F: 形が かかる 列を 見つける ための 外の 四角〔やかたが 箱から はみ出す とき〕 */
  ext?: { x0: number; z0: number; x1: number; z1: number };
  /** 1E: 場所の 窓口 `areaAt` 用〔足の マスの キー → 場所〕。1C・1D は なし */
  areas?: ReadonlyMap<number, 'kakushi' | 'mukashi' | 'meiro' | 'camp'>;
}

/** 計画の 外の 事情 */
export interface PlanEnv {
  /** 古い 坑道の 列か */
  isOld(k: number): boolean;
  /** 古い 部屋の 列か */
  isOldHeya(k: number): boolean;
  /** はじまりの 坑道: 1C の 計画を ref に して、なかほどの いちばん 上の 横穴を ほたるの ほらあなへ かえる ためし〔null は 1C の 形〕 */
  link: StartLink | null;
  /** 坑道の へやの くじを 引くか〔false は 1C の 形。テストの くらべ用〕 */
  heya: boolean;
}

const dirOf = (dx: number, dz: number): Dir => DV.findIndex((d) => d[0] === dx && d[1] === dz) as Dir;

interface Ramp {
  sgn: 1 | -1;
  start: number;
  lane: number;
  y0: number;
  n: number;
}

/** さか道の 組み立て: 段の 数の 並びと 向き。u が はみ出さない ものを さがす */
function planRamps(ey: number, yRoom: number, rng: Rng): Ramp[] | null {
  const R = S.ramp;
  const total = ey - yRoom - 1;
  const lo = Math.ceil((total + 1) / (R.stepsMax + 1));
  const hi = Math.floor((total + 1) / (R.stepsMin + 1));
  if (hi < lo) return null;
  for (let t = 0; t < R.tries; t++) {
    const m = lo + Math.floor(rng() * (hi - lo + 1));
    const sum = total - (m - 1);
    if (sum < R.stepsMin * m || sum > R.stepsMax * m) continue;
    const ns = new Array<number>(m).fill(R.stepsMin);
    let extra = sum - R.stepsMin * m;
    while (extra > 0) {
      const i = Math.floor(rng() * m);
      if (ns[i]! < R.stepsMax) {
        ns[i]!++;
        extra--;
      }
    }
    const out: Ramp[] = [];
    let sgn: 1 | -1 = 1;
    let start: number = R.cellsPerStep;
    let y0 = ey;
    let ok = true;
    for (let i = 0; i < m; i++) {
      const n = ns[i]!;
      const lane = sgn === 1 ? 0 : S.landing.laneGap;
      out.push({ sgn, start, lane, y0, n });
      const last = start + sgn * (R.cellsPerStep * n - 1);
      if (Math.min(start, last) < 2) ok = false;
      y0 = y0 - n - 1;
      // 次の さか道は 同じ u から 反対向き
      const sgnOld = sgn;
      start = last;
      sgn = (sgn === 1 ? -1 : 1) as 1 | -1;
      // おどりば（last から 3 マス）・さいごは へや（9 マス）まで 入口の 手前に でない
      const reach = i < m - 1 ? S.landing.depth : S.room.size;
      if (Math.min(last, last + sgnOld * reach) < 2) ok = false;
    }
    if (ok) return out;
  }
  return null;
}

/** 入口の 前〔外へ 向かって 4 マス〕を 歩いて 出られる か〔地面が 1 段ずつ・海でない〕。入口の 足もとの 地面は ey−1 */
export function outsideWalkable(G: Geo, F: Frame, ey: number): boolean {
  let prev = ey - 1;
  for (let d = 1; d <= S.entrance.outsideSteps; d++) {
    const x = F.x(-d, 0);
    const z = F.z(-d, 0);
    const h = G.h(x, z);
    if (h <= SEA_Y || Math.abs(h - prev) > 1 || Math.abs(h + 1 - ey) > S.entrance.outsideDy) return false;
    prev = h;
  }
  return true;
}

/** 計画を いっきに 作る（はじまりの 坑道・テスト用） */
export function planShaft(G: Geo, site: Site, id: string, start: boolean, env: PlanEnv, attempt: number): ShaftPlan | null {
  const job = planShaftSteps(G, site, id, start, env, attempt);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

/** 計画を 少しずつ 作る 仕事（短い 仕事ごとに yield。先読みが 時間で 止まれる ように。結果は planShaft と 同じ） */
export function* planShaftSteps(G: Geo, site: Site, id: string, start: boolean, env: PlanEnv, attempt: number): Generator<void, ShaftPlan | null> {
  const isOldCol = env.isOld;
  const seed = G.seed;
  const rng = createRng(hashInts(subSeed(seed, 811), site.x, site.z, attempt));
  const ey = site.y;
  const yRoom = S.room.minY + Math.floor(rng() * (S.room.maxY - S.room.minY + 1));
  const ramps = planRamps(ey, yRoom, rng);
  if (!ramps) return null;
  const F = new Frame(site.x, site.z, site.dir);
  if (!outsideWalkable(G, F, ey)) return null;
  const b = new ShaftBuilder();
  const hubs: Hub[] = [];

  // 入口: 平らな 2 マス
  for (let u = 0; u < S.entrance.flatCells; u++) for (let v = -1; v <= 1; v++) b.addCell(F.pt(u, v, ey), 'entrance');
  // さか道・おどりば
  const wallFrames: { u: number; vc: number; y: number }[] = [{ u: 0, vc: 0, y: ey }];
  const torchCells: Pt3[] = [F.pt(0, -1, ey), F.pt(0, 1, ey)];
  const cps = S.ramp.cellsPerStep;
  let lastRamp: Ramp = ramps[0]!;
  let lastU = 0;
  let sinceTorch = 3;
  ramps.forEach((r, i) => {
    for (let k = 0; k < r.n; k++) {
      for (let j = 0; j < cps; j++) {
        const u = r.start + r.sgn * (cps * k + j);
        const y = r.y0 - 1 - k;
        for (let v = r.lane - 1; v <= r.lane + 1; v++) b.addCell(F.pt(u, v, y), 'ramp');
        if (++sinceTorch >= S.road.torchEvery) {
          sinceTorch = 0;
          torchCells.push(F.pt(u, r.lane + (i % 2 === 0 ? 1 : -1) * (k % 2 === 0 ? 1 : -1), y));
        }
        if (j === 0 && k % (S.road.frameEvery / cps) === 0) wallFrames.push({ u, vc: r.lane, y });
      }
    }
    const last = r.start + r.sgn * (cps * r.n - 1);
    lastRamp = r;
    lastU = last;
    if (i < ramps.length - 1) {
      // おどりば: 7 × 3、平ら。ramp の 終わりの 1 つ 下
      const ly = r.y0 - r.n - 1;
      const rows = Array.from({ length: S.landing.depth }, (_, d) => last + r.sgn * (d + 1));
      for (const u of rows) for (let v = -1; v <= 5; v++) b.addCell(F.pt(u, v, ly), 'landing');
      torchCells.push(F.pt(rows[1]!, 2, ly));
      hubs.push({ kind: 'landing', y: ly, u: rows[1]!, vMin: -1, vMax: 5, frame: F, alongU: true });
    }
  });
  // いちばん 下の へや: 9 × 9
  const rs = lastRamp.sgn;
  const rLane = lastRamp.lane;
  const yR = lastRamp.y0 - lastRamp.n - 1;
  if (yR !== yRoom) return null;
  const uIn0 = lastU + rs;
  const uBack = lastU + rs * S.room.size;
  for (let k = 1; k <= S.room.size; k++) for (let v = rLane - 4; v <= rLane + 4; v++) b.addCell(F.pt(lastU + rs * k, v, yR), 'room');
  for (const [u, v] of [[uIn0, rLane - 4], [uIn0, rLane + 4], [uBack, rLane - 4], [uBack, rLane + 4]] as const) torchCells.push(F.pt(u, v, yR));
  const uMid = lastU + rs * Math.ceil(S.room.size / 2);
  hubs.push({ kind: 'room', y: yR, u: uMid, vMin: rLane - 4, vMax: rLane + 4, frame: F, alongU: true });
  yield;
  // 洞くつの 口の 外わく（まわり 2 マス）に かかる 道は ゆるさない
  for (const c of b.path) for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) if (isOldCol(colKey((c.x + dx) >> 4, (c.z + dz) >> 4))) return null; // 古い 列に かかる 計画は 早く あきらめる
  for (const c of b.path) if (G.nearMouth(c.x, c.z, 2) || !coverOk(G, site, c, airHeightOf(c.part))) return null;

  yield;
  // 宝箱 〔ある 坑道だけ〕
  const room = {
    x0: Math.min(F.x(uIn0, rLane - 4), F.x(uBack, rLane + 4), F.x(uIn0, rLane + 4), F.x(uBack, rLane - 4)),
    x1: Math.max(F.x(uIn0, rLane - 4), F.x(uBack, rLane + 4), F.x(uIn0, rLane + 4), F.x(uBack, rLane - 4)),
    z0: Math.min(F.z(uIn0, rLane - 4), F.z(uBack, rLane + 4), F.z(uIn0, rLane + 4), F.z(uBack, rLane - 4)),
    z1: Math.max(F.z(uIn0, rLane - 4), F.z(uBack, rLane + 4), F.z(uIn0, rLane + 4), F.z(uBack, rLane - 4)),
    y: yR,
  };
  let chest: Shaft['chest'] = null;
  const chestCells = new Set<number>();
  if (chestPlaced(seed, id)) {
    // 前（へやの ほう）＝ −u 向き
    const fx = -F.ux * rs;
    const fz = -F.uz * rs;
    const front = COMPASS[dirOf(fx, fz)] as Compass;
    const [rx, rz] = CHEST_RIGHT[front];
    const mid = { x: F.x(uBack, rLane), z: F.z(uBack, rLane) };
    const same = mid.x >> 4 === (mid.x + rx) >> 4 && mid.z >> 4 === (mid.z + rz) >> 4;
    const cells: Pt3[] = same ? [{ x: mid.x, y: yR, z: mid.z }, { x: mid.x + rx, y: yR, z: mid.z + rz }] : [{ x: mid.x - rx, y: yR, z: mid.z - rz }, { x: mid.x, y: yR, z: mid.z }];
    const main = cells[0]!;
    const tier = chestTierAt(seed, main.x, main.y, main.z);
    cells.forEach((c, i) => {
      b.put.set(keyOf(c.x, c.y, c.z), BLOCK_INDEX[chestBlockId(tier, false, i === 1)]);
      chestCells.add(keyOf(c.x, c.y, c.z));
    });
    chest = { x: main.x, y: main.y, z: main.z, cells: cells.map((c) => ({ ...c })), front, tier };
  }
  for (const t of torchCells) {
    const k = keyOf(t.x, t.y, t.z);
    if (!chestCells.has(k)) b.put.set(k, TORCH);
  }
  // 入口の 外がわの 面（u=-1）は かべに しない（外へ ひらく。§4.5.2）
  for (let v = -1; v <= 1; v++) for (let k = 0; k < airHeightOf('entrance'); k++) b.exempt.add(keyOf(F.x(-1, v), ey + k, F.z(-1, v)));
  yield;
  b.buildRing();
  yield;
  // 横穴
  const out = yield* planSides(G, b, hubs, start, rng, F, site, chestCells, { shaftId: id, lottery: env.heya, link: env.link, isOld: (k) => env.isOld(k) || env.isOldHeya(k) });
  if (out === null) return null;
  const sides = out.sides;

  yield;
  // わく: 入口と 道に そって ６ マスごと（かべ・天井の 中に うめる）
  for (const f of wallFrames) {
    for (const v of [f.vc - 2, f.vc + 2]) for (let k = 0; k < 4; k++) frameCell(b, F.x(f.u, v), f.y + k, F.z(f.u, v));
    for (let v = f.vc - 2; v <= f.vc + 2; v++) frameCell(b, F.x(f.u, v), f.y + 4, F.z(f.u, v));
  }

  // へやの かべの 鉱石〔きん ＞ 10・てつ ＞ 6〕
  const rim: number[] = [];
  const uMin = Math.min(uIn0, uBack);
  const uMax = Math.max(uIn0, uBack);
  for (let u = uMin - 1; u <= uMax + 1; u++) {
    for (let v = rLane - 5; v <= rLane + 5; v++) {
      for (let y = yR - 1; y <= yR + 5; y++) {
        const inside = u >= uMin && u <= uMax && v >= rLane - 4 && v <= rLane + 4 && y >= yR && y <= yR + 4;
        if (inside) continue;
        // 部屋に 面して いる マスだけ
        const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([du, dy, dv]) => {
          const nu = u + du!;
          const nv = v + dv!;
          const ny = y + dy!;
          return nu >= uMin && nu <= uMax && nv >= rLane - 4 && nv <= rLane + 4 && ny >= yR && ny <= yR + 4;
        });
        if (!faces) continue;
        const k = keyOf(F.x(u, v), y, F.z(u, v));
        if (b.air.has(k) || b.put.has(k)) continue;
        // 宝箱の うしろの かべ・天井・床の まわりは さける
        rim.push(k);
      }
    }
  }
  const order = rim.map((k) => ({ k, r: hashInts(seed, keyX(k), keyZ(k), keyY(k), 77) })).sort((p, q) => p.r - q.r);
  order.slice(0, S.room.goldWall).forEach((e) => b.put.set(e.k, KIN));
  order.slice(S.room.goldWall, S.room.goldWall + S.room.ironWall).forEach((e) => b.put.set(e.k, IRON));

  yield;
  // 山・入口の 台
  const { mound, noTrees, noPlants } = surfaceOf(G, site, b, F);

  // 箱
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
  for (const r of out.rooms) {
    x0 = Math.min(x0, r.box.x0 - 1);
    x1 = Math.max(x1, r.box.x1 + 1);
    z0 = Math.min(z0, r.box.z0 - 1);
    z1 = Math.max(z1, r.box.z1 + 1);
  }
  const m = S.boxMargin;
  const box = { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
  if (box.x1 - box.x0 + 1 > S.boxMax || box.z1 - box.z0 + 1 > S.boxMax) return null;
  if (!start) {
    const R = S.region;
    if (Math.floor(box.x0 / R) !== Math.floor(box.x1 / R) || Math.floor(box.z0 / R) !== Math.floor(box.z1 / R)) return null;
  }
  yield;
  // 形が かわる 列
  const cols = new Set<number>();
  const addCols = (xa: number, za: number, xb: number, zb: number): void => {
    for (let cz = za >> 4; cz <= zb >> 4; cz++) for (let cx = xa >> 4; cx <= xb >> 4; cx++) cols.add(colKey(cx, cz));
  };
  yield;
  for (const set of [b.air, b.ring, b.put]) for (const k of set instanceof Map ? set.keys() : set) cols.add(colKey(keyX(k) >> 4, keyZ(k) >> 4));
  yield;
  for (const c of b.path) for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) cols.add(colKey((c.x + dx) >> 4, (c.z + dz) >> 4));
  if (mound) {
    const h = Math.ceil(mound.width / 2);
    for (let x = mound.x - h; x <= mound.x + h; x += 2) for (let z = mound.z - h; z <= mound.z + h; z += 2) for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) cols.add(colKey((x + dx) >> 4, (z + dz) >> 4));
  }
  for (const r of noTrees) addCols(r[0] - 5, r[1] - 5, r[2] + 5, r[3] + 5); // 木の はっぱは 4〜5 マス となりの 列へ はみ出す
  for (const r of noPlants) addCols(r[0], r[1], r[2], r[3]);
  for (const k of cols) if (isOldCol(k)) return null;

  const shaft: Shaft = {
    id,
    start,
    entrance: { x: site.x, y: ey, z: site.z, dir: site.dir, kind: site.kind },
    mound,
    room,
    chest,
    sides,
    box,
    gen: 'c',
    style: null,
    floors: [],
    branches: [],
    maze: null,
    camp: null,
  };
  const roomCols = new Set<number>();
  for (const r of out.rooms) if (r.shaft !== null) for (const k of r.room.ops.keys()) roomCols.add(k); // はじまりの ほたるは 抽選の 部屋として 置く
  return { shaft, path: b.path, b, noTrees, noPlants, cols, rooms: out.rooms, roomCols, tries: out.tries, ref: out.ref };
}

function frameCell(b: ShaftBuilder, x: number, y: number, z: number): void {
  const k = keyOf(x, y, z);
  if (!b.air.has(k) && !b.put.has(k)) b.put.set(k, WAKU);
}

