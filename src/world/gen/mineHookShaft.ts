import type { BlockId, ItemId, Rarity, VoxelWorld } from '../../contracts';
import { itemDef } from '../../content/items/registry';
import { RARITY_ORDER } from '../../drops/rarityTable';
import { BOKEN_GEN, HEYA_GEN, KODO_GEN, SAVE_GEN, YAKATA_GEN } from '../../save/gens';
import { EMISSION } from '../light/opacity';
import { isMakimonoId } from '../blocks/blockTypes';
import { chestBlockId, chestBlockInfo, chestFrontAt, chestPartner, type ChestCompass } from '../blocks/chestBlock';
import { terrainFor } from './terrain';
import { colKey } from '../stream/ring';
import { buildBlocks } from './chunk';
import { chestExcluded, chestPool, rollChest } from './mineChest';
import { chestSeed, chestTableOf } from './mineChestTable';
import type { OldCols } from './mineShaftOps';
import { shaftWorldFor } from './mineShafts';
import { createBokenHook } from './mineHookBoken';
import { createCaveHook } from './mineHookCave';
import type { ChestRoll, ChestTable, PathCell, Pt, Shaft, ShaftRoll, Tier } from './mineShaftTypes';

/**
 * 坑道・宝箱・保存の 窓口（MINE-1C。docs/design/MINE-1.md §6.1）。`createMineHook` が まとめて 返す。
 * 世界を 読む 側〔chestAt・open〕は いきている 世界（`world`）を 読む。計画から 答える 側〔shafts など〕は 生成の 計算だけ。
 */

/** 宝箱を あけた ときの 出口〔ゲームの つなぎ込みが 本物を わたす〕 */
export interface ChestPorts {
  /** 持ち物に 入れる。入りきらなかった 数を 返す */
  add(item: ItemId, count: number): number;
  /** 足もとに 落とし物 */
  drop(item: ItemId, count: number): void;
  /** ログ */
  say(text: string): void;
  /** ハイパーレア 以上の テロップ〔いちばん めずらしい 物 1 つ〕 */
  telop(item: ItemId): void;
  /** あけた 出来事〔実績〕 */
  opened(tier: Tier): void;
  /** HOUSE-2A: レシピを 1 まい 見つけた（坑道の いちばん 下の へやの 宝箱を はじめて あけた・まきものを とった とき 1 回だけ。at ＝ shaft.recipe の マス）。持ち物は 使わない */
  recipe?(at: { x: number; y: number; z: number }): void;
}

export interface ChestAtInfo {
  table: string;
  tier: Tier;
  opened: boolean;
  main: Pt;
  cells: Pt[];
  front: ChestCompass;
}

export type ChestWorld = Pick<VoxelWorld, 'getBlock'> & Partial<Pick<VoxelWorld, 'setBlock' | 'isLoaded'>>;

export interface ShaftHookOptions {
  seed: number;
  world?: ChestWorld;
  oldCols?: OldCols;
  /** 世界ごとに 1 つ だけ 作った 坑道の 世界（つなぎ込みが わたす。なければ oldCols から 引く） */
  shafts?: ShaftWorldType;
  metaGen?: () => number | null;
  /** 坑道の 版（つなぎ込みが SaveManager.KODO_GEN を わたす。なければ gens.ts の 値） */
  kodoGen?: number;
  /** 1E の 版〔つなぎ込みが SaveManager.BOKEN_GEN を わたす。なければ gens.ts の 値〕 */
  bokenGen?: number;
  chest?: ChestPorts;
  /** 1E: その マスの たんすの 記録が すでに あるか〔キャンプの たんすの 予告を 消す〕 */
  tansuHas?: (x: number, y: number, z: number) => boolean;
}

const SUPER = RARITY_ORDER.indexOf('superRare');
const idxOf = (r: Rarity): number => RARITY_ORDER.indexOf(r);

/** 宝箱の 中身を 持ち物へ〔入りきらない 分は 足もと〕・いちばん めずらしい 物が ハイパーレア 以上なら テロップ・あけた できごと */
export function giveChest(chest: ChestPorts, items: readonly { item: ItemId; count: number }[], tier: Tier): void {
  let top: { item: ItemId; r: number } | null = null;
  for (const it of items) {
    const rest = chest.add(it.item, it.count);
    if (rest > 0) chest.drop(it.item, rest);
    const r = idxOf(itemDef(it.item)!.rarity);
    if (top === null || r > top.r) top = { item: it.item, r };
  }
  if (top && top.r >= SUPER) chest.telop(top.item);
  chest.opened(tier);
}

