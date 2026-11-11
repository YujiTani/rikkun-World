import { BLOCK_INDEX, BLOCK_TYPES } from '../blocks/blockTypes';
import { packOp } from './mineOpPack';
import { colKey } from '../stream/ring';
import { CAVE_CONFIG as C, type CaveKind } from './mineCaveConfig';
import type { LocalShape } from './mineCaveShape';
import { keyOf } from './mineShaftBuild';
import type { Geo } from './mineShaftSite';
import { Combined, FOUR, Grid, SIX, type Overlay } from './mineCaveGrid';
import { openingFronts, placeHiroiOres } from './mineHiroiRoom';
import { hash01, randInt, subSeed, type Rng } from './random';

/**
 * 部屋 1 つを ブロックの 地図に する（MINE-1D §4.7.2・§4.7.3）。部屋の まわり 1 マス（外がわ）は ぜんぶ こちらで 決める。
 * 自然の ほらあなと ふれる 穴は、歩いて 行き来 できる 物だけ のこし、ほかは 石で ふさぐ。床の 下 2 マスは かならず 固い。
 * 世界は 読まない（地形の 高さと 洞くつの 空気は 計算で 答える）。
 */

const STONE = BLOCK_INDEX.stone;
const TORCH = BLOCK_INDEX.torch;
const WATER = BLOCK_INDEX.water;
const TSURARA = BLOCK_INDEX.tsurara;
const SEKKAI = BLOCK_INDEX.sekkaiseki;
const NENDO = BLOCK_INDEX.nendo;
const HOTARU = BLOCK_INDEX.hotaruishi;
const SUISHO = BLOCK_INDEX.suisho_ore;
const COAL = BLOCK_INDEX.coal_ore;
const IRON = BLOCK_INDEX.iron_ore;
const ORES: ReadonlySet<number> = new Set([COAL, IRON, SUISHO]);

export interface RoomBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

/** 列に 置く 物（mineShafts.ts の ColOps と 同じ 並び。ring は 使わない） */
export interface RoomColOps {
  ring: Int32Array;
  air: Int32Array;
  put: Int32Array;
}

export interface RoomStats {
  wall: number;
  visible: Record<string, number>;
  tsurara: number;
  pondDepth: number;
  floor: number;
  holesUnder: number;
  openings: number;
  roofToGround: number;
  floorStep: number;
  floorOre: number;
  torches: number;
}

export interface BuiltRoom {
  kind: CaveKind;
  box: RoomBox;
  stats: RoomStats;
  /** 列ごとの 置く 物（colKey） */
  ops: Map<number, RoomColOps>;
  /** 部屋の 空気・水の マスか（caveAt 用） */
  has(x: number, y: number, z: number): boolean;
  /** ひろい ほらあなだけ: 残した 出口の 前 4 マスの 列（colId）。柱の 根もと・床の こぶを おかない 列 */
  fronts: Set<number>;
}

const pack = packOp;
const NAMES = BLOCK_TYPES.map((t) => t.id);

export interface BuildArgs {
  G: Geo;
  seed: number;
  kind: CaveKind;
  shape: LocalShape;
  /** 計画の 箱の 北西の すみの 下（世界の 座標。y は 箱の いちばん 下） */
  ox: number;
  oy: number;
  oz: number;
  rng: Rng;
  /** 坑道の へやだけ: 部屋の 外の 坑道 */
  over?: Overlay;
}

/** 部屋づくりの 前半（空気・かべ・穴の ふさぎ まで。かざり・数える・置く物は まだ）。場所を えらぶ ときは これで 穴の 数だけ 見る */
export interface RoomStage {
  readonly args: BuildArgs;
  readonly g: Grid;
  readonly W: Combined;
  readonly cells: number[];
  readonly coord: (i: number) => [number, number, number];
  /** のこした 穴の 数 */
  readonly openings: number;
  /** ひろい ほらあなだけ: 出口の 前 4 マスの 列（colId） */
  readonly fronts: Set<number>;
}

