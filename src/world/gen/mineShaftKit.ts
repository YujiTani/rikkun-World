import type { BlockId, ChunkColumn, ItemId, Rarity } from '../../contracts';
import { WORLD_HEIGHT } from '../../contracts';
import { BLOCK_INDEX, BLOCK_TYPES } from '../blocks/blockTypes';
import { SkyDarkness } from '../light/skyDarkness';
import { WorldLight } from '../light/WorldLight';
import { SECTION_VOLUME, sectionToArray } from '../sections';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { generateChunk } from './chunk';
import { createMineHook } from './mineHook';
import { colKey } from '../stream/ring';
import { spawnOf } from './terrain';

/**
 * MINE-1C（docs/design/MINE-1.md §4.5・§6.1・受け入れ基準 C1〜C16）の テスト用の 道具。ゲームの 外〔テスト〕だけで 使う。
 *
 *   ・窓口 `mine.shafts`・`startShaft`・`shaftPath`・`shaftRolls`・`chest*`・`saveGens`・`oldCols`・`isOld`・`work` の 型〔仕様 §6.1 の とおり。まだ 無いので 型は ここで 持つ〕
 *   ・生成した 列を 読む `GenCols`
 *   ・歩ける きまり〔仕様 §6.1 の「歩ける きまり」を 1 つの 関数に。みんなで 使う〕と 道さがし
 *   ・坑道の 形・安全の しらべ〔C3・C4・C5〕
 *
 * 【自分で 決めた 名前・約束】 developer は これに 合わせる〔ちがう 形に した ときは、ここ 1 か所を 直す〕:
 *   ・`entrance.dir` ＝ 入口が 向いて いる 向き〔山の 外へ ひらく 向き〕。0＝北〔z−〕・1＝東〔x+〕・2＝南〔z+〕・3＝西〔x−〕〔mouths.ts の DIR_X・DIR_Z と 同じ〕
 *   ・`shaftPath` の y ＝ 足の マスの y〔足の 下の ブロックが 床〕。`entrance` ・`sides[].from/to`・`room.y` も 足の マスの y
 *   ・`room` ＝ いちばん 下の へやの 床〔9×9〕の はんい〔x0..x1・z0..z1・足の y〕。宝箱は その へやの 中の おくの 列〔かべ ぎわ〕に 置く
 *   ・`shafts(x0, z0, x1, z1)` ＝ はんい〔世界の ブロック座標。両はし ふくむ〕に 箱 `box` が かかる 坑道ぜんぶ
 *   ・`shaftRolls` の rx・rz ＝ 区画の 番号〔256 マスで 割った 商。ブロック座標では ない〕
 *   ・距離は 横〔x・z〕の ユークリッド距離
 */

// ------------------------------------------------------------------ 窓口の 型〔仕様 §6.1〕

export interface Pt {
  x: number;
  y: number;
  z: number;
}
export type Compass = 'n' | 'e' | 's' | 'w';
export type PathPart = 'entrance' | 'ramp' | 'landing' | 'side' | 'joint' | 'koheya' | 'room';
export interface PathCell extends Pt {
  part: PathPart;
}
export type Tier = 1 | 2 | 3 | 4;
export type Layer = 'asai' | 'nakahodo' | 'fukai';

export interface ShaftSide {
  layer: Layer;
  from: Pt;
  to: Pt;
  end: 'cave' | 'joint' | 'koheya';
  /** 計画の 長さ〔上の 限り 12〜40〕 */
  length: number;
  /** 計画の 曲がり〔0〜2〕 */
  bends: number;
}
export interface ShaftChest {
  x: number;
  y: number;
  z: number;
  cells: Pt[];
  front: Compass;
  tier: Tier;
}
export interface Shaft {
  id: string;
  start: boolean;
  entrance: Pt & { dir: 0 | 1 | 2 | 3; kind: 'slope' | 'mound' };
  mound: { x: number; z: number; top: number; width: number } | null;
  room: { x0: number; y: number; z0: number; x1: number; z1: number };
  chest: ShaftChest | null;
  sides: ShaftSide[];
  box: { x0: number; z0: number; x1: number; z1: number };
}
export interface ShaftRoll {
  rx: number;
  rz: number;
  hit: boolean;
  land: number;
  placed: boolean;
}
export interface ChestTierRow {
  tier: Tier;
  chance: number;
  slots: number;
  rarity: Partial<Record<Rarity, number>>;
  sure: Rarity | null;
}
export interface ChestTable {
  placeChance: number;
  tiers: ChestTierRow[];
  legendary: number;
  lots: { id: string; chance: number }[];
}
export interface ChestRoll {
  tier: Tier;
  items: { item: ItemId; count: number }[];
}
export interface ChestInfo {
  table: string;
  tier: Tier;
  opened: boolean;
  main: Pt;
  cells: Pt[];
  front: Compass;
}
/** 古い 列の 一覧〔colKey の 集まり。仕様 §4.8。名前は 案〕 */
export interface OldCols {
  kodo: ReadonlySet<number>;
  heya: ReadonlySet<number>;
}

