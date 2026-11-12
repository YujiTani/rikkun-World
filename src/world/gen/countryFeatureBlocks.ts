import { CHUNK_SIZE, WILD_BLOCK, WORLD_HEIGHT, type BlockArray, type BlockId } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { COUNTRY_PLANT_IDS } from '../blocks/countryPlants';
import { HIMAWARI, HIMAWARI_TOP } from '../blocks/himawari';
import { LAYER } from './columnLayout';
import { FEATURE_TUNE, featureSitesTouching, type FeatureSite } from './countryFeatures';
import { terrainFor, type Terrain } from './terrain';

/**
 * 国だけの物を チャンク（列）に 置く（VOX-I-4a #187）。場所は countryFeatures.ts（覚える）。
 * 木・草花は 先に どける（みきが まわり TUNE.treeMargin 以内の 木 ごと・足もとの 草花）。ブロックは 木・草花の あとに 書く（空気・はっぱ・草花を 上書き）。
 */

type Rect = readonly [number, number, number, number];

/** 置く 物の まわり これだけ 先の チャンクまで 影響する（みきの きょり 4 ＋ はっぱ 4 ＋ 足もとの 半分 3 ＋ よゆう）。物の 基準の マスを この はばで さがす */
const NEAR = FEATURE_TUNE.treeMargin + 4 + 3 + 3;
/** チャンクの 木として 数える はば（placeTrees が みきを さがす はんい。大木の はっぱが 4 まで 出る ぶん） */
const TREE_REACH = 5;

/** 列 (x, z) の 数字ひとつの 名前（x × 100003 + z） */
export const columnKey = (x: number, z: number): number => x * 100003 + z;

export interface ChunkFeatures {
  sites: readonly FeatureSite[];
  /** 木を どける 四角（足もと ＋ まわり treeMargin。みきの 位置で 見る） */
  trees: readonly Rect[];
  /** 草花（はな・すすき・たけ・くさ・のばな）を どける 四角（足もと） */
  plants: readonly Rect[];
  /** 地面の 高さが かわる 列（はたけあと = ひくい 方に そろえた つち、つきみの いわ = いしの 山の てっぺん）→ 新しい いちばん上の 固い ブロックの y。上は つち・いし（くさ ではない） */
  ground: ReadonlyMap<number, number>;
  /** 物が 立つ 列 → その 高さ（地面の すぐ上から 数えた マス数。ひまわり = 2、きのこ・かいがら・たけのこ・やせいの やさい = 1） */
  plantHeight: ReadonlyMap<number, number>;
}

const NONE: ChunkFeatures = { sites: [], trees: [], plants: [], ground: new Map(), plantHeight: new Map() };

const SOLID_TOP: ReadonlySet<BlockId> = new Set<BlockId>(['dirt', 'stone']);
const STANDING: ReadonlySet<BlockId> = new Set<BlockId>([...COUNTRY_PLANT_IDS, ...Object.values(WILD_BLOCK)]);

function columnsOf(sites: readonly FeatureSite[]): Pick<ChunkFeatures, 'ground' | 'plantHeight'> {
  const ground = new Map<number, number>();
  const plantHeight = new Map<number, number>();
  for (const s of sites) {
    for (const b of s.blocks) {
      const k = columnKey(b.x, b.z);
      if (SOLID_TOP.has(b.id)) ground.set(k, Math.max(ground.get(k) ?? 0, b.y));
      else if (STANDING.has(b.id) && b.id !== HIMAWARI_TOP) plantHeight.set(k, b.id === HIMAWARI ? 2 : 1);
    }
  }
  return { ground, plantHeight };
}

const memo = new WeakMap<Terrain, Map<number, ChunkFeatures>>();
const MAX_CHUNKS = 256;

/** チャンク (x0, z0) から 左上 16×16 の まわりに ある 物と、どける 四角（チャンクごとに 覚える） */
export function featuresNearChunk(seed: number, x0: number, z0: number): ChunkFeatures {
  const T = terrainFor(seed);
  let m = memo.get(T);
  if (!m) memo.set(T, (m = new Map()));
  const key = columnKey(x0 >> 4, z0 >> 4);
  const hit = m.get(key);
  if (hit) return hit;
  const sites = featureSitesTouching(seed, x0 - NEAR, z0 - NEAR, x0 + CHUNK_SIZE - 1 + NEAR, z0 + CHUNK_SIZE - 1 + NEAR);
  const trees: Rect[] = [];
  const plants: Rect[] = [];
  // この チャンクの 木（みきが チャンクの まわり TREE_REACH 以内）・草花に かかる 四角だけ のこす（かいだんは 四角が 100 こ ちかく ある）
  const near = (r: Rect, m: number): boolean => r[2] >= x0 - m && r[0] <= x0 + CHUNK_SIZE - 1 + m && r[3] >= z0 - m && r[1] <= z0 + CHUNK_SIZE - 1 + m;
  for (const s of sites) {
    const mg = s.margin ?? FEATURE_TUNE.treeMargin;
    for (const r of s.rects ?? [s.foot]) {
      const t: Rect = [r[0] - mg, r[1] - mg, r[2] + mg, r[3] + mg];
      if (near(t, TREE_REACH)) trees.push(t);
      if (near(r, 0)) plants.push(r);
    }
  }
  const out: ChunkFeatures = sites.length === 0 ? NONE : { sites, trees, plants, ...columnsOf(sites) };
  if (m.size >= MAX_CHUNKS) m.delete(m.keys().next().value as number);
  m.set(key, out);
  return out;
}

/** ブロックの 並び `out`（列の 中。y × 16 × 16）に、この チャンクの 中の マスだけ 書く */
export function writeFeatureBlocks(out: BlockArray, f: ChunkFeatures, x0: number, z0: number): void {
  for (const s of f.sites) {
    for (const b of s.blocks) {
      const lx = b.x - x0;
      const lz = b.z - z0;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || b.y < 1 || b.y >= WORLD_HEIGHT) continue;
      out[b.y * LAYER + lz * CHUNK_SIZE + lx] = BLOCK_INDEX[b.id];
    }
  }
}