/** 短い 仕事ごとに yield する 仕事を 最後まで いっきに すすめて 結果を 返す */
export function drain<T>(job: Generator<void, T>): T {
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

/** 数 ms ごとに ひと休み する 間隔〔マスの 数。先読みが 時間で 止まれる ように〕 */
const SLICE = 600;

/** 部屋を 作る。まわりの 世界との 都合で 作れない（床の 下を かためられない など）ことは ないので、いつも 返す */
export function buildRoom(args: BuildArgs): BuiltRoom {
  return finishRoom(stageRoom(args));
}

function stageRoom(args: BuildArgs): RoomStage {
  return drain(stageRoomSteps(args));
}

/** 部屋づくりの 前半。短い 仕事ごとに yield する〔結果は stageRoom と 同じ〕 */
export function* stageRoomSteps(args: BuildArgs): Generator<void, RoomStage> {
  const { G, shape, ox, oy, oz } = args;
  const { sx, sy, sz, floorK, ceil, water } = shape;
  const g = new Grid(ox - 1, oy - 3, oz - 1, sx + 2, sy + 4, sz + 2);
  const W = new Combined(g, G, args.over);
  // 空気・水
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const c = ceil[z * sx + x]!;
      if (c === 0) continue;
      const w = water[z * sx + x]!;
      for (let k = floorK - w; k < floorK; k++) g.a[g.idx(ox + x, oy + k, oz + z)] = 2;
      for (let k = floorK + (shape.lift?.[z * sx + x] ?? 0); k < floorK + c; k++) g.a[g.idx(ox + x, oy + k, oz + z)] = 1;
    }
  }
  // 柱の 中など: 空気で ない マスは 自然の 穴が あっても 固い
  if (shape.force) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        if (!shape.force[z * sx + x]) continue;
        for (let k = floorK; k < floorK + sy; k++) {
          const j = g.idx(ox + x, oy + k, oz + z);
          if (!g.a[j] && W.natAir(ox + x, oy + k, oz + z)) g.b[j] = STONE;
        }
      }
    }
  }
  yield;
  const cells: number[] = [];
  for (let i = 0; i < g.a.length; i++) if (g.a[i]) cells.push(i);
  // 呼ぶ たびに 新しい 配列を 作らない（すぐ 取りだして 使う）
  const scratch: [number, number, number] = [0, 0, 0];
  const coord = (i: number): [number, number, number] => {
    const x = i % g.gx;
    const r = (i - x) / g.gx;
    const z = r % g.gz;
    scratch[0] = x + g.x0;
    scratch[1] = (r - z) / g.gz + g.y0;
    scratch[2] = z + g.z0;
    return scratch;
  };
  // 床の 下 2 マスは かならず 固い（空気や 水の すぐ 下が 岩の とき）。添字の 計算だけで 進める（毎回 座標の 配列を 作らない）
  const { gx, gz } = g;
  const layerN = gx * gz;
  let n = 0;
  for (const i of cells) {
    if (++n % (SLICE * 8) === 0) yield;
    if (g.a[i - layerN]) continue;
    g.s[i - layerN] = 1;
    g.b[i - layerN] = STONE;
    g.s[i - 2 * layerN] = Math.max(g.s[i - 2 * layerN]!, 2);
    g.b[i - 2 * layerN] = STONE;
  }
  // まわり 1 マス: 自然の 岩なら 石。自然の 空気は 穴（となりの 順は SIX と 同じ: +x −x +y −y +z −z）
  const holes: number[] = [];
  const near = [1, -1, layerN, -layerN, gx, -gx];
  n = 0;
  for (const i of cells) {
    if (++n % SLICE === 0) yield;
    const x = i % gx;
    const r = (i - x) / gx;
    const z = r % gz;
    const px = x + g.x0;
    const py = (r - z) / gz + g.y0;
    const pz = z + g.z0;
    for (let d = 0; d < 6; d++) {
      const j = i + near[d]!;
      if (g.a[j] || g.b[j]) {
        if (g.b[j] && !g.a[j]) g.s[j] = 1;
        continue;
      }
      g.s[j] = 1;
      const qx = d === 0 ? px + 1 : d === 1 ? px - 1 : px;
      const qy = d === 2 ? py + 1 : d === 3 ? py - 1 : py;
      const qz = d === 4 ? pz + 1 : d === 5 ? pz - 1 : pz;
      if (W.natAir(qx, qy, qz)) holes.push(j);
      else g.b[j] = STONE;
    }
  }
  yield;
  const openings = yield* sealHoles(g, W, holes, coord);
  yield;
  const fronts = shape.hiroi && openings > 0 ? openingFronts(g, W, cells, coord) : new Set<number>();
  return { args, g, W, cells, coord, openings, fronts };
}