/** 仕様 §6.1 の 1C の 窓口。型には まだ 無いので 文字で 読む〔赤の 間も 型が 通る ように〕 */
export interface MineHook1C {
  shafts(x0: number, z0: number, x1: number, z1: number): Shaft[];
  startShaft(): Shaft;
  shaftPath(id: string): PathCell[];
  shaftRolls(x0: number, z0: number, x1: number, z1: number): ShaftRoll[];
  chestAt(x: number, y: number, z: number): ChestInfo | null;
  chestTable(name: string): ChestTable;
  chestPool(): Record<Rarity, ItemId[]>;
  /** 【名前は tester の 案】くじの 箱から のぞく 物〔理由つき。仕様 §4.6〕 */
  chestExcluded(): { item: ItemId; reason: string }[];
  rollChest(table: string | ChestTable, seed: number, tier?: Tier): ChestRoll;
  chestPreview(x: number, y: number, z: number): ChestRoll | null;
  /** 右クリックと 同じ〔どちらの マスでも〕。あけた あとの 出口は `createMineHook({ chest })` で わたす〔mineChestOpen.test.ts〕 */
  open(x: number, y: number, z: number): void;
  caveAt(x: number, y: number, z: number): string | null;
  saveGens(): { current: number; meta: number; kodo: number | null; heya: number | null };
  oldCols(kind: 'kodo' | 'heya'): number;
  isOld(kind: 'kodo' | 'heya', cx: number, cz: number): boolean;
  work(cx: number, cz: number): { shaftRegions: number; caveRegions: number; emitters: number };
  columnOres(cx: number, cz: number): { normal: boolean };
}

/** 窓口を 作る。`oldCols` は 古い 保存を 開いた とき の 一覧〔なければ 新しい 世界〕 */
export function hook1c(seed: number, o: { oldCols?: OldCols; world?: unknown } = {}): MineHook1C {
  return createMineHook({ seed, ...(o.oldCols ? { oldCols: o.oldCols } : {}), ...(o.world ? { world: o.world } : {}) } as never) as unknown as MineHook1C;
}

/** 生成の 窓口。古い 列の 一覧を わたせる 形は 案〔`generateChunk(seed, cx, cz, oldCols)`〕 */
export function genColumn(seed: number, cx: number, cz: number, oldCols?: OldCols): ChunkColumn {
  return oldCols ? (generateChunk as unknown as (s: number, x: number, z: number, o: OldCols) => ChunkColumn)(seed, cx, cz, oldCols) : generateChunk(seed, cx, cz);
}

// ------------------------------------------------------------------ 数〔テストの 表。実装の あとで 数えて 決めなおす〕

/** 20 シード〔C1・C2・C3〜C7〕 */
export const SEEDS_20: readonly number[] = Array.from({ length: 20 }, (_, i) => (i === 0 ? 20261012 : 1000 + i * 7919));

/**
 * 【PO 案】出会える 数〔C2。仕様 §4.5.1〕: スタートから 横 radius マス 以内に、はじまり いがいの 坑道が count 以上 ある シードが share 以上。
 * 試作が ないので 実装の あとで 数えて、足りなければ ここと 仕様の 数を いっしょに 直す〔テストは この 表を 読む〕
 */
export const SHAFT_MEET = { radius: 768, count: 2, share: 0.9 } as const;

// ------------------------------------------------------------------ 生成した 列を 読む

export const isBodyIndex = ((): ((b: number) => boolean) => {
  const solid = BLOCK_TYPES.map((t) => t.solid);
  const water = BLOCK_INDEX.water;
  return (b: number): boolean => b >= 0 && !solid[b] && b !== water;
})();
export const isSolidIndex = ((): ((b: number) => boolean) => {
  const solid = BLOCK_TYPES.map((t) => t.solid);
  return (b: number): boolean => b >= 0 && solid[b] === true;
})();
const idOf = (b: number): string => (b >= 0 ? BLOCK_TYPES[b]!.id : 'outside');

