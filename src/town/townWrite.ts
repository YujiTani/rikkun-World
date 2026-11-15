import { CHUNK_SIZE, SEA_Y, WORLD_HEIGHT, type BlockArray } from '../contracts';
import { BLOCK_INDEX } from '../world/blocks/blockTypes';
import { TREE_MAX_EXTENT } from '../world/gen/treeV2';
import { writeShapedTrees } from '../world/gen/treeShapes';
import { LAYER } from '../world/gen/columnLayout';
import { townBuildingColumns } from './townBuildings';
import { CANAL, SURF, at } from './townLayout';
import type { TownPlan } from './townPlan';
import type { TownTree } from './townTrees';
import { TOWN } from './townTuning';

/**
 * TOWN-1 1B-1: 街の ブロックを 列（16×高さ×16）に 書く。`generateChunk` の さいごに 1 回 よぶ（街の はんいと すその 列だけ）。
 * 地面を 街の 高さに ならし（けずる・うめる）、用水路・石段・橋・てすり・石どうろうを 書く。同じ 記録なら いつも 同じ 中身。
 */

const AIR = BLOCK_INDEX.air;
const DIRT = BLOCK_INDEX.dirt;
const GRASS = BLOCK_INDEX.grass;
const STONE = BLOCK_INDEX.stone;
const WATER = BLOCK_INDEX.water;
const PAVE = [BLOCK_INDEX.town_ishidatami_a, BLOCK_INDEX.town_ishidatami_b, BLOCK_INDEX.town_ishidatami_c] as const;
const ISHIZUMI = BLOCK_INDEX.town_ishizumi;
const WALL_MIX = [BLOCK_INDEX.town_ishizumi, BLOCK_INDEX.town_ishizumi, BLOCK_INDEX.town_koishizumi, BLOCK_INDEX.town_kokeishi] as const;
const ISHIDAN = BLOCK_INDEX.town_ishidan;
const ANDON = BLOCK_INDEX.town_andon;
const SHUBASHIRA = BLOCK_INDEX.town_shubashira;
const TESURI = BLOCK_INDEX.town_ishi_tesuri;
const START_TORCH = BLOCK_INDEX.start_torch;
const SAKURA = BLOCK_INDEX.town_sakura;
const LEAF_OF = { leaves: BLOCK_INDEX.leaves, momiji_leaves: BLOCK_INDEX.momiji_leaves, matsu_leaves: BLOCK_INDEX.matsu_leaves } as const;

/** 街の 地面の 下の どこまで 書き直すか（地面から マス。それより 下は 元の まま） */
const REWRITE_DEPTH = 10;
/** 地面の すぐ 下の つちの 層（マス） */
const DIRT_LAYERS = 2;
/** 石どうろうの 高さ（ブロック。台・はしら・あかり・かさ） */
const TORO = [ISHIZUMI, ISHIZUMI, ANDON, ISHIZUMI] as const;
/** あきちの 四すみの くい（木の はしら 2 こ ぶん） */
const LOT_POST = [BLOCK_INDEX.town_hashira, BLOCK_INDEX.town_hashira] as const;
/** 石段の 口の あかりの 高さ（台・はしら・あかり） */
const STAIR_LIGHT = [ISHIZUMI, ISHIZUMI, ANDON] as const;
/** 石段の 口の のぼりの 高さ（赤い はしら） */
const BANNER_H = 3;