/** 部屋づくりの 後半: かざり・数える・置く 物 */
function finishRoom(st: RoomStage): BuiltRoom {
  return drain(finishRoomSteps(st));
}

/** 部屋づくりの 後半。短い 仕事ごとに yield する */
export function* finishRoomSteps(st: RoomStage): Generator<void, BuiltRoom> {
  const { args, g, W, cells, coord } = st;
  const { G, seed, kind, shape, ox, oy, oz, rng } = args;
  const { sx, sy, sz } = shape;
  const stat: RoomStats = {
    wall: 0,
    visible: {},
    tsurara: 0,
    pondDepth: 0,
    floor: 0,
    holesUnder: 0,
    openings: 0,
    roofToGround: Infinity,
    floorStep: 0,
    floorOre: 0,
    torches: 0,
  };
  stat.openings = st.openings;
  decorate(g, kind, seed, ox, oy, oz, rng, coord, shape);
  yield;
  tallyStats(g, W, stat, G, coord, cells);
  yield;
  return { kind, fronts: st.fronts, box: { x0: ox, y0: oy, z0: oz, x1: ox + sx - 1, y1: oy + sy - 1, z1: oz + sz - 1 }, stats: stat, ops: opsOf(g, cells, coord), has: (x, y, z) => g.inside(x, y, z) && g.a[g.idx(x, y, z)]! > 0 };
}