/** 生成した 列を ためて 読む〔1 列 1 回だけ 作る〕。世界の 外・高さの 外は -1 */
export class GenCols {
  private readonly flat = new Map<string, Uint8Array>();
  private readonly chunks = new Map<string, ChunkColumn>();
  constructor(
    readonly seed: number,
    readonly oldCols?: OldCols,
  ) {}
  chunk(cx: number, cz: number): ChunkColumn {
    const k = `${cx},${cz}`;
    let c = this.chunks.get(k);
    if (!c) this.chunks.set(k, (c = genColumn(this.seed, cx, cz, this.oldCols)));
    return c;
  }
  col(cx: number, cz: number): Uint8Array {
    const k = `${cx},${cz}`;
    let f = this.flat.get(k);
    if (!f) {
      f = new Uint8Array(WORLD_HEIGHT * 256);
      this.chunk(cx, cz).sections.forEach((s, sy) => f!.set(sectionToArray(s), sy * SECTION_VOLUME));
      this.flat.set(k, f);
    }
    return f;
  }
  /** ブロックの 番号。高さの 外は -1 */
  at(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return -1;
    return this.col(x >> 4, z >> 4)[(y * 16 + (z & 15)) * 16 + (x & 15)]!;
  }
  id(x: number, y: number, z: number): string {
    return idOf(this.at(x, y, z));
  }
  /** x・z の いちばん 上の 固い ブロックの y〔なければ -1〕 */
  topSolid(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) if (isSolidIndex(this.at(x, y, z))) return y;
    return -1;
  }
  /** はんいの 列を 読みこんで、光を 計算した 世界〔ブロックの 光を 見る〕 */
  lit(box: { x0: number; z0: number; x1: number; z1: number }, margin = 16): WorldLight {
    const w = new ArrayVoxelWorld({ x: 0, z: 0 });
    for (let cz = (box.z0 - margin) >> 4; cz <= (box.z1 + margin) >> 4; cz++) for (let cx = (box.x0 - margin) >> 4; cx <= (box.x1 + margin) >> 4; cx++) w.loadColumn(this.chunk(cx, cz));
    const l = new WorldLight(w, new SkyDarkness());
    l.update();
    l.flush();
    return l;
  }
}

// ------------------------------------------------------------------ 歩ける きまり〔仕様 §6.1〕と 道さがし

export const ptKey = (p: Pt): string => `${p.x},${p.y},${p.z}`;
const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 立てる マス: 足の マスと 頭の マスが 体の 通る マス〔水は のぞく〕で、足の 下が 固い */
export function standable(g: GenCols, x: number, y: number, z: number): boolean {
  return isBodyIndex(g.at(x, y, z)) && isBodyIndex(g.at(x, y + 1, z)) && isSolidIndex(g.at(x, y - 1, z));
}

/** a から 東西南北 1 歩〔dx, dz〕: 同じ 高さ・1 下 → 行ける。1 上 → 自動ジャンプ〔足から 上 4 マスが 体の 通る マス〕。2 以上 → 歩けない */
export function stepTo(g: GenCols, a: Pt, dx: number, dz: number): Pt | null {
  const x = a.x + dx;
  const z = a.z + dz;
  if (standable(g, x, a.y, z)) return { x, y: a.y, z };
  if (standable(g, x, a.y - 1, z) && isBodyIndex(g.at(x, a.y + 1, z))) return { x, y: a.y - 1, z };
  if (standable(g, x, a.y + 1, z) && isBodyIndex(g.at(a.x, a.y + 2, a.z)) && isBodyIndex(g.at(a.x, a.y + 3, a.z))) return { x, y: a.y + 1, z };
  return null;
}