/** 建物・ふんすいの ブロックを 世界の 番号に した 表（街ごと 1 回）。向きの 印（@u+ など）は 街の 向きで 4 向き・2 向きから えらぶ */
const buildingCache = new WeakMap<TownPlan, ReadonlyMap<number, readonly { dy: number; b: number }[]>>();
function compassOf(plan: TownPlan, u: number, v: number, du: number, dv: number): 'n' | 'e' | 's' | 'w' {
  const a = plan.toWorld(u, v);
  const w = plan.toWorld(u + du, v + dv);
  return w.x > a.x ? 'e' : w.x < a.x ? 'w' : w.z > a.z ? 's' : 'n';
}
function resolveBuildingId(plan: TownPlan, u: number, v: number, id: string): number {
  const m = /^(.*)@([uv])([+-])?$/.exec(id);
  if (m === null) return BLOCK_INDEX[id as keyof typeof BLOCK_INDEX]!;
  const axisU = m[2] === 'u';
  if (m[3] === undefined) {
    const d = compassOf(plan, u, v, axisU ? 1 : 0, axisU ? 0 : 1);
    return BLOCK_INDEX[`${m[1]}_${d === 'e' || d === 'w' ? 'x' : 'z'}` as keyof typeof BLOCK_INDEX]!;
  }
  const sign = m[3] === '+' ? 1 : -1;
  return BLOCK_INDEX[`${m[1]}_${compassOf(plan, u, v, axisU ? sign : 0, axisU ? 0 : sign)}` as keyof typeof BLOCK_INDEX]!;
}
function buildingsFor(plan: TownPlan): ReadonlyMap<number, readonly { dy: number; b: number }[]> {
  let m = buildingCache.get(plan);
  if (!m) {
    const out = new Map<number, { dy: number; b: number }[]>();
    for (const [k, list] of townBuildingColumns()) {
      const u = k % TOWN.size;
      const v = Math.floor(k / TOWN.size);
      out.set(k, list.map((c) => ({ dy: c.dy, b: resolveBuildingId(plan, u, v, c.id) })));
    }
    buildingCache.set(plan, (m = out));
  }
  return m;
}

const hash2 = (a: number, b: number): number => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0;

/** 列の (lx, lz) の y から 上を ぜんぶ 空気に する（from を ふくむ） */
function clearAbove(out: BlockArray, lx: number, lz: number, from: number): void {
  const base = lz * CHUNK_SIZE + lx;
  for (let y = Math.max(1, from); y < WORLD_HEIGHT; y++) out[y * LAYER + base] = AIR;
}

function put(out: BlockArray, lx: number, lz: number, y: number, b: number): void {
  if (y >= 1 && y < WORLD_HEIGHT) out[y * LAYER + lz * CHUNK_SIZE + lx] = b;
}

/** 街の 1 マスを 書く（街の はんいの 中） */
function writeCell(out: BlockArray, lx: number, lz: number, wx: number, wz: number, u: number, v: number, plan: TownPlan): void {
  const L = plan.layout;
  const G = plan.rec.groundY;
  const k = at(u, v);
  const canal = L.canal[k]!;
  const lo = Math.max(1, G - REWRITE_DEPTH);
  if (canal !== CANAL.none) {
    // 用水路の 底: 水の マスは 底を 1 つ ほって 水 1 マス。通り道は 石（いしだん）の 床。上は ぜんぶ 空気
    const floorY = canal === CANAL.water ? G - TOWN.canal.depth - 1 : G - TOWN.canal.depth;
    for (let y = lo; y < floorY; y++) put(out, lx, lz, y, STONE);
    put(out, lx, lz, floorY, canal === CANAL.water ? ISHIZUMI : ISHIDAN);
    clearAbove(out, lx, lz, floorY + 1);
    if (canal === CANAL.water) put(out, lx, lz, floorY + 1, WATER);
    if (L.bridge[k]) put(out, lx, lz, G, ISHIDAN);
    // たいこ橋など: 橋の 上に もり上げる ブロックと、橋の わきの 用水路の 上の らんかん（1B-2。表は townGate.ts）
    const bl = buildingsFor(plan).get(k);
    if (bl) for (const c of bl) put(out, lx, lz, G + 1 + c.dy, c.b);
    return;
  }
  const surf = L.surf[k]!;
  const notch = L.notch[k]!;
  const topY = notch > 0 ? G - TOWN.canal.depth + notch : surf === SURF.terrace ? G + TOWN.terrace.rise : G;
  const wall = L.wall[k]! === 1 || notch > 0;
  for (let y = lo; y <= topY; y++) {
    let b: number;
    if (wall && y < topY) b = WALL_MIX[hash2(wx * 31 + y, wz) % WALL_MIX.length]!;
    else if (y < topY - DIRT_LAYERS) b = STONE;
    else if (y < topY) b = DIRT;
    else if (notch > 0) b = ISHIDAN;
    else if (surf === SURF.ground || surf === SURF.terrace) b = GRASS; // 地面の いちばん 上は 草（見本）
    else if (surf === SURF.lot) b = DIRT;
    else b = PAVE[surf - SURF.paveA]!;
    put(out, lx, lz, y, b);
  }
  clearAbove(out, lx, lz, topY + 1);
  // てすり（用水路の ふち。ひくい 石の 箱）
  if (L.rail[k]) put(out, lx, lz, topY + 1, TESURI);
  // 石どうろう（ふち）・石段の 口の あかりと のぼり
  if (plan.toroAt.has(k)) TORO.forEach((b, i) => put(out, lx, lz, topY + 1 + i, b));
  if (plan.lotPostAt.has(k)) for (let i = 0; i < LOT_POST.length; i++) put(out, lx, lz, topY + 1 + i, LOT_POST[i]!);
  const st = plan.stairTopAt.get(k);
  if (st === 'light') STAIR_LIGHT.forEach((b, i) => put(out, lx, lz, topY + 1 + i, b));
  else if (st === 'banner') for (let i = 0; i < BANNER_H; i++) put(out, lx, lz, topY + 1 + i, SHUBASHIRA);
  // 建物・ふんすい（1B-2。置き方の 表は townBuildings.ts）
  const bl = buildingsFor(plan).get(k);
  if (bl) for (const c of bl) put(out, lx, lz, topY + 1 + c.dy, c.b);
}

