import { SEA_Y, WORLD_HEIGHT } from '../../contracts';
import { MAX_BLOCK_KINDS } from '../blocks/maxBlockKinds';
import type { BlockArray } from '../../contracts';
import { GEN_CONFIG as C } from './config';
import { mouthAirRange, mouthsNear } from './mouths';
import { terrainFor, type Terrain } from './terrain';
import { floraOfChunk } from './flora';
import { plantsOfChunk } from './plants';
import { treesInRect, type Tree } from './trees';
import { TREES_V2, TREE_MAX_EXTENT } from './treeV2';
import { writeShapedTrees, type ShapedTree } from './treeShapes';
import { fallColumn } from './liquidPonds';
import { BLOCK_INDEX, BLOCK_TYPES, isLeafIndex } from '../blocks/blockTypes';
import { buildBlocks } from './chunk';
import { COL_VOLUME, LAYER } from './columnLayout';
import { plainShaftWorld, type ShaftWorld } from './mineShafts';
import { COUNTRY_PLANT_IDS } from '../blocks/countryPlants';
import { columnKey, featuresNearChunk } from './countryFeatureBlocks';

/**
 * ブロックを読みこまずに出す「地面・木・たいまつ」の答え（VOX-D G2）。
 * 高さ（terrainFor(seed).height）・木（treesInRect）・洞くつの口・たいまつの場所から、generateChunk で作る列と同じ答えを出す。
 * ふるい畑・やせいの やさい の置き場所を、列を読みこまずに決めるために使う。
 */

export type VBlock = 'air' | 'water' | 'solid' | 'log' | 'leaves' | 'torch' | 'plant';

export interface Surface {
  /** 地面（き・はっぱ・みず・たいまつを のぞく いちばん上のブロック）の y */
  ground(x: number, z: number): number;
  /** 地面のブロックが くさ か */
  groundIsGrass(x: number, z: number): boolean;
  /** 地面の上に なにか（木・たいまつ）が あるか */
  covered(x: number, z: number): boolean;
  /** その列の いちばん上のブロックが 木（みき・はっぱ）か */
  treeCover(x: number, z: number): boolean;
  /** そのマスのブロックの種類 */
  blockAt(x: number, y: number, z: number): VBlock;
}

const AIR_Y = WORLD_HEIGHT;

/** ブロック番号 → 種類（坑道が かかる 列を 本当の 列から 読む とき）。0 空気 / 1 水・マグマ / 2 き / 3 はっぱ / 4 たいまつ / 5 はな・たけ / 6 くさ・のばな〔flora〕/ 7 固い */
const K_AIR = 0;
const K_LOG = 2;
const K_LEAVES = 3;
const K_FLORA = 6;
const K_SOLID = 7;
const KIND_OF = new Uint8Array(MAX_BLOCK_KINDS).fill(K_SOLID);
/** 種類ごとの ブロック id（水の 量ちがいは 名前の 形で 見分ける） */
const KIND_IDS: readonly (readonly string[])[] = [['air'], ['magma'], ['log'], [], ['start_torch'], ['flower_y', 'flower_o', 'flower_p', 'susuki', 'bamboo', ...COUNTRY_PLANT_IDS], ['nobana', 'kusa']];
KIND_IDS.forEach((ids, k) => {
  for (const id of ids) KIND_OF[BLOCK_INDEX[id as keyof typeof BLOCK_INDEX]!] = k;
});
for (let i = 0; i < BLOCK_TYPES.length; i++) {
  if (/^water(_\d)?$/.test(BLOCK_TYPES[i]!.id)) KIND_OF[i] = 1;
  else if (isLeafIndex(i)) KIND_OF[i] = K_LEAVES;
  else if (KIND_OF[i] === K_SOLID && !BLOCK_TYPES[i]!.solid) KIND_OF[i] = K_AIR; // 表に ない かたくない ブロック〔坑道の たいまつ など〕は 空気あつかい
}
const VBLOCK: readonly VBlock[] = ['air', 'water', 'log', 'leaves', 'torch', 'plant', 'plant', 'solid'];