export interface Box3 {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** from から 歩いて 行ける マス〔はんい box の 中。distance つき〕。limit 個で 打ちきる */
export function walkDist(g: GenCols, from: Pt, box: Box3, limit = 80_000): Map<string, number> {
  const dist = new Map<string, number>();
  if (!standable(g, from.x, from.y, from.z)) return dist;
  dist.set(ptKey(from), 0);
  let frontier: Pt[] = [from];
  while (frontier.length > 0 && dist.size < limit) {
    const next: Pt[] = [];
    for (const a of frontier) {
      const d = dist.get(ptKey(a))!;
      for (const [dx, dz] of FOUR) {
        const b = stepTo(g, a, dx, dz);
        if (!b || b.x < box.x0 || b.x > box.x1 || b.z < box.z0 || b.z > box.z1) continue;
        const k = ptKey(b);
        if (dist.has(k)) continue;
        dist.set(k, d + 1);
        next.push(b);
      }
    }
    frontier = next;
  }
  return dist;
}

/** a から b へも b から a へも 歩いて 行ける〔上りの ほうが きびしいので かならず 両方〕 */
export function bothWays(g: GenCols, a: Pt, b: Pt, box: Box3): boolean {
  return walkDist(g, a, box).has(ptKey(b)) && walkDist(g, b, box).has(ptKey(a));
}

export const boxAround = (s: Shaft, margin = 8): Box3 => ({ x0: s.box.x0 - margin, x1: s.box.x1 + margin, z0: s.box.z0 - margin, z1: s.box.z1 + margin });

// ------------------------------------------------------------------ 坑道の 形・安全〔C3・C4・C5〕。直した ほうが よい 所を 文で 返す〔空なら 合格〕

const PLANT_IDS: readonly string[] = ['log', 'leaves', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'kusa', 'nobana', 'bamboo', 'susuki'];
export const isPlantId = (id: string): boolean => PLANT_IDS.includes(id);

/** 道の 足の マスの 集まり〔部分ごと〕 */
export function pathIndex(path: PathCell[]): { all: Set<string>; byPart: Map<PathPart, PathCell[]> } {
  const all = new Set<string>();
  const byPart = new Map<PathPart, PathCell[]>();
  for (const c of path) {
    all.add(ptKey(c));
    (byPart.get(c.part) ?? byPart.set(c.part, []).get(c.part)!).push(c);
  }
  return { all, byPart };
}

/** 4 方向で つながった かたまり〔段差 1 まで〕に 分ける */
export function components(cells: readonly Pt[]): Pt[][] {
  const by = new Map<string, Pt>(cells.map((c) => [ptKey(c), c]));
  const seen = new Set<string>();
  const out: Pt[][] = [];
  for (const c of cells) {
    if (seen.has(ptKey(c))) continue;
    const comp: Pt[] = [];
    const stack = [c];
    seen.add(ptKey(c));
    while (stack.length > 0) {
      const a = stack.pop()!;
      comp.push(a);
      for (const [dx, dz] of FOUR) {
        for (const dy of [0, 1, -1]) {
          const n = by.get(ptKey({ x: a.x + dx, y: a.y + dy, z: a.z + dz }));
          if (n && !seen.has(ptKey(n))) {
            seen.add(ptKey(n));
            stack.push(n);
          }
        }
      }
    }
    out.push(comp);
  }
  return out;
}

export const bbox = (cs: readonly Pt[]): { w: number; d: number; x0: number; x1: number; z0: number; z1: number } => {
  const xs = cs.map((c) => c.x);
  const zs = cs.map((c) => c.z);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  return { w: x1 - x0 + 1, d: z1 - z0 + 1, x0, x1, z0, z1 };
};

/** C3: 道の 形〔上 4 マス・はば 3・2 マスで 1 段・おどりばは 平ら・へや〕 */
export function shapeProblems(g: GenCols, s: Shaft, path: PathCell[]): string[] {
  const bad: string[] = [];
  const { byPart } = pathIndex(path);
  const chestSet = new Set((s.chest?.cells ?? []).map(ptKey));
  for (const c of path) {
    for (let k = chestSet.has(ptKey(c)) ? 1 : 0; k < 4; k++) if (!isBodyIndex(g.at(c.x, c.y + k, c.z))) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z}) の 上 ${k} マス目が 体の 通る マスでない: ${g.id(c.x, c.y + k, c.z)}`);
  }
  // さか道: 1 本ごとに かたまり。y ごとの 輪切りが はば 3 × おく 1〜2
  const ramps = components(byPart.get('ramp') ?? []);
  if (ramps.length === 0) bad.push('さか道が ない');
  const lowest = Math.min(...ramps.map((r) => Math.min(...r.map((c) => c.y))));
  for (const r of ramps) {
    const ys = new Set(r.map((c) => c.y));
    let thin = 0; // おくが 2 でない 段〔はしの 段だけ ゆるす〕
    for (const y of ys) {
      const slice = r.filter((c) => c.y === y);
      const b = bbox(slice);
      const across = Math.max(b.w, b.d);
      const along = Math.min(b.w, b.d);
      if (across !== 3 || along > 2 || slice.length !== b.w * b.d) bad.push(`さか道 y ${y}: 輪切りが はば 3 × おく 1〜2 の 四角でない（${b.w}×${b.d}・${slice.length} マス）`);
      if (along !== 2) thin++;
    }
    const b = bbox(r);
    const len = Math.max(b.w, b.d);
    const isLowest = Math.min(...r.map((c) => c.y)) === lowest;
    if (thin > 2) bad.push(`さか道: 2 マスで 1 段 でない 段が ${thin} つ（はしの 2 つまで）`);
    if (ys.size > 12 || (!isLowest && ys.size < 8)) bad.push(`さか道の 段の 数 ${ys.size}（8〜12 の はず。いちばん 下は 12 まで）`);
    if (!isLowest && (len < 16 || len > 24)) bad.push(`さか道の 長さ ${len}（16〜24 の はず。y ${Math.min(...r.map((c) => c.y))}〜）`);
    if (isLowest && len > 24) bad.push(`いちばん 下の さか道の 長さ ${len}（24 まで）`);
  }
  // 段差は 1 まで〔道の となりあう マス〕
  const idx = new Map(path.map((c) => [ptKey(c), c]));
  for (const c of path) for (const [dx, dz] of FOUR) for (const dy of [2, -2]) if (idx.has(ptKey({ x: c.x + dx, y: c.y + dy, z: c.z + dz }))) bad.push(`段差 2 以上: (${c.x}, ${c.y}, ${c.z}) と (${c.x + dx}, ${c.y + dy}, ${c.z + dz})`);
  // おどりば: 平ら・7×3
  for (const l of components(byPart.get('landing') ?? [])) {
    const ys = new Set(l.map((c) => c.y));
    const b = bbox(l);
    if (ys.size !== 1) bad.push(`おどりばが 平らでない（y ${[...ys].join(',')}）`);
    if (!((b.w === 7 && b.d === 3) || (b.w === 3 && b.d === 7))) bad.push(`おどりばが 7×3 でない（${b.w}×${b.d}）`);
  }
  // いちばん 下の へや: 足 y 41〜46・9×9・高さ 5
  const r = s.room;
  if (r.y < 41 || r.y > 46) bad.push(`へやの 足 y ${r.y}（41〜46 の はず）`);
  if (r.x1 - r.x0 + 1 !== 9 || r.z1 - r.z0 + 1 !== 9) bad.push(`へやが 9×9 でない（${r.x1 - r.x0 + 1}×${r.z1 - r.z0 + 1}）`);
  for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) for (let k = chestSet.has(ptKey({ x, y: r.y, z })) ? 1 : 0; k < 5; k++) if (!isBodyIndex(g.at(x, r.y + k, z))) bad.push(`へやの (${x}, ${r.y + k}, ${z}) が 体の 通る マスでない: ${g.id(x, r.y + k, z)}`);
  return bad;
}

/** C4 の うち 形の 安全: 床・かべ・天井 */
export function wallProblems(g: GenCols, s: Shaft, path: PathCell[]): string[] {
  const bad: string[] = [];
  const open = new Set<string>(); // 道の 空気の マス
  for (const c of path) for (let k = 0; k < 4; k++) open.add(ptKey({ x: c.x, y: c.y + k, z: c.z }));
  const chestCells = new Set((s.chest?.cells ?? []).map(ptKey));
  const mouths = [s.entrance, ...s.sides.flatMap((d) => [d.from, d.to])];
  const nearMouth = (p: Pt): boolean => mouths.some((m) => Math.abs(m.x - p.x) <= 2 && Math.abs(m.z - p.z) <= 2 && Math.abs(m.y - p.y) <= 6);
  for (const c of path) {
    // 床: 足の マスの 下 2 マス
    for (const d of [1, 2]) if (!isSolidIndex(g.at(c.x, c.y - d, c.z))) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z}) の 下 ${d} マスが 固くない: ${g.id(c.x, c.y - d, c.z)}`);
    if (c.part === 'entrance') continue; // 入口〔わくと 屋根。外へ ひらく〕
    // かべ・天井: 道の 空気の まわり 1 マス
    for (let k = 0; k < 5; k++) {
      for (const [dx, dz] of FOUR) {
        const p = { x: c.x + dx, y: c.y + k, z: c.z + dz };
        if (k === 4 || open.has(ptKey(p)) || nearMouth(p) || chestCells.has(ptKey(p))) continue;
        if (!isSolidIndex(g.at(p.x, p.y, p.z))) bad.push(`かべ (${p.x}, ${p.y}, ${p.z}) が 固くない: ${g.id(p.x, p.y, p.z)}（${c.part} の となり）`);
      }
      if (k === 4) {
        const p = { x: c.x, y: c.y + 4, z: c.z };
        if (!open.has(ptKey(p)) && !nearMouth(p) && !isSolidIndex(g.at(p.x, p.y, p.z))) bad.push(`天井 (${p.x}, ${p.y}, ${p.z}) が 固くない: ${g.id(p.x, p.y, p.z)}`);
      }
    }
  }
  return bad;
}

