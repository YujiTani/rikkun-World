import { CHUNK_SIZE, WORLD_HEIGHT, type BlockId, type VoxelWorld } from '../../contracts';
import { createYokaiConfig } from '../../yokai/ai/config';
import { isUnderground } from '../../yokai/ai/terrain';
import { BLOCK_INDEX, BLOCK_TYPES, blockIdFromIndex } from '../blocks/blockTypes';
import { buildBlocks } from './chunk';
import { HW } from './columnLayout';
import { MINE_CONFIG, type MineLayerDef, type MineLayerId, type MineOreRow } from './mineConfig';
import { layerAt } from './mineLayers';
import type { OreCluster } from './mineOres';
import { chalkInfo, type ChalkFace, type Compass } from '../blocks/chalkMark';
import { groundHeightAt, terrainFor } from './terrain';

/**
 * window.__rikkun.mine（MINE-1A。docs/design/MINE-1.md §6.1）。炭鉱（地下）の ことを ゲームに 聞く。
 * 生成の 計算だけで 答える ので、読みこんで いない 所でも ゲームを 起動しなくても 読める（`biome` と 同じ）。
 *   layers()           → 3 つの 層 { id, minY, maxY }（asai の maxY は null ＝ 地面まで）
 *   layerAt(y)         → その 高さの 層（そこいし〔y 0〕より 下は null）
 *   oreTable()         → 鉱石の 量の 目安 { layer, block, visible, all }[]（1 列あたり。§4.2）
 *   columnOres(cx, cz) → その 列を 生成して 数えた 鉱石 { normal, layers: { 層: { stone, wall, ores: { 鉱石: { all, visible } } } } }
 *   oreClusters(cx, cz)→ その 列で 生成が 作った かたまり { block, layer, target, cells }[]（山の 面の 鉱石は 入らない）
 *   underground()      → 今の プレイヤー { under, feetY, groundY, minY, maxY }（地下の 判定と 妖怪を 出す 高さの はば）
 *   chalkAt(x, y, z)   → MINE-1B: その マスの チョークの しるし { face: 'up'|'n'|'e'|'s'|'w'（かいた 面。'up' ＝ ゆか）, dir: 'n'|'e'|'s'|'w'（やじるしの 向き）}。なければ null。
 *                        いきている 世界（`world`）を 読む。`world` を わたさない ときは いつも null
 */

/** 鉱石 1 種類の 数（こ）。all ＝ ぜんぶ、visible ＝ 6 方向の となりが 地面より 下の 空気か 水 */
interface OreCount {
  all: number;
  visible: number;
}

/** 1 つの 層の 数（こ）。stone ＝ 石、wall ＝ 空気か 水に ふれた 石 */
interface LayerCount {
  stone: number;
  wall: number;
  ores: Partial<Record<BlockId, OreCount>>;
}

interface ColumnOres {
  /** 坑道・部屋が かからない 列（1A には まだ 無いので いつも true） */
  normal: boolean;
  layers: Record<MineLayerId, LayerCount>;
}

interface Underground {
  under: boolean;
  /** プレイヤーの 足の 高さ */
  feetY: number;
  /** その x・z の 生成の 地形の 高さ（掘っても かわらない） */
  groundY: number;
  /** 妖怪が 出る 高さの はば（足 ±設定 yokaiSpawnHeight）。地上でも 地下でも 同じ */
  minY: number;
  maxY: number;
}

export interface MineHook {
  layers(): MineLayerDef[];
  layerAt(y: number): MineLayerId | null;
  oreTable(): MineOreRow[];
  columnOres(cx: number, cz: number): ColumnOres;
  oreClusters(cx: number, cz: number): OreCluster[];
  underground(): Underground;
  chalkAt(x: number, y: number, z: number): { face: ChalkFace; dir: Compass } | null;
}

const AIR = BLOCK_INDEX.air;
const STONE = BLOCK_INDEX.stone;
const WATER = BLOCK_INDEX.water;
const ROW = CHUNK_SIZE;
/** 鉱石は 表 `MINE_CONFIG.ores` の ブロック（せきたん・てつ・1B の 新しい 鉱物。ねんど・せっかいせき・ほたるいしは 名前が `_ore` で 終わらない） */
const IS_ORE = BLOCK_TYPES.map((t) => MINE_CONFIG.ores.some((r) => r.block === t.id));

/** 隣の 列の、この 列と 面を あわせる 1 まい（y × 16）。0 ＝ 西〔x−〕・1 ＝ 東・2 ＝ 北〔z−〕・3 ＝ 南 */
type Faces = [Uint8Array, Uint8Array, Uint8Array, Uint8Array];

interface Col {
  blocks: Uint8Array;
  /** 18×18 の 高さの 地図 */
  heights: Int16Array;
  faces: Faces;
}

/** 見える ＝ となりが 水、または その 列の 地形の 高さ 以下の 空気（ほらあな・口） */
const opens = (id: number, y: number, groundH: number): boolean => id === WATER || (id === AIR && y <= groundH);

/** となりの マス（nx, nz）の ブロック。列の 中は この 列から、列の 外は 隣の 列の 面（face・k）から 読む */
function sideBlock(c: Col, y: number, nx: number, nz: number, face: number, k: number): number {
  return nx >= 0 && nx < ROW && nz >= 0 && nz < ROW ? c.blocks[(y * ROW + nz) * ROW + nx]! : c.faces[face]![y * ROW + k]!;
}

