import { BLOCK_INDEX } from '../blocks/blockTypes';
import { CHEST_RIGHT, chestBlockId } from '../blocks/chestBlock';
import { colKey } from '../stream/ring';
import { chestPlaced, chestTierAt } from './mineChestTable';
import { COMPASS, DV, Frame, ShaftBuilder, keyOf, keyX, keyY, keyZ, type Pt3 } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { planSides, type Hub } from './mineShaftSide';
import { Geo, type Dir, type Site } from './mineShaftSite';
import type { Compass, PathCell, Shaft } from './mineShaftTypes';
import { createRng, hashInts, subSeed, type Rng } from './random';

/**
 * 坑道 1 つの 計画（MINE-1C。docs/design/MINE-1.md §4.5.2）。入口 → さか道 → おどりば → … → いちばん 下の へや、横穴、たいまつ、わく、山。
 * 世界の ブロックには さわらず `ShaftBuilder` に ためる（列を 作る ときに mineShaftCarve.ts が 置く）。
 * 道の 座標は 入口を 原点に した (u, v)〔u ＝ 奥へ、v ＝ 横〕で 組んで 世界の 座標に 写す。
 */

const STONE = BLOCK_INDEX.stone;
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
  for (let t = 0; t < 400; t++) {
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
      const reach = i < m - 1 ? 3 : 9;
      if (Math.min(last, last + sgnOld * reach) < 2) ok = false;
    }
    if (ok) return out;
  }
  return null;
}

/** 山の 形: 中心から の きょり r に ある 地面の 上の 高さ。Tc − floor(r)（r が Tc 以上は 0） */
const moundBump = (tc: number, r: number): number => (r < tc ? tc - Math.floor(r) : 0);

export function planShaft(G: Geo, site: Site, id: string, start: boolean, isOldCol: (k: number) => boolean, attempt: number): ShaftPlan | null {
  const seed = G.seed;
  const rng = createRng(hashInts(subSeed(seed, 811), site.x, site.z, attempt));
  const ey = site.y;
  const yRoom = S.room.minY + Math.floor(rng() * (S.room.maxY - S.room.minY + 1));
  const ramps = planRamps(ey, yRoom, rng);
  if (!ramps) return null;
  const F = new Frame(site.x, site.z, site.dir);
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
      const rows = [1, 2, 3].map((d) => last + r.sgn * d);
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
  const uBack = lastU + rs * 9;
  for (let k = 1; k <= 9; k++) for (let v = rLane - 4; v <= rLane + 4; v++) b.addCell(F.pt(lastU + rs * k, v, yR), 'room');
  for (const [u, v] of [[uIn0, rLane - 4], [uIn0, rLane + 4], [uBack, rLane - 4], [uBack, rLane + 4]] as const) torchCells.push(F.pt(u, v, yR));
  const uMid = lastU + rs * 5;
  hubs.push({ kind: 'room', y: yR, u: uMid, vMin: rLane - 4, vMax: rLane + 4, frame: F, alongU: true });
  // 洞くつの 口の 外わく（まわり 2 マス）に かかる 道は ゆるさない
  for (const c of b.path) if (G.nearMouth(c.x, c.z, 2)) return null;

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
      b.put.set(keyOf(c.x, c.y, c.z), BLOCK_INDEX[chestBlockId(tier, false, i === 1, front)]);
      chestCells.add(keyOf(c.x, c.y, c.z));
    });
    chest = { x: main.x, y: main.y, z: main.z, cells: cells.map((c) => ({ ...c })), front, tier };
  }
  for (const t of torchCells) {
    const k = keyOf(t.x, t.y, t.z);
    if (!chestCells.has(k)) b.put.set(k, TORCH);
  }
  b.buildRing();
  // 横穴
  const sides = planSides(G, b, hubs, start, rng, F, site, chestCells);
  if (sides === null) return null;

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

  // 山
  let mound: Shaft['mound'] = null;
  const noTrees: [number, number, number, number][] = [];
  const noPlants: [number, number, number, number][] = [];
  if (site.mound) {
    const { x: mx, z: mz, tc } = site.mound;
    mound = { x: mx, z: mz, top: G.h(mx, mz) + tc, width: 2 * tc - 1 };
    for (let z = mz - tc; z <= mz + tc; z++) {
      for (let x = mx - tc; x <= mx + tc; x++) {
        const bump = moundBump(tc, Math.hypot(x - mx, z - mz));
        const h = G.h(x, z);
        for (let k = 1; k <= bump; k++) {
          const key = keyOf(x, h + k, z);
          if (!b.air.has(key) && !b.put.has(key)) b.put.set(key, STONE);
        }
      }
    }
    noPlants.push([mx - tc - S.mound.clear, mz - tc - S.mound.clear, mx + tc + S.mound.clear, mz + tc + S.mound.clear]);
    noTrees.push([mx - tc - 8, mz - tc - 8, mx + tc + 8, mz + tc + 8]);
  } else {
    noPlants.push([site.x - 3, site.z - 3, site.x + 3, site.z + 3]);
    noTrees.push([site.x - 6, site.z - 6, site.x + 6, site.z + 6]);
  }

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
  const m = S.boxMargin;
  const box = { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
  if (box.x1 - box.x0 + 1 > S.boxMax || box.z1 - box.z0 + 1 > S.boxMax) return null;
  if (!start) {
    const R = S.region;
    if (Math.floor(box.x0 / R) !== Math.floor(box.x1 / R) || Math.floor(box.z0 / R) !== Math.floor(box.z1 / R)) return null;
  }
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
  };
  return { shaft, path: b.path, b, noTrees, noPlants, cols };
}

function frameCell(b: ShaftBuilder, x: number, y: number, z: number): void {
  const k = keyOf(x, y, z);
  if (!b.air.has(k) && !b.put.has(k)) b.put.set(k, WAKU);
}