/** C4: 入口の まわり 8 マス〔と 山の まわり 8 マス〕に 4 以上 落ちる ふち〔立てる マスの となりの 立てる マスが 4 以上 低い〕が ない */
export function ledgeProblems(g: GenCols, s: Shaft): string[] {
  const bad: string[] = [];
  const e = s.entrance;
  const inRegion = (x: number, z: number): boolean => (Math.abs(x - e.x) <= 8 && Math.abs(z - e.z) <= 8) || (s.mound !== null && Math.abs(x - s.mound.x) <= s.mound.width / 2 + 8 && Math.abs(z - s.mound.z) <= s.mound.width / 2 + 8);
  const x0 = Math.min(e.x - 8, s.mound ? s.mound.x - s.mound.width / 2 - 8 : e.x);
  const x1 = Math.max(e.x + 8, s.mound ? s.mound.x + s.mound.width / 2 + 8 : e.x);
  const z0 = Math.min(e.z - 8, s.mound ? s.mound.z - s.mound.width / 2 - 8 : e.z);
  const z1 = Math.max(e.z + 8, s.mound ? s.mound.z + s.mound.width / 2 + 8 : e.z);
  for (let x = Math.floor(x0); x <= x1; x++) {
    for (let z = Math.floor(z0); z <= z1; z++) {
      if (!inRegion(x, z)) continue;
      for (let y = e.y - 8; y <= e.y + 12; y++) {
        if (!standable(g, x, y, z)) continue;
        for (const [dx, dz] of FOUR) {
          // となりの 列で、y+1 から 下へ 見て はじめて 立てる マス
          let found = -1;
          for (let yy = y + 1; yy >= y - 40; yy--) {
            if (standable(g, x + dx, yy, z + dz)) {
              found = yy;
              break;
            }
          }
          if (found !== -1 && found <= y - 4) bad.push(`ふち (${x}, ${y}, ${z}) → (${x + dx}, ${found}, ${z + dz}) が ${y - found} 下がる`);
        }
      }
    }
  }
  return bad;
}