/** (lx, y, lz) の 6 方向の どれかが 見える 側か（列の さかいは 隣の 列の 面を 読む） */
function exposed(c: Col, lx: number, y: number, lz: number): boolean {
  const { blocks, heights } = c;
  const h0 = heights[(lz + 1) * HW + lx + 1]!;
  if (y + 1 < WORLD_HEIGHT && opens(blocks[((y + 1) * ROW + lz) * ROW + lx]!, y + 1, h0)) return true;
  if (y > 0 && opens(blocks[((y - 1) * ROW + lz) * ROW + lx]!, y - 1, h0)) return true;
  return (
    opens(sideBlock(c, y, lx - 1, lz, 0, lz), y, heights[(lz + 1) * HW + lx]!) ||
    opens(sideBlock(c, y, lx + 1, lz, 1, lz), y, heights[(lz + 1) * HW + lx + 2]!) ||
    opens(sideBlock(c, y, lx, lz - 1, 2, lx), y, heights[lz * HW + lx + 1]!) ||
    opens(sideBlock(c, y, lx, lz + 1, 3, lx), y, heights[(lz + 2) * HW + lx + 1]!)
  );
}

/** 隣の 4 列を 作って、この 列に 面する 1 まいずつを 写す（作業用の 入れものを 使い回す 生成なので 写しながら） */
function neighborFaces(seed: number, cx: number, cz: number): Faces {
  const faces: Faces = [new Uint8Array(WORLD_HEIGHT * ROW), new Uint8Array(WORLD_HEIGHT * ROW), new Uint8Array(WORLD_HEIGHT * ROW), new Uint8Array(WORLD_HEIGHT * ROW)];
  const take = (face: number, dx: number, dz: number): void => {
    const b = buildBlocks(seed, cx + dx, cz + dz).blocks;
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let k = 0; k < ROW; k++) {
        const lx = dx === -1 ? ROW - 1 : dx === 1 ? 0 : k;
        const lz = dz === -1 ? ROW - 1 : dz === 1 ? 0 : k;
        faces[face]![y * ROW + k] = b[(y * ROW + lz) * ROW + lx]!;
      }
    }
  };
  take(0, -1, 0);
  take(1, 1, 0);
  take(2, 0, -1);
  take(3, 0, 1);
  return faces;
}

function emptyLayers(): Record<MineLayerId, LayerCount> {
  const out = {} as Record<MineLayerId, LayerCount>;
  for (const l of MINE_CONFIG.layers) {
    const ores: Partial<Record<BlockId, OreCount>> = {};
    for (const r of MINE_CONFIG.ores) ores[r.block] = { all: 0, visible: 0 };
    out[l.id] = { stone: 0, wall: 0, ores };
  }
  return out;
}

export function createMineHook(o: {
  seed: number;
  /** MINE-1B: いきている 世界（チョークの しるしを 読む）。なければ `chalkAt` は いつも null */
  world?: Pick<VoxelWorld, 'getBlock'>;
  /** プレイヤーの 足もと（世界の 座標）。なければ スタートの 足もと */
  player?: () => { x: number; y: number; z: number };
  /** 妖怪を 出す 高さの はば（足 ±これ）。なければ 設定の 初期値（YokaiConfig.yokaiSpawnHeight） */
  spawnHeight?: () => number;
}): MineHook {
  const { seed } = o;
  const T = terrainFor(seed);
  const defaultHeight = createYokaiConfig().yokaiSpawnHeight;
  const spawnHeight = o.spawnHeight ?? ((): number => defaultHeight);
  const player =
    o.player ??
    ((): { x: number; y: number; z: number } => {
      const sp = T.spawn();
      return { x: sp.x + 0.5, y: sp.h + 1, z: sp.z + 0.5 };
    });

  return {
    layers: () => MINE_CONFIG.layers.map((l) => ({ ...l })),
    layerAt,
    oreTable: () => MINE_CONFIG.ores.map((r) => ({ ...r })),

    columnOres(cx, cz): ColumnOres {
      // 作業用の 入れものは 次の 生成で 書きかわる ので、この 列は 写してから 隣の 列を 作る
      const built = buildBlocks(seed, cx, cz);
      const col: Col = { blocks: built.blocks.slice(), heights: built.heights.slice(), faces: neighborFaces(seed, cx, cz) };
      const layers = emptyLayers();
      for (let y = 1; y < WORLD_HEIGHT; y++) {
        const id = layerAt(y);
        if (id === null) continue;
        const L = layers[id];
        for (let lz = 0; lz < ROW; lz++) {
          for (let lx = 0; lx < ROW; lx++) {
            const b = col.blocks[(y * ROW + lz) * ROW + lx]!;
            if (b === STONE) {
              L.stone++;
              if (exposed(col, lx, y, lz)) L.wall++;
            } else if (IS_ORE[b]) {
              const name = blockIdFromIndex(b);
              const n = (L.ores[name] ??= { all: 0, visible: 0 });
              n.all++;
              if (exposed(col, lx, y, lz)) n.visible++;
            }
          }
        }
      }
      return { normal: true, layers };
    },

    oreClusters(cx, cz): OreCluster[] {
      const rec: OreCluster[] = [];
      buildBlocks(seed, cx, cz, rec);
      return rec;
    },

    underground(): Underground {
      const p = player();
      const groundY = groundHeightAt(seed, p.x, p.z);
      const h = spawnHeight();
      return { under: isUnderground(p.y, groundY), feetY: p.y, groundY, minY: p.y - h, maxY: p.y + h };
    },

    chalkAt(x, y, z) {
      const info = o.world ? chalkInfo(o.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))) : null;
      return info ? { face: info.face, dir: info.dir } : null;
    },
  };
}