class SurfaceImpl implements Surface {
  private readonly T: Terrain;
  private readonly torch: { x: number; y: number; z: number };
  private readonly treeCache = new Map<number, Tree[]>();
  /** 木 v2: 列ごとに 形つきの 木を 書いた 見本（地面より 下は 石で うめて ある = 根が 浮かない 決まりも 本当の 列と 同じ） */
  private readonly shapedCols = new Map<number, BlockArray>();
  private readonly plantCache = new Map<number, Map<number, number>>();
  /** 坑道が かかる 列の ブロック（本当の 列。かからない 列は null） */
  private readonly shaftCols = new Map<number, BlockArray | null>();
  private readonly seed: number;

  /** flora = false: くさ・のばな を 数えない（ふるい はたけ・やせいの やさい の 場所を 決めるときの 答え。くさ・のばな は その場所を よけるので 循環しない） */
  constructor(seed: number, private readonly flora: boolean, private readonly shafts: ShaftWorld) {
    this.seed = seed;
    this.T = terrainFor(seed);
    const sp = this.T.spawn();
    this.torch = { x: sp.x + C.startTorch.dx, y: sp.h + 1, z: sp.z + C.startTorch.dz };
  }

  /** (x, z) のまわり 2 マスにある木（みきの列）。列ごとに覚える */
  private treesNear(x: number, z: number): Tree[] {
    const k = (x >> 3) * 1000003 + (z >> 3);
    let t = this.treeCache.get(k);
    if (t === undefined) {
      // 8×8 の区画ごとに、そのまわり 2 マスをふくめて集める
      const x0 = (x >> 3) * 8;
      const z0 = (z >> 3) * 8;
      t = treesInRect(this.T, x0 - 5, z0 - 5, x0 + 12, z0 + 12);
      // 坑道の 木を おかない 四角（列を 作る ときと 同じ）
      const zone = this.shafts.zones(x >> 4, z >> 4);
      const feat = featuresNearChunk(this.seed, (x >> 4) * 16, (z >> 4) * 16); // 国だけの物（VOX-I-4a）が どける 木
      const rects = [...(zone?.trees ?? []), ...feat.trees];
      if (rects.length > 0) t = t.filter((tr) => !rects.some((r) => tr.x >= r[0] && tr.x <= r[2] && tr.z >= r[1] && tr.z <= r[3]));
      if (this.treeCache.size > 4000) this.treeCache.clear();
      this.treeCache.set(k, t);
    }
    return t;
  }

  /** (x, z) の はな・すすき・たけ・くさ・のばな の高さ（なければ 0）。列（16×16）ごとに覚える */
  private plantHeight(x: number, z: number): number {
    const cx = x >> 4;
    const cz = z >> 4;
    const k = cx * 1000003 + cz;
    let m = this.plantCache.get(k);
    if (m === undefined) {
      m = new Map();
      const zone = this.shafts.zones(cx, cz);
      const feat = featuresNearChunk(this.seed, cx * 16, cz * 16);
      const rects = [...(zone?.plants ?? []), ...feat.plants];
      const skip = (p: { x: number; z: number }): boolean => rects.some((r) => p.x >= r[0] && p.x <= r[2] && p.z >= r[1] && p.z <= r[3]);
      for (const p of plantsOfChunk(this.T, cx, cz)) if (!skip(p)) m.set(p.x * 100003 + p.z, p.height);
      if (this.flora) for (const p of floraOfChunk(this.T, cx, cz)) if (!skip(p)) m.set(p.x * 100003 + p.z, p.height);
      for (const [k2, hgt] of feat.plantHeight) m.set(k2, hgt); // 国だけの物の 小さな 板・やせいの やさい
      if (this.plantCache.size > 400) this.plantCache.clear();
      this.plantCache.set(k, m);
    }
    return m.get(x * 100003 + z) ?? 0;
  }

  /** 口が空気にする y のはんい（なければ null） */
  private mouthRange(x: number, z: number): [number, number] | null {
    for (const m of mouthsNear(this.T, x >> 4, z >> 4)) {
      const r = mouthAirRange(m, x, z);
      if (r !== null) return r;
    }
    return null;
  }