/** C4: 道さがし〔行き来 できる〕。入口と へや・横穴の 出口・こべやが 歩いて 行き来 できる */
export function walkProblems(g: GenCols, s: Shaft, path: PathCell[]): string[] {
  const bad: string[] = [];
  const box = boxAround(s, 12);
  const { all } = pathIndex(path);
  const from = { x: s.entrance.x, y: s.entrance.y, z: s.entrance.z };
  const ok = (what: string, p: Pt): void => {
    if (!bothWays(g, from, p, box)) bad.push(`入口と ${what} (${p.x}, ${p.y}, ${p.z}) が 行き来 できない`);
  };
  // へやの おくの かべの まん中の 前〔宝箱が あれば 前の 2 マス〕
  if (s.chest) {
    const v = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[s.chest.front];
    for (const c of s.chest.cells) ok('宝箱の 前', { x: c.x + v[0]!, y: c.y, z: c.z + v[1]! });
  } else {
    ok('へやの まん中', { x: (s.room.x0 + s.room.x1) >> 1, y: s.room.y, z: (s.room.z0 + s.room.z1) >> 1 });
  }
  // 横穴: 出口の 外の ほらあなの 床〔出口から 4 歩 以上〕と 行き来。こべやは 先の 床
  for (const d of s.sides) {
    ok(`横穴 ${d.end} の 先`, d.to);
    if (d.end === 'koheya') continue;
    const out = walkDist(g, d.to, box);
    let found = false;
    for (const [k, dist] of out) {
      if (dist < 4 || all.has(k)) continue;
      const [x, y, z] = k.split(',').map(Number) as [number, number, number];
      if (walkDist(g, { x, y, z }, box).has(ptKey(d.to))) {
        found = true;
        break;
      }
    }
    if (!found) bad.push(`横穴 (${d.to.x}, ${d.to.y}, ${d.to.z}) の 外に、出口から 4 歩 以上 先で 出口へ もどれる ほらあなの 床が ない`);
  }
  return bad;
}

