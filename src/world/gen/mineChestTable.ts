import type { Rarity } from '../../contracts';
import { hash01, hashInts, subSeed } from './random';
import type { ChestTable, Tier } from './mineShaftTypes';

/**
 * 宝箱の 表（MINE-1C。docs/design/MINE-1.md §4.6）。くじの 数は ここ 1 か所。表を 1 つ 足せば ちがう 中身の 宝箱に なる（#195 の 国の 宝箱）。
 * 数は【PO 案】。オーナー確認①で 直して よい（テストは 表を 読むので かわらない）。
 */

/** 段ごとの めずらしさの わりあい（0〜1。合計 1）。ミラクルは くじで 出さず、4 段目の「かくてい」の わくだけ */
const RARITY_ROWS: Record<Tier, Partial<Record<Rarity, number>>> = {
  1: { common: 0.5, uncommon: 0.3, rare: 0.15, superRare: 0.05 },
  2: { common: 0.25, uncommon: 0.35, rare: 0.25, superRare: 0.12, epic: 0.03 },
  3: { common: 0.05, uncommon: 0.2, rare: 0.35, superRare: 0.25, epic: 0.15 },
  4: { uncommon: 0.1, rare: 0.3, superRare: 0.35, epic: 0.25 },
};

const CHEST_TABLES = {
  kodo: {
    /** 坑道ごとに 宝箱を 置く わりあい（1/3） */
    placeChance: 1 / 3,
    tiers: [
      /** 段の 出る わりあい（0〜1）・わくの 数（こ）・かくていの めずらしさ */
      { tier: 1, chance: 0.6, slots: 3, rarity: RARITY_ROWS[1], sure: null },
      { tier: 2, chance: 0.25, slots: 4, rarity: RARITY_ROWS[2], sure: null },
      { tier: 3, chance: 0.12, slots: 4, rarity: RARITY_ROWS[3], sure: null },
      { tier: 4, chance: 0.03, slots: 5, rarity: RARITY_ROWS[4], sure: 'mythic' },
    ],
    /** レジェンダリーの くじ（わくごと。0.001%） */
    legendary: 0.00001,
    /** ほかの くじ（NINJA-1 など。坑道の 表は 使わない） */
    lots: [],
  },
} as const satisfies Record<string, ChestTable>;


export function chestTableOf(name: string): ChestTable {
  const t = (CHEST_TABLES as Record<string, ChestTable>)[name];
  if (!t) throw new Error(`宝箱の 表が ない: ${name}`);
  return JSON.parse(JSON.stringify(t)) as ChestTable;
}

/** 坑道 id の 坑道に 宝箱を 置くか（はじまりの 坑道も 同じ 抽選） */
export function chestPlaced(seed: number, shaftId: string): boolean {
  let h = 0;
  for (let i = 0; i < shaftId.length; i++) h = Math.imul(h ^ shaftId.charCodeAt(i), 0x01000193);
  return hash01(subSeed(seed, 821), h | 0, 1) < CHEST_TABLES.kodo.placeChance;
}

/** 宝箱の 乱数の もと: 世界の シードと 本体の マス */
export function chestSeed(seed: number, x: number, y: number, z: number): number {
  return hashInts(subSeed(seed, 822), x, y, z);
}

/** 表から 段を 引く（r は 0 以上 1 未満） */
export function pickTier(table: ChestTable, r: number): Tier {
  let acc = 0;
  for (const t of table.tiers) {
    acc += t.chance;
    if (r < acc) return t.tier;
  }
  return table.tiers[table.tiers.length - 1]!.tier;
}

/** (x, y, z) の 宝箱の 段 */
export function chestTierAt(seed: number, x: number, y: number, z: number): Tier {
  return pickTier(chestTableOf('kodo'), hash01(chestSeed(seed, x, y, z), 1, 2));
}