export function createShaftHook(o: ShaftHookOptions) {
  const { seed } = o;
  const world = (): ShaftWorldType => o.shafts ?? shaftWorldFor(seed, o.oldCols);
  const cave = createCaveHook(world, () => {
    const sp = terrainFor(seed).spawn();
    return { x: sp.x, z: sp.z };
  });

  function chestAt(x: number, y: number, z: number): ChestAtInfo | null {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (!o.world) {
      // 生きている 世界が ない〔計画だけ 読む テストなど〕: やかたの 宝箱は 計画から 答える〔まだ あいていない〕
      const yk = world().yakataBuilt(bx, by, bz)?.yakata;
      const c = yk?.chest;
      if (!yk || !c || !c.cells.some((p) => p.x === bx && p.y === by && p.z === bz)) return null;
      return { table: 'yakata', tier: 4, opened: false, main: { x: c.x, y: c.y, z: c.z }, cells: c.cells.map((p) => ({ ...p })), front: c.front };
    }
    const info = chestBlockInfo(o.world.getBlock(bx, by, bz));
    if (!info) return null;
    const front = chestFrontAt((px, py, pz) => o.world!.getBlock(px, py, pz), bx, by, bz);
    if (!front) return null;
    const other = chestPartner(bx, bz, info, front);
    const mainXZ = info.rest ? other : { x: bx, z: bz };
    const restXZ = info.rest ? { x: bx, z: bz } : other;
    const main = { x: mainXZ.x, y: by, z: mainXZ.z };
    const table = plannedChest(main.x, main.y, main.z)?.table ?? 'kodo';
    return { table, tier: info.tier, opened: info.open, main, cells: [main, { x: restXZ.x, y: by, z: restXZ.z }], front };
  }

  /** 計画から 宝箱を さがす（世界を 読まない。あける 前と あとで 同じ）。表の 名前も 返す */
  function plannedChest(x: number, y: number, z: number): { table: string; tier: Tier; main: Pt } | null {
    const yk = world().yakataBuilt(x, y, z)?.yakata;
    if (yk && yk.chest.cells.some((p) => p.x === x && p.y === y && p.z === z)) return { table: 'yakata', tier: 4, main: { x: yk.chest.x, y: yk.chest.y, z: yk.chest.z } };
    for (const s of world().shafts(x, z, x, z)) {
      const c = s.chest;
      if (c && c.cells.some((p) => p.x === x && p.y === y && p.z === z)) return { table: 'kodo', tier: c.tier, main: { x: c.x, y: c.y, z: c.z } };
      for (const e of [...s.branches.map((b) => b.end), ...(s.maze?.deadEnds ?? [])]) {
        const q = e.chest;
        if (q && q.cells.some((p) => p.x === x && p.y === y && p.z === z)) return { table: e.kind === 'hibi_oo' ? 'kodo_kakushi' : 'kodo_eda', tier: q.tier, main: { x: q.x, y: q.y, z: q.z } };
      }
    }
    return null;
  }

  function previewOf(table: string, tier: Tier, main: Pt): ChestRoll {
    return rollChest(table, chestSeed(seed, main.x, main.y, main.z), tier);
  }

  function chestPreview(x: number, y: number, z: number): ChestRoll | null {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    const at = chestAt(bx, by, bz);
    if (at) return previewOf(at.table, at.tier, at.main);
    const p = plannedChest(bx, by, bz);
    return p ? previewOf(p.table, p.tier, p.main) : null;
  }

  /** その 坑道の レシピが もう とられて いるか（いきている 世界を 読む。まきものは 世界の 列が 読みこまれて いて ブロックが 消えて いる とき。読みこまれて いなければ false） */
  function recipeTaken(r: Shaft['recipe']): boolean {
    const w = o.world;
    if (!w) return false;
    if (r.kind === 'chest') return chestBlockInfo(w.getBlock(r.x, r.y, r.z))?.open === true;
    return (w.isLoaded?.(r.x, r.z) ?? true) && !isMakimonoId(w.getBlock(r.x, r.y, r.z));
  }

  /** まきものを とる（右クリック）: ブロックを 消して レシピを 1 まい。持ち物は 使わない。まきものでなければ false */
  function openScroll(x: number, y: number, z: number): boolean {
    if (!o.world || !isMakimonoId(o.world.getBlock(x, y, z))) return false;
    o.world.setBlock?.(x, y, z, 'air');
    o.chest?.recipe?.({ x, y, z });
    return true;
  }

  function open(x: number, y: number, z: number): void {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (openScroll(bx, by, bz)) return;
    const at = chestAt(x, y, z);
    if (!at || !o.chest) return;
    if (at.opened) {
      o.chest.say('からっぽ だよ');
      return;
    }
    const roll = previewOf(at.table, at.tier, at.main);
    // 先に ブロックを あいた 形に する〔出口が 世界を さわっても 2 回 あかない〕
    if (o.world!.setBlock) {
      at.cells.forEach((c, i) => o.world!.setBlock!(c.x, c.y, c.z, chestBlockId(at.tier, true, i === 1) as BlockId));
    }
    giveChest(o.chest, roll.items, at.tier);
    if (at.table === 'kodo') o.chest.recipe?.({ x: at.main.x, y: at.main.y, z: at.main.z }); // いちばん 下の へやの 宝箱だけ レシピの わくが 1 つ（横穴の 先の 宝箱には ない）
  }

  /** 坑道の 計画に、いきている 世界から taken を 足して 返す（計画は かえない） */
  function withTaken(s: Shaft): Shaft {
    return { ...s, recipe: { ...s.recipe, taken: recipeTaken(s.recipe) } };
  }

  return {
    shafts: (x0: number, z0: number, x1: number, z1: number): Shaft[] => world().shafts(x0, z0, x1, z1).map(withTaken),
    startShaft: (): Shaft | null => {
      const s = world().start()?.plan.shaft;
      return s ? withTaken(s) : null;
    },
    shaftPath: (id: string): PathCell[] => world().path(id),
    shaftRolls: (x0: number, z0: number, x1: number, z1: number): ShaftRoll[] => world().rolls(x0, z0, x1, z1),
    chestAt,
    chestTable: (name: string): ChestTable => chestTableOf(name),
    chestPool,
    chestExcluded,
    rollChest,
    chestPreview,
    open,
    caveAt: (x: number, y: number, z: number): string | null => (world().yakataAt(Math.floor(x), Math.floor(y), Math.floor(z)) ? 'yakata' : world().inside(Math.floor(x), Math.floor(y), Math.floor(z)) ? 'kodo' : cave.caveKindAt(x, y, z)),
    /** 坑道の 世界〔やかたの 窓口が 使う〕 */
    shaftWorld: (): ShaftWorldType => world(),
    ...cave,
    ...createBokenHook({ seed, world, tansuHas: o.tansuHas }),
    saveGens: () => ({ current: SAVE_GEN, meta: o.metaGen?.() ?? SAVE_GEN, kodo: (o.kodoGen ?? KODO_GEN) as number | null, heya: HEYA_GEN as number | null, boken: (o.bokenGen ?? BOKEN_GEN) as number | null, yakata: YAKATA_GEN as number | null }),
    oldCols: (kind: 'kodo' | 'heya' | 'boken' | 'yakata'): number => o.oldCols?.[kind]?.size ?? 0,
    isOld: (kind: 'kodo' | 'heya' | 'boken' | 'yakata', cx: number, cz: number): boolean => o.oldCols?.[kind]?.has(colKey(cx, cz)) === true,
    work(cx: number, cz: number): { shaftRegions: number; caveRegions: number; emitters: number } {
      const b = buildBlocks(seed, cx, cz, undefined, o.oldCols).blocks;
      let emitters = 0;
      for (let i = 0; i < b.length; i++) if (EMISSION[b[i]!]! > 0) emitters++;
      return { shaftRegions: world().regionCount(cx, cz), caveRegions: world().touchesRoom(cx, cz) ? 1 : 0, emitters };
    },
    /** 坑道が かかる 列か（かかる 列は 「ふつうの 列」ではない） */
    touchesShaft: (cx: number, cz: number): boolean => world().touches(cx, cz),
    /** ほらあなの 種類の 部屋が かかる 列か（地下の 中身が かわる） */
    touchesRoom: (cx: number, cz: number): boolean => world().touchesRoom(cx, cz),
  };
}

type ShaftWorldType = ReturnType<typeof shaftWorldFor>;
export type ShaftHook = ReturnType<typeof createShaftHook>;