/** C5: 明るい〔作った ときの 足の マス ぜんぶで ブロックの 光 6 以上・妖怪が 出ない〕。たいまつは ふつうの `torch` */
export function lightProblems(g: GenCols, s: Shaft, path: PathCell[]): string[] {
  const bad: string[] = [];
  const light = g.lit(s.box);
  for (const c of path) {
    const id = g.id(c.x, c.y, c.z);
    if (id === 'start_torch') bad.push(`こわれない たいまつ (${c.x}, ${c.y}, ${c.z})`);
    const l = light.blockLight(c.x, c.y, c.z);
    if (l < 6) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z}) の ブロックの 光 ${l}（6 以上）`);
    if (light.isDarkForSpawn(c.x, c.y, c.z)) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z}) は 妖怪が 出る 暗さ`);
  }
  return bad;
}

/** 箱の 中の ブロックを 数える */
export function countIn(g: GenCols, box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }, ids: readonly string[]): number {
  let n = 0;
  for (let x = box.x0; x <= box.x1; x++) for (let y = box.y0; y <= box.y1; y++) for (let z = box.z0; z <= box.z1; z++) if (ids.includes(g.id(x, y, z))) n++;
  return n;
}

/** 道に ならぶ 坑道を スタートに 近い 順に n こ〔はじまり ＋ ほか〕 */
export function sampleShafts(seed: number, others: number, o: { oldCols?: OldCols } = {}): { seed: number; hook: MineHook1C; g: GenCols; shafts: Shaft[] } {
  const hook = hook1c(seed, o);
  const sp = spawnOf(seed);
  const start = hook.startShaft();
  const near = hook
    .shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535)
    .filter((s) => !s.start)
    .sort((a, b) => Math.hypot(a.entrance.x - sp.x, a.entrance.z - sp.z) - Math.hypot(b.entrance.x - sp.x, b.entrance.z - sp.z))
    .slice(0, others);
  return { seed, hook, g: new GenCols(seed, o.oldCols), shafts: [start, ...near] };
}

/** blockId の 型の ため〔文字を BlockId に〕 */
export const asBlock = (id: string): BlockId => id as BlockId;

/** 坑道〔道・山。まわり 2 マス〕が かかる 列の 一覧〔colKey〕。古い 列に かかるか・形を 前と くらべない 列を 見分ける のに 使う〕 */
export function touchedColKeys(s: Shaft, path: readonly { x: number; z: number }[]): Set<number> {
  const out = new Set<number>();
  const add = (x: number, z: number): void => {
    for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) out.add(colKey((x + dx) >> 4, (z + dz) >> 4));
  };
  for (const c of path) add(c.x, c.z);
  if (s.mound) {
    const h = Math.ceil(s.mound.width / 2);
    for (let x = s.mound.x - h; x <= s.mound.x + h; x += 2) for (let z = s.mound.z - h; z <= s.mound.z + h; z += 2) add(Math.round(x), Math.round(z));
  }
  return out;
}

/**
 * ある シードで、坑道〔はじまり ＋ 区画の ほか〕が かかる 列。窓口が まだ 無い〔1C が 入る 前〕ときは 空〔どの 列も かからない〕。
 * 坑道が かかる 列は 「前の 作り方と 同じ」を くらべない 確かめ〔mineOres.test.ts の A4 など〕で 外す。範囲は 世界の ブロック座標。
 */
export function shaftCoveredCols(seed: number, x0: number, z0: number, x1: number, z1: number): Set<number> {
  const out = new Set<number>();
  const h = hook1c(seed);
  if (typeof (h as Partial<MineHook1C>).startShaft !== 'function' || typeof (h as Partial<MineHook1C>).shafts !== 'function') return out;
  for (const s of [h.startShaft(), ...h.shafts(x0, z0, x1, z1)]) for (const k of touchedColKeys(s, h.shaftPath(s.id))) out.add(k);
  return out;
}
