import { CHUNK_SIZE, type BlockId } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { COL_VOLUME, HW, LAYER } from './columnLayout';
import { MINE_CONFIG, type MineClusterSize, type MineLayerId, type MineOreRow } from './mineConfig';
import { layerSpan } from './mineLayers';
import { createRng, hashInts, subSeed, type Rng } from './random';

/**
 * 鉱石の かたまり（MINE-1A。docs/design/MINE-1.md §4.2）。
 * 同じ 鉱石が 面で くっついた 2〜5 こ を、列（16×16）・層の 中の 石の 中に 置く。見える 数は 「かべに 寄せる」 ことを せず、
 * 石の マスから 一様に えらぶ だけ で 決まる（見える ÷ ぜんぶ は 約 2.7%）。
 *
 * 置く 順: 地形・ふつうの ほらあな・洞くつの 口を 掘った あと（あとから 掘られて かたまりが 切れない ように）。
 * 作り方: 石の マスを 1 つ えらんで 置き、「今の かたまりに 面で となりあう 石の マス」から 1 つ えらんで 足す、を 目当ての 大きさまで くり返す。
 * 足せる マスが なく なったら そこで おわり（置けた 数が その かたまりの 大きさ）。
 * 置ける・足せる マス: 石・同じ 列・同じ 層の 中・地面より 1 つ 下まで・同じ 鉱石の ほかの かたまりと 面で ふれない マス。
 */

const STONE = BLOCK_INDEX.stone;
const ROW = CHUNK_SIZE;
/** 置いた マスの 一覧の 大きさ（こ）。owner を 0 に もどす ために 覚える。1 列に 置く 数は 300 こ くらい なので いつも あまる */
const PLACED_CAP = 4096;

/** かたまりの 目当ての 大きさの 表 1 つ（わりあいの 合計・平均を 先に 計算） */
interface SizeTable {
  sizes: readonly MineClusterSize[];
  /** わりあい（%）の 合計 */
  total: number;
  /** 目当ての 大きさの 平均（こ）。かたまりの 数 ＝ ぜんぶ ÷ これ */
  mean: number;
}
function sizeTable(sizes: readonly MineClusterSize[]): SizeTable {
  const total = sizes.reduce((p, s) => p + s.percent, 0);
  return { sizes, total, mean: sizes.reduce((p, s) => p + s.size * s.percent, 0) / total };
}
const DEFAULT_SIZES = sizeTable(MINE_CONFIG.cluster.sizes);

/** 窓口 `mine.oreClusters`（§6.1）が 返す 1 つの かたまり */
export interface OreCluster {
  block: BlockId;
  layer: MineLayerId;
  /** 目当ての 大きさ。cells の 数が 置けた 大きさ（石が たりないと target より 小さい） */
  target: number;
  /** 世界の マス */
  cells: { x: number; y: number; z: number }[];
}

interface OreRowRt {
  row: MineOreRow;
  /** この 行の かたまりの 大きさの 表（ダイヤの いしは 小さい） */
  table: SizeTable;
  /** ブロックの 番号 */
  id: number;
  /** 層の いちばん 下・上の y（上は 世界の いちばん 上まで） */
  lo: number;
  hi: number;
}

const ORE_ROWS: readonly OreRowRt[] = MINE_CONFIG.ores.map((row): OreRowRt => {
  const { lo, hi } = layerSpan(row.layer);
  return { row, table: row.sizes ? sizeTable(row.sizes) : DEFAULT_SIZES, id: BLOCK_INDEX[row.block], lo, hi };
});

/** かたまり 1 つの 大きさの 上限（こ）。足せる マスの 一覧の 大きさを きめる */
const MAX_SIZE = Math.max(...ORE_ROWS.flatMap((r) => r.table.sizes.map((s) => s.size)));

/**
 * どの かたまりの マスか（かたまりごとの 番号。置いた マスだけ 書き、列を 作りおえたら 0 に もどす ＝ 前の 列に 左右されない）。
 * 0 ＝ この 関数で 置いた マスでは ない（山の 面の 鉱石も 「ほかの かたまり」と 同じに あつかう）
 */
const owner = new Uint16Array(COL_VOLUME);
const placed = new Int32Array(PLACED_CAP);
/** placed に 入れた マスの 数（列ごとに 0 から） */
let nPlaced = 0;
/** 今の かたまりの マス・足せる マスの 一覧（作業用。毎回 新しい 配列は 作らない） */
const members = new Int32Array(MAX_SIZE);
const cands = new Int32Array(MAX_SIZE * 6);

/** 目当ての 大きさを わりあい（%）どおりに 1 つ 引く */
function pickTarget(rng: Rng, t: SizeTable): number {
  let u = rng() * t.total;
  for (const s of t.sizes) {
    if (u < s.percent) return s.size;
    u -= s.percent;
  }
  return t.sizes[t.sizes.length - 1]!.size;
}

/** マス c の d 番目の となり（0 x−・1 x+・2 z−・3 z+・4 y−・5 y+）。列の 外・世界の 外なら −1 */
function neighbor(c: number, d: number): number {
  const lx = c % ROW;
  const lz = Math.floor(c / ROW) % ROW;
  if (d === 0) return lx > 0 ? c - 1 : -1;
  if (d === 1) return lx < ROW - 1 ? c + 1 : -1;
  if (d === 2) return lz > 0 ? c - ROW : -1;
  if (d === 3) return lz < ROW - 1 ? c + ROW : -1;
  if (d === 4) return c >= LAYER ? c - LAYER : -1;
  return c < COL_VOLUME - LAYER ? c + LAYER : -1;
}