  /** 坑道が かかる 列なら 本当の 列の ブロック（かからなければ null） */
  private shaftCol(x: number, z: number): BlockArray | null {
    const cx = x >> 4;
    const cz = z >> 4;
    const k = cx * 1000003 + cz;
    let b = this.shaftCols.get(k);
    if (b === undefined) {
      b = this.shafts.opsFor(cx, cz) ? Uint16Array.from(buildBlocks(this.seed, cx, cz, undefined, this.shafts.oldCols).blocks.subarray(0, COL_VOLUME)) : null;
      if (this.shaftCols.size > 64) this.shaftCols.clear();
      this.shaftCols.set(k, b);
    }
    return b;
  }

  /** 本当の 列の (x, y, z) の 種類 */
  private kindIn(b: BlockArray, x: number, y: number, z: number): number {
    const kind = KIND_OF[b[y * LAYER + (z & 15) * 16 + (x & 15)]!]!;
    return kind === K_FLORA && !this.flora ? K_AIR : kind;
  }

  /** 本当の 列で いちばん 上の 固い ブロックの y */
  private solidTop(b: BlockArray, x: number, z: number): number {
    for (let y = AIR_Y - 1; y > 0; y--) if (this.kindIn(b, x, y, z) === K_SOLID) return y;
    return 0;
  }

  ground(x: number, z: number): number {
    const sc = this.shaftCol(x, z);
    if (sc) return this.solidTop(sc, x, z);
    const fc = fallColumn(this.T.liquid, x, z);
    if (fc?.kind === 'pillar') return fc.pond.fall!.top; // MAGMA-SPAWN: 滝の はしらの 上の わきどころ
    const fg = featuresNearChunk(this.seed, (x >> 4) * 16, (z >> 4) * 16).ground.get(columnKey(x, z)); // 国だけの物: はたけあと（つち）・つきみの いわ（いし）
    if (fg !== undefined) return fg;
    const h = this.T.height(x, z);
    const r = this.mouthRange(x, z);
    if (r !== null && r[1] >= h) return r[0] - 1; // さか道の口: 床の下の いし
    return h;
  }

  groundIsGrass(x: number, z: number): boolean {
    const sc = this.shaftCol(x, z);
    if (sc) return sc[this.solidTop(sc, x, z) * LAYER + (z & 15) * 16 + (x & 15)] === BLOCK_INDEX.grass;
    if (featuresNearChunk(this.seed, (x >> 4) * 16, (z >> 4) * 16).ground.has(columnKey(x, z))) return false; // つち・いし
    const h = this.T.height(x, z);
    const r = this.mouthRange(x, z);
    // さか道の床は もとの地層の途中（床が 地面の高さのままなら くさ）
    if (r !== null && r[1] >= h && r[0] - 1 !== h) return false;
    if (this.T.inRock(x, z)) return false;
    return h >= SEA_Y + C.strata.landFrom && this.T.topBlock(x, z, h) === 'grass';
  }

