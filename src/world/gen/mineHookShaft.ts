import type { BlockId, ItemId, Rarity, VoxelWorld } from '../../contracts';
import { itemDef } from '../../content/items/registry';
import { RARITY_ORDER } from '../../drops/rarityTable';
import { HEYA_GEN, KODO_GEN, SAVE_GEN } from '../../save/gens';
import { EMISSION } from '../light/opacity';
import { chestBlockId, chestBlockInfo, chestFrontAt, chestPartner, type ChestCompass } from '../blocks/chestBlock';
import { terrainFor } from './terrain';
import { colKey } from '../stream/ring';
import { buildBlocks } from './chunk';
import { chestExcluded, chestPool, rollChest } from './mineChest';
import { chestSeed, chestTableOf } from './mineChestTable';
import { shaftWorldFor, type OldCols } from './mineShafts';
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
}

export interface ChestAtInfo {
  table: string;
  tier: Tier;
  opened: boolean;
  main: Pt;
  cells: Pt[];
  front: ChestCompass;
}

type ChestWorld = Pick<VoxelWorld, 'getBlock'> & Partial<Pick<VoxelWorld, 'setBlock'>>;

export interface ShaftHookOptions {
  seed: number;
  world?: ChestWorld;
  oldCols?: OldCols;
  /** 世界ごとに 1 つ だけ 作った 坑道の 世界（つなぎ込みが わたす。なければ oldCols から 引く） */
  shafts?: ShaftWorldType;
  metaGen?: () => number | null;
  /** 坑道の 版（つなぎ込みが SaveManager.KODO_GEN を わたす。なければ gens.ts の 値） */
  kodoGen?: number;
  chest?: ChestPorts;
}

const SUPER = RARITY_ORDER.indexOf('superRare');
const idxOf = (r: Rarity): number => RARITY_ORDER.indexOf(r);

export function createShaftHook(o: ShaftHookOptions) {
  const { seed } = o;
  const world = (): ShaftWorldType => o.shafts ?? shaftWorldFor(seed, o.oldCols);
  const cave = createCaveHook(world, () => {
    const sp = terrainFor(seed).spawn();
    return { x: sp.x, z: sp.z };
  });

  function chestAt(x: number, y: number, z: number): ChestAtInfo | null {
    if (!o.world) return null;
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    const info = chestBlockInfo(o.world.getBlock(bx, by, bz));
    if (!info) return null;
    const front = chestFrontAt((px, py, pz) => o.world!.getBlock(px, py, pz), bx, by, bz);
    if (!front) return null;
    const other = chestPartner(bx, bz, info, front);
    const mainXZ = info.rest ? other : { x: bx, z: bz };
    const restXZ = info.rest ? { x: bx, z: bz } : other;
    const main = { x: mainXZ.x, y: by, z: mainXZ.z };
    return { table: 'kodo', tier: info.tier, opened: info.open, main, cells: [main, { x: restXZ.x, y: by, z: restXZ.z }], front };
  }

  /** 計画から 宝箱を さがす（世界を 読まない。あける 前と あとで 同じ） */
  function plannedChest(x: number, y: number, z: number): { tier: Tier; main: Pt } | null {
    for (const s of world().shafts(x, z, x, z)) {
      const c = s.chest;
      if (c && c.cells.some((p) => p.x === x && p.y === y && p.z === z)) return { tier: c.tier, main: { x: c.x, y: c.y, z: c.z } };
    }
    return null;
  }

  function previewOf(tier: Tier, main: Pt): ChestRoll {
    return rollChest('kodo', chestSeed(seed, main.x, main.y, main.z), tier);
  }

  function chestPreview(x: number, y: number, z: number): ChestRoll | null {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    const at = chestAt(bx, by, bz);
    if (at) return previewOf(at.tier, at.main);
    const p = plannedChest(bx, by, bz);
    return p ? previewOf(p.tier, p.main) : null;
  }

  function open(x: number, y: number, z: number): void {
    const at = chestAt(x, y, z);
    if (!at || !o.chest) return;
    if (at.opened) {
      o.chest.say('からっぽ だよ');
      return;
    }
    const roll = previewOf(at.tier, at.main);
    // 先に ブロックを あいた 形に する〔出口が 世界を さわっても 2 回 あかない〕
    if (o.world!.setBlock) {
      at.cells.forEach((c, i) => o.world!.setBlock!(c.x, c.y, c.z, chestBlockId(at.tier, true, i === 1) as BlockId));
    }
    let top: { item: ItemId; r: number } | null = null;
    for (const it of roll.items) {
      const rest = o.chest.add(it.item, it.count);
      if (rest > 0) o.chest.drop(it.item, rest);
      const r = idxOf(itemDef(it.item)!.rarity);
      if (top === null || r > top.r) top = { item: it.item, r };
    }
    if (top && top.r >= SUPER) o.chest.telop(top.item);
    o.chest.opened(at.tier);
  }

  return {
    shafts: (x0: number, z0: number, x1: number, z1: number): Shaft[] => world().shafts(x0, z0, x1, z1),
    startShaft: (): Shaft | null => world().start()?.plan.shaft ?? null,
    shaftPath: (id: string): PathCell[] => world().path(id),
    shaftRolls: (x0: number, z0: number, x1: number, z1: number): ShaftRoll[] => world().rolls(x0, z0, x1, z1),
    chestAt,
    chestTable: (name: string): ChestTable => chestTableOf(name),
    chestPool,
    chestExcluded,
    rollChest,
    chestPreview,
    open,
    caveAt: (x: number, y: number, z: number): string | null => (world().inside(Math.floor(x), Math.floor(y), Math.floor(z)) ? 'kodo' : cave.caveKindAt(x, y, z)),
    ...cave,
    saveGens: () => ({ current: SAVE_GEN, meta: o.metaGen?.() ?? SAVE_GEN, kodo: (o.kodoGen ?? KODO_GEN) as number | null, heya: HEYA_GEN as number | null }),
    oldCols: (kind: 'kodo' | 'heya'): number => o.oldCols?.[kind]?.size ?? 0,
    isOld: (kind: 'kodo' | 'heya', cx: number, cz: number): boolean => o.oldCols?.[kind]?.has(colKey(cx, cz)) === true,
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