/** i は 置ける・足せる マスか（石・層の 中・地面より 下・同じ 鉱石の ほかの かたまりと 面で ふれない） */
function canTake(out: Uint8Array, heights: Int16Array, r: OreRowRt, serial: number, i: number): boolean {
  if (out[i] !== STONE) return false;
  const y = Math.floor(i / LAYER);
  if (y < r.lo || y > r.hi) return false;
  if (y > heights[(Math.floor(i / ROW) % ROW + 1) * HW + (i % ROW) + 1]! - 1) return false;
  for (let d = 0; d < 6; d++) {
    const j = neighbor(i, d);
    if (j >= 0 && out[j] === r.id && owner[j] !== serial) return false;
  }
  return true;
}

/** 今の かたまり（members の size こ）に 面で となりあって 置ける マスを cands に 集める（同じ マスは 1 回）。集めた 数を 返す */
function collectCandidates(out: Uint8Array, heights: Int16Array, r: OreRowRt, serial: number, size: number): number {
  let nc = 0;
  for (let m = 0; m < size; m++) {
    for (let d = 0; d < 6; d++) {
      const j = neighbor(members[m]!, d);
      if (j < 0 || !canTake(out, heights, r, serial, j)) continue;
      let dup = false;
      for (let q = 0; q < nc && !dup; q++) dup = cands[q] === j;
      if (!dup) cands[nc++] = j;
    }
  }
  return nc;
}

/** マスを 鉱石に して かたまりに 入れる */
function take(out: Uint8Array, r: OreRowRt, serial: number, i: number): void {
  out[i] = r.id;
  owner[i] = serial;
  placed[nPlaced++] = i;
}

/**
 * 鉱石の かたまりを 置く（chunk.ts の buildBlocks から 呼ぶ）。heights は 18×18 の 高さの 地図。
 * rec が あれば 置いた かたまりを 入れる（窓口 `mine.oreClusters` 用。ふだんの 生成では わたさない）
 */
export function placeMineOres(out: Uint8Array, seed: number, cx: number, cz: number, heights: Int16Array, rec?: OreCluster[]): void {
  nPlaced = 0;
  try {
    placeRows(out, seed, cx, cz, heights, rec);
  } finally {
    // 置いた マスの 印を 0 に もどす（途中で しっぱいしても 次の 列に のこさない）
    for (let k = 0; k < nPlaced; k++) owner[placed[k]!] = 0;
    nPlaced = 0;
  }
}

/** 表の 行ごとに かたまりを 置く */
function placeRows(out: Uint8Array, seed: number, cx: number, cz: number, heights: Int16Array, rec: OreCluster[] | undefined): void {
  const sO = subSeed(seed, 601);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  let topMax = 0; // この 列で いちばん 高い 「地面の 1 つ 下」
  for (let lz = 0; lz < ROW; lz++) for (let lx = 0; lx < ROW; lx++) topMax = Math.max(topMax, heights[(lz + 1) * HW + lx + 1]! - 1);
  const tries = MINE_CONFIG.cluster.firstTries;
  let serial = 0;
  for (let ri = 0; ri < ORE_ROWS.length; ri++) {
    const r = ORE_ROWS[ri]!;
    const hi = Math.min(r.hi, topMax);
    if (hi < r.lo) continue;
    // 行ごとに 別の 乱数（表の うしろに 行を 足しても 前の 行の 置き方は かわらない）
    const rng = createRng(hashInts(sO, cx, cz, ri));
    const want = r.row.all / r.table.mean;
    let n = Math.floor(want);
    if (rng() < want - n) n++;
    for (let k = 0; k < n && nPlaced + MAX_SIZE <= PLACED_CAP; k++) {
      const target = pickTarget(rng, r.table);
      serial++;
      // 1 こ目: 層の 中の どこかを 一様に えらぶ（置けない マスなら えらびなおす）
      let first = -1;
      for (let t = 0; t < tries && first < 0; t++) {
        const lx = Math.floor(rng() * ROW);
        const lz = Math.floor(rng() * ROW);
        const y = r.lo + Math.floor(rng() * (hi - r.lo + 1));
        const i = y * LAYER + lz * ROW + lx;
        if (canTake(out, heights, r, serial, i)) first = i;
      }
      if (first < 0) continue;
      let size = 0;
      members[size++] = first;
      take(out, r, serial, first);
      while (size < target) {
        const nc = collectCandidates(out, heights, r, serial, size);
        if (nc === 0) break;
        const pick = cands[Math.floor(rng() * nc)]!;
        members[size++] = pick;
        take(out, r, serial, pick);
      }
      if (rec) {
        const cells: OreCluster['cells'] = [];
        for (let m = 0; m < size; m++) {
          const c = members[m]!;
          cells.push({ x: x0 + (c % ROW), y: Math.floor(c / LAYER), z: z0 + (Math.floor(c / ROW) % ROW) });
        }
        rec.push({ block: r.row.block, layer: r.row.layer, target, cells });
      }
    }
  }
}