  /** 木 v2 の 列の 見本（chunk.ts の placeTrees と 同じ 木・同じ どける 四角・同じ 書き方） */
  private shapedCol(cx: number, cz: number): BlockArray {
    const k = cx * 1000003 + cz;
    let a = this.shapedCols.get(k);
    if (a === undefined) {
      const x0 = cx * 16;
      const z0 = cz * 16;
      const m = TREE_MAX_EXTENT;
      const zone = this.shafts.zones(cx, cz);
      const feat = featuresNearChunk(this.seed, x0, z0);
      const rects = [...(zone?.trees ?? []), ...feat.trees];
      let trees = treesInRect(this.T, x0 - m, z0 - m, x0 + 16 + m - 1, z0 + 16 + m - 1);
      if (rects.length > 0) trees = trees.filter((tr) => !rects.some((r) => tr.x >= r[0] && tr.x <= r[2] && tr.z >= r[1] && tr.z <= r[3]));
      a = new Uint16Array(COL_VOLUME);
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = 1, h = this.T.height(x0 + x, z0 + z); y <= h && y < AIR_Y; y++) a[y * LAYER + z * 16 + x] = BLOCK_INDEX.stone;
      writeShapedTrees(a, trees as ShapedTree[], x0, z0, (t) => BLOCK_INDEX[t.leaves]);
      if (this.shapedCols.size > 64) this.shapedCols.clear();
      this.shapedCols.set(k, a);
    }
    return a;
  }

  /** その列に 木のブロックが あるか（みきが先、はっぱは あと。chunk.ts の placeTrees と同じ形） */
  private treeBlock(x: number, y: number, z: number): 'log' | 'leaves' | null {
    if (TREES_V2) {
      const b = this.shapedCol(x >> 4, z >> 4)[y * LAYER + (z & 15) * 16 + (x & 15)]!;
      return b === BLOCK_INDEX.log ? 'log' : isLeafIndex(b) ? 'leaves' : null;
    }
    const trees = this.treesNear(x, z);
    for (const t of trees) {
      const w = t.big ? 2 : 1;
      const dx = x - t.x;
      const dz = z - t.z;
      if (dx >= 0 && dx < w && dz >= 0 && dz < w && y > t.y && y <= t.y + t.trunk) return 'log';
    }
    for (const t of trees) {
      const dx = x - t.x;
      const dz = z - t.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const top = t.y + t.trunk;
      if (t.big) {
        if (y < top - 3 || y > top + 2) continue;
        const rr = y >= top + 2 ? 1 : y >= top + 1 ? 2 : y <= top - 3 ? 2 : 3;
        if (dx < -rr || dx > rr + 1 || dz < -rr || dz > rr + 1) continue;
        const fx = dx - 0.5;
        const fz = dz - 0.5;
        if (fx * fx + fz * fz > (rr + 0.4) * (rr + 0.4)) continue;
        return 'leaves';
      }
      if (t.leaves === 'matsu_leaves') {
        const r = y === top - 2 ? 3 : y === top ? 2 : y === top + 1 ? 1 : -1;
        if (r < 0 || Math.abs(dx) > r || Math.abs(dz) > r || Math.abs(dx) + Math.abs(dz) > r + 1) continue;
        return 'leaves';
      }
      if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
      if (y < top - 1 || y > top + 2) continue;
      const r = y <= top ? 2 : 1;
      if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
      if (y <= top && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      if (y === top + 2 && Math.abs(dx) + Math.abs(dz) > 1) continue;
      return 'leaves';
    }
    return null;
  }

  blockAt(x: number, y: number, z: number): VBlock {
    if (y < 0 || y >= AIR_Y) return y < 0 ? 'solid' : 'air';
    const sc = this.shaftCol(x, z);
    if (sc) return VBLOCK[this.kindIn(sc, x, y, z)]!;
    const h = this.T.height(x, z);
    const r = this.mouthRange(x, z);
    if (r !== null && y >= r[0] && y <= r[1]) return 'air';
    if (y <= h) return 'solid';
    // MAGMA-SPAWN: 滝の はしら（いし ＋ わきどころ）と 落ちる 道（はっぱを どけた 空気）。木より 先
    const fc = fallColumn(this.T.liquid, x, z);
    if (fc !== null && fc.kind === 'pillar' && y <= fc.pond.fall!.top) return 'solid'; // WAKIDOKORO: T 字の はしら（ふたの 列も 地面から）
    if (fc !== null && fc.kind === 'path' && y >= fc.pond.level && y <= fc.pond.fall!.top + 1) return 'air';
    const tb = this.treeBlock(x, y, z);
    if (tb !== null) return tb;
    if (x === this.torch.x && z === this.torch.z && y === this.torch.y) return 'torch';
    const ph = this.plantHeight(x, z);
    if (ph > 0 && y <= h + ph) {
      // たけは 木のブロックに ぶつかったら そこで止まる（chunk.ts の placePlants）
      let free = true;
      for (let yy = h + 1; yy < y && free; yy++) if (this.treeBlock(x, yy, z) !== null) free = false;
      if (free) return 'plant';
    }
    const pd = this.T.map.pondAt(x, z);
    if (pd !== null && pd.kind === 'inner' && y < pd.level) return 'water';
    const lp = this.T.liquid.pondAt(x, z);
    if (lp !== null && lp.kind === 'inner' && y < lp.pond.level) return 'water'; // MAGMA-SPAWN: マグマも 液体（'water'）として 答える
    return y <= SEA_Y ? 'water' : 'air';
  }

  covered(x: number, z: number): boolean {
    const sc = this.shaftCol(x, z);
    if (sc) {
      for (let y = AIR_Y - 1; y > 0; y--) {
        const k = this.kindIn(sc, x, y, z);
        if (k === K_SOLID) return false;
        if (k !== K_AIR) return true;
      }
      return false;
    }
    const g = this.ground(x, z);
    const h = this.T.height(x, z);
    if (h < SEA_Y) return true; // 水が かぶっている
    if (this.T.map.pondAt(x, z)?.kind === 'inner') return true; // いけの水
    if (this.T.liquid.pondAt(x, z)?.kind === 'inner') return true; // MAGMA-SPAWN: 溶岩・滝の いけ
    if (this.plantHeight(x, z) > 0) return true;
    if (this.treeColumn(x, z, g)) return true;
    return x === this.torch.x && z === this.torch.z && this.torch.y > g;
  }

  /** この列に 木のブロック（みき・はっぱ）が 地面の上に あるか */
  private treeColumn(x: number, z: number, g: number): boolean {
    if (TREES_V2) {
      const col = this.shapedCol(x >> 4, z >> 4);
      const o = (z & 15) * 16 + (x & 15);
      for (let y = Math.max(1, g + 1); y < AIR_Y; y++) {
        const b = col[y * LAYER + o]!;
        if (b === BLOCK_INDEX.log || isLeafIndex(b)) return true;
      }
      return false;
    }
    const trees = this.treesNear(x, z);
    for (const t of trees) {
      if (Math.abs(x - t.x) > 5 || Math.abs(z - t.z) > 5) continue;
      const top = t.y + t.trunk;
      for (let y = Math.max(g + 1, top - 3); y <= top + 2; y++) if (this.treeBlock(x, y, z) !== null) return true;
      if (x >= t.x && x < t.x + (t.big ? 2 : 1) && z >= t.z && z < t.z + (t.big ? 2 : 1) && t.y + 1 > g) return true;
    }
    return false;
  }

  treeCover(x: number, z: number): boolean {
    const sc = this.shaftCol(x, z);
    if (sc) {
      for (let y = AIR_Y - 1; y > 0; y--) {
        const k = this.kindIn(sc, x, y, z);
        if (k === K_SOLID) return false;
        if (k === K_LOG || k === K_LEAVES) return true;
      }
      return false;
    }
    return this.treeColumn(x, z, this.ground(x, z));
  }
}

const cache = new Map<string, Surface>();
const byShafts = new WeakMap<ShaftWorld, Map<string, Surface>>();

/**
 * シードごとに 覚えておく。opts.flora = false なら くさ・のばな を 数えない（farmPlacement 用）。
 * opts.shafts = その 世界の 坑道の 世界〔古い 列の 一覧つき。ゲームの 中では つなぎ込みが 1 つ 作って わたす〕。なければ 古い 列の ない 世界。
 */
export function surfaceFor(seed: number, opts: { flora?: boolean; shafts?: ShaftWorld | undefined } = {}): Surface {
  const flora = opts.flora !== false;
  const key = `${seed}|${flora}`;
  let c = cache;
  if (opts.shafts) {
    let m = byShafts.get(opts.shafts);
    if (!m) byShafts.set(opts.shafts, (m = new Map()));
    c = m;
  }
  let s = c.get(key);
  if (s === undefined) {
    if (c.size >= 12) c.delete(c.keys().next().value as string);
    s = new SurfaceImpl(seed, flora, opts.shafts ?? plainShaftWorld(seed));
    c.set(key, s);
  }
  return s;
}