/** 街の すそ（はんいの 外 skirt マス）: 地面を なだらかに つなぐ */
function writeSkirt(out: BlockArray, lx: number, lz: number, wx: number, wz: number, natural: number, plan: TownPlan): void {
  const h = plan.skirtHeight(natural, wx, wz);
  if (h === natural) return;
  const lo = Math.max(1, Math.min(h, natural) - 3);
  for (let y = lo; y <= h; y++) put(out, lx, lz, y, y === h ? GRASS : y >= h - DIRT_LAYERS ? DIRT : STONE);
  clearAbove(out, lx, lz, h + 1);
  // 海の 高さより 下に さげた 所は 海の 水を もどす（海に 穴を あけない）
  for (let y = h + 1; y <= SEA_Y; y++) put(out, lx, lz, y, WATER);
}

/** 門から スタートまでの 見通しの みち: 地面の 上の 木・岩を 消す（地面は かえない） */
function clearCorridor(out: BlockArray, lx: number, lz: number, natural: number): void {
  const base = lz * CHUNK_SIZE + lx;
  for (let y = natural + 1; y < WORLD_HEIGHT; y++) {
    if (out[y * LAYER + base] !== START_TORCH) out[y * LAYER + base] = AIR;
  }
}

/**
 * 列 (cx, cz) に 街を 書く。`naturalAt(x, z)` は 生成した 地形の 高さ（すそ・見通しの みち用）。
 * 街・すそ・見通しの みちに かからない 列は 何も しない（すぐ もどる）。
 */
export function writeTown(out: BlockArray, cx: number, cz: number, plan: TownPlan, naturalAt: (x: number, z: number) => number): void {
  if (!plan.touchesChunk(cx, cz)) return;
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = x0 + lx;
      const wz = z0 + lz;
      const p = plan.toLocal(wx, wz);
      if (p !== null) writeCell(out, lx, lz, wx, wz, p.u, p.v, plan);
      else {
        const skirt = plan.inSkirt(wx, wz);
        const natural = naturalAt(wx, wz);
        if (skirt) writeSkirt(out, lx, lz, wx, wz, natural, plan);
        // すそでも 見通しの みちの 木は 消す（すその 高さの 上）
        if (plan.inCorridor(wx, wz)) clearCorridor(out, lx, lz, skirt ? Math.max(natural, plan.skirtHeight(natural, wx, wz)) : natural);
      }
    }
  }
  // 街の 木（1B-2）。この 列に かかる 木だけ。はっぱは 空気の 所 だけ（置き場所の 時に 建物・道に かからない ことを 確かめて ある）
  const m = TREE_MAX_EXTENT;
  const near = plan.trees().filter((t) => t.x >= x0 - m && t.x < x0 + CHUNK_SIZE + m && t.z >= z0 - m && t.z < z0 + CHUNK_SIZE + m);
  if (near.length > 0) writeShapedTrees(out, near, x0, z0, (t) => ((t as TownTree).sakura ? SAKURA : LEAF_OF[t.leaves]));
}