/** 穴を 分ける: 歩いて 行き来 できて 外を 4 歩 すすめる 物は のこし、ほかは 石で ふさぐ。のこした 数を 返す */
function* sealHoles(g: Grid, W: Combined, holes: number[], coord: (i: number) => [number, number, number]): Generator<void, number> {
  // 穴・見たか は 地図の 添字で 印を つける（Map・Set を 使わない）
  const isHole = new Uint8Array(g.a.length);
  for (const i of holes) isHole[i] = 1;
  const seen = new Uint8Array(g.a.length);
  const { gx, gy, gz } = g;
  const layerN = gx * gz;
  let openings = 0;
  const comps: number[][] = [];
  for (const h of holes) {
    if (seen[h]) continue;
    const comp: number[] = [];
    const stack = [h];
    seen[h] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % gx;
      const r = (i - x) / gx;
      const z = r % gz;
      const y = (r - z) / gz;
      // となりの 順は SIX と 同じ（+x −x +y −y +z −z）。地図の 外は 見ない
      for (let d = 0; d < 6; d++) {
        if (d === 0 ? x + 1 >= gx : d === 1 ? x < 1 : d === 2 ? y + 1 >= gy : d === 3 ? y < 1 : d === 4 ? z + 1 >= gz : z < 1) continue;
        const j = i + (d === 0 ? 1 : d === 1 ? -1 : d === 2 ? layerN : d === 3 ? -layerN : d === 4 ? gx : -gx);
        if (isHole[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    comps.push(comp);
  }
  // 歩ける 穴だけ のこす。ふさぐと 別の 穴の 外の 道が 切れる ことが あるので、変わらなく なるまで くりかえす
  let live = comps;
  for (;;) {
    const dead = new Set<number>(); // 歩いても 外へ 出られない つながり（同じ つながりの 別の マスは しらべ なおさない）
    const bad: number[][] = [];
    for (const comp of live) {
      if (!comp.some((i) => walkable(W, dead, ...coord(i)))) bad.push(comp);
      yield;
    }
    if (bad.length === 0) break;
    for (const comp of bad) for (const i of comp) g.b[i] = STONE;
    live = live.filter((c) => !bad.includes(c));
  }
  openings = live.length;
  return openings;
}

/** 穴の マス p が 部屋の 床と 行き来 できて、外を 4 歩 すすめるか */
function walkable(W: Combined, dead: Set<number>, x: number, y: number, z: number): boolean {
  if (!W.standable(x, y, z) || dead.has(keyOf(x, y, z))) return false;
  let linked = false;
  for (const [dx, dz] of FOUR) {
    const r = W.step(x, y, z, dx, dz);
    if (!r || !W.isRoomAir(r.x, r.y, r.z)) continue;
    const back = W.step(r.x, r.y, r.z, -dx, -dz);
    if (back && back.x === x && back.y === y && back.z === z) linked = true;
  }
  if (!linked) return false;
  // 部屋の 外の 立てる マスを たどる（行き来 できる つながりだけ）。部屋の 床に ふれる マスが 出口。出口から 4 歩 すすめるか
  type P = { x: number; y: number; z: number };
  const nodes = new Map<number, P>([[keyOf(x, y, z), { x, y, z }]]);
  const adj = new Map<number, number[]>();
  let frontier: P[] = [{ x, y, z }];
  while (frontier.length > 0 && nodes.size < C.walkLimit) {
    const next: P[] = [];
    for (const a of frontier) {
      const ka = keyOf(a.x, a.y, a.z);
      for (const [dx, dz] of FOUR) {
        const n = W.step(a.x, a.y, a.z, dx, dz);
        if (!n || W.isRoomAir(n.x, n.y, n.z)) continue;
        const back = W.step(n.x, n.y, n.z, -dx, -dz);
        if (!back || back.x !== a.x || back.y !== a.y || back.z !== a.z) continue;
        const k = keyOf(n.x, n.y, n.z);
        (adj.get(ka) ?? adj.set(ka, []).get(ka)!).push(k);
        if (nodes.has(k)) continue;
        nodes.set(k, n);
        next.push(n);
      }
    }
    frontier = next;
  }
  const dist = new Map<number, number>();
  let cur: number[] = [];
  for (const [k, n] of nodes) {
    if (FOUR.some(([dx, dz]) => {
      const r = W.step(n.x, n.y, n.z, dx, dz);
      return r !== null && W.isRoomAir(r.x, r.y, r.z);
    })) {
      dist.set(k, 0);
      cur.push(k);
    }
  }
  for (let d = 0; cur.length > 0; d++) {
    if (d >= C.exitOutside) return true;
    const next: number[] = [];
    for (const k of cur) for (const m of adj.get(k) ?? []) if (!dist.has(m)) (dist.set(m, d + 1), next.push(m));
    cur = next;
  }
  for (const k of nodes.keys()) dead.add(k);
  return false;
}

/** かべの 中身: 種類ごとの 石・鉱石・つらら */
function decorate(g: Grid, kind: CaveKind, seed: number, ox: number, oy: number, oz: number, rng: Rng, coord: (i: number) => [number, number, number], shape: LocalShape): void {
  const salt = subSeed(seed, 941);
  const shell: number[] = [];
  const airNear = (x: number, y: number, z: number, upOrSide: boolean): boolean => {
    for (const [dx, dy, dz] of SIX) {
      if (upOrSide && dy > 0) continue; // 空気が 石の 下か 横に ある（床は のぞく）
      if (g.inside(x + dx, y + dy, z + dz) && g.a[g.idx(x + dx, y + dy, z + dz)]) return true;
    }
    return false;
  };
  for (let i = 0; i < g.b.length; i++) if (g.s[i] === 1 && g.b[i] === STONE) shell.push(i);
  const pick = (n: number, ok: (i: number) => boolean): number[] => {
    const pool = shell.filter(ok);
    const out: number[] = [];
    while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
    return out;
  };
  switch (kind) {
    case 'hotaru': {
      const [lo, hi] = C.rules.hotaru.visible;
      for (const i of pick(randInt(rng, lo, hi - 2), () => true)) g.b[i] = HOTARU;
      break;
    }
    case 'suisho': {
      const [lo, hi] = C.rules.suisho.visible;
      for (const i of pick(randInt(rng, lo, hi - 2), () => true)) g.b[i] = SUISHO;
      break;
    }
    case 'chiteiko': {
      for (const i of shell) {
        const [x, y, z] = coord(i);
        if (SIX.some(([dx, dy, dz]) => g.inside(x + dx, y + dy, z + dz) && g.a[g.idx(x + dx, y + dy, z + dz)] === 2)) g.b[i] = NENDO;
      }
      break;
    }
    case 'shonyudo': {
      for (const i of shell) {
        const [x, y, z] = coord(i);
        if (airNear(x, y, z, true) && hash01(salt, x, y, z) < C.sekkaisekiShare) g.b[i] = SEKKAI;
      }
      // つらら: 天井の いちばん 上の 空気に（上が 固い 列）
      const cand: number[] = [];
      for (let i = 0; i < g.a.length; i++) {
        if (g.a[i] !== 1) continue;
        const [x, y, z] = coord(i);
        const up = g.idx(x, y + 1, z);
        if (!g.a[up] && g.b[up] && g.b[up] !== TORCH) cand.push(i);
      }
      const n = randInt(rng, C.tsuraraCount[0], C.tsuraraCount[1]);
      for (let t = 0; t < n && cand.length > 0; t++) {
        const i = cand.splice(Math.floor(rng() * cand.length), 1)[0]!;
        const [x, y, z] = coord(i);
        g.b[i] = TSURARA;
        g.b[g.idx(x, y + 1, z)] = SEKKAI;
      }
      break;
    }
    case 'hiroi':
      placeHiroiOres(g, shell, coord, ox, oy, oz, shape, seed);
      break;
    default: {
      const never: never = kind;
      throw new Error(`知らない 種類 ${String(never)}`);
    }
  }
}

function tallyStats(g: Grid, W: Combined, st: RoomStats, G: Geo, coord: (i: number) => [number, number, number], cells: number[]): void {
  for (const i of cells) {
    const [x, y, z] = coord(i);
    if (g.a[i] === 2) continue;
    if (g.b[i] === TSURARA) st.tsurara++;
    if (g.b[i] === TORCH) st.torches++;
    if (W.standable(x, y, z)) {
      st.floor++;
      if (ORES.has(g.b[g.idx(x, y - 1, z)]!)) st.floorOre++;
    }
  }
  // 池の ふかさ・天井から 地面
  const waterCols = new Map<number, number>();
  for (const i of cells) if (g.a[i] === 2) {
    const [x, , z] = coord(i);
    waterCols.set(x * 100003 + z, (waterCols.get(x * 100003 + z) ?? 0) + 1);
  }
  for (const n of waterCols.values()) st.pondDepth = Math.max(st.pondDepth, n);
  for (const i of cells) {
    const [x, y, z] = coord(i);
    if (g.a[g.idx(x, y + 1, z)]) continue;
    st.roofToGround = Math.min(st.roofToGround, G.h(x, z) - (y + 1));
  }
  // 床の 段差（4 方向の となりの 立てる マスとの 差。池の 岸〜水は のぞく）
  const foots = new Map<number, { x: number; z: number; ys: number[] }>();
  for (const i of cells) {
    if (g.a[i] !== 1) continue;
    const [x, y, z] = coord(i);
    if (!W.standable(x, y, z)) continue;
    const k = x * 100003 + z;
    (foots.get(k) ?? foots.set(k, { x, z, ys: [] }).get(k)!).ys.push(y);
  }
  for (const f of foots.values()) {
    for (const [dx, dz] of FOUR) {
      const nb = foots.get((f.x + dx) * 100003 + (f.z + dz));
      if (!nb) continue;
      for (const y of f.ys) st.floorStep = Math.max(st.floorStep, Math.min(...nb.ys.map((v) => Math.abs(v - y))));
    }
  }
  // かべ・見える 物
  for (let i = 0; i < g.s.length; i++) {
    if (g.s[i] !== 1 || !g.b[i]) continue;
    if (g.b[i] === STONE) st.wall++;
    else {
      const id = NAMES[g.b[i]!]!;
      st.visible[id] = (st.visible[id] ?? 0) + 1;
    }
  }
}

function opsOf(g: Grid, cells: number[], coord: (i: number) => [number, number, number]): Map<number, RoomColOps> {
  const lists = new Map<number, { ring: number[]; air: number[]; put: number[] }>();
  const slot = (x: number, z: number): { ring: number[]; air: number[]; put: number[] } => {
    const k = colKey(x >> 4, z >> 4);
    let l = lists.get(k);
    if (!l) lists.set(k, (l = { ring: [], air: [], put: [] }));
    return l;
  };
  for (const i of cells) {
    const [x, y, z] = coord(i);
    const l = slot(x, z);
    if (g.a[i] === 2) l.put.push(pack(WATER, y, z & 15, x & 15));
    else if (g.b[i]) l.put.push(pack(g.b[i]!, y, z & 15, x & 15));
    else l.air.push(pack(BLOCK_INDEX.air, y, z & 15, x & 15));
  }
  for (let i = 0; i < g.b.length; i++) {
    if (!g.b[i] || g.a[i]) continue;
    const [x, y, z] = coord(i);
    slot(x, z).put.push(pack(g.b[i]!, y, z & 15, x & 15));
  }
  const out = new Map<number, RoomColOps>();
  for (const [k, l] of lists) out.set(k, { ring: Int32Array.from(l.ring), air: Int32Array.from(l.air), put: Int32Array.from(l.put) });
  return out;
}
