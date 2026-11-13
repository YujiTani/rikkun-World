import type { ItemId, Rarity } from '../../contracts';
import { ITEM_DEFS } from '../../content/items/registry';
import { RARITY_ORDER, rarityTier } from '../../drops/rarityTable';
import { YAKATA_BLOCK_IDS } from '../blocks/mineYakata';
import { chestTableOf, pickTier } from './mineChestTable';
import type { ChestRoll, ChestTable, Tier } from './mineShaftTypes';
import { createRng, hash01, hashInts } from './random';

/**
 * 宝箱の くじ（MINE-1C。docs/design/MINE-1.md §4.6）。くじの 箱 ＝ 登録表の アイテム ぜんぶ から のぞく 物を ひいた もの。
 * 3 つの くじの 設定（はらぱん・忍者・侍）は 引かない（中身は ぜんぶ くじの 箱から）。
 */

/** くじの 箱から のぞく 物と 理由（#304: 1 か所の 表に 理由つきで） */
const EXCLUDED = [
  { item: 'yokai_orb', reason: 'ようかいダマは 妖怪と 実績で もらう 物。宝箱から 出ると たからばこ と ぐるぐる 回る（TOWN-1 §2.3 の 5）' },
  { item: 'omamori_torn', reason: 'しるし ＝ 記念の 品（やぶれた おまもり）' },
  { item: 'kabita_pan', reason: 'じょうだんの 物。宝箱から 出ると がっかり する（キャンプあとの たんす だけ）' },
  ...YAKATA_BLOCK_IDS.map((item) => ({ item, reason: 'やかたを かちぬいた しるし。宝箱から 出ない' })), // MINE-1F: やかたの ブロック 8 こ
  { item: 'sekkeizu', reason: '1 まいずつ 中身〔plan の 番号〕を もつ 物。宝箱から 出ると 読めない せっけいずに なる' },
  { item: 'recipe_scroll', reason: 'レシピの まきもの（HOUSE-2A）は 坑道の いちばん 下の へやで 1 まい だけ。宝箱には 別の わくが 1 つ ふえる ので、ふつうの くじには 入れない（くじの 当たり方も かえない）' },
  { item: 'maneki', reason: 'レシピ（まねきねこ）を おぼえて 家の エディターで 置く 物（HOUSE-2A。世界に 置く ブロックは HOUSE-2B で できる まで 宝箱には 出さない。今の くじの 当たり方も かえない）' },
] as const satisfies readonly { item: ItemId; reason: string }[];

export function chestExcluded(): { item: ItemId; reason: string }[] {
  return EXCLUDED.map((e) => ({ item: e.item, reason: e.reason }));
}

let poolMemo: Record<Rarity, ItemId[]> | null = null;

/** めずらしさごとの くじの 箱 */
export function chestPool(): Record<Rarity, ItemId[]> {
  if (!poolMemo) {
    const skip = new Set<string>(EXCLUDED.map((e) => e.item));
    const out = Object.fromEntries(RARITY_ORDER.map((r) => [r, [] as ItemId[]])) as Record<Rarity, ItemId[]>;
    for (const [id, def] of Object.entries(ITEM_DEFS)) if (!skip.has(id)) out[def.rarity].push(id as ItemId);
    poolMemo = out;
  }
  return Object.fromEntries(RARITY_ORDER.map((r) => [r, [...poolMemo![r]]])) as Record<Rarity, ItemId[]>;
}

/** その めずらしさの 物が ない ときは 1 つ 下に */
function poolFor(pool: Record<Rarity, ItemId[]>, rarity: Rarity): ItemId[] {
  let k = RARITY_ORDER.indexOf(rarity);
  while (k > 0 && pool[RARITY_ORDER[k]!].length === 0) k--;
  return pool[RARITY_ORDER[k]!];
}

function pickRarity(row: Partial<Record<Rarity, number>>, r: number): Rarity {
  let acc = 0;
  let last: Rarity = 'common';
  for (const id of RARITY_ORDER) {
    const w = row[id];
    if (!w) continue;
    last = id;
    acc += w;
    if (r < acc) return id;
  }
  return last;
}

/** 宝箱 1 つ 分の くじ。tier を わたすと その 段で 引く。同じ (表, seed, 段) は いつも 同じ */
export function rollChest(table: string | ChestTable, seed: number, tier?: Tier): ChestRoll {
  const T = typeof table === 'string' ? chestTableOf(table) : table;
  const t = tier ?? pickTier(T, hash01(seed, 1, 2));
  const row = T.tiers.find((x) => x.tier === t)!;
  const rng = createRng(hashInts(seed, 3, t));
  const pool = chestPool();
  const items: { item: ItemId; count: number }[] = [];
  const take = (rarity: Rarity): void => {
    const list = poolFor(pool, rarity);
    const item = list[Math.floor(rng() * list.length)]!;
    const def = ITEM_DEFS[item as keyof typeof ITEM_DEFS];
    const cap = def.maxStack > 1 ? rarityTier(def.rarity).dropMax : 1;
    items.push({ item, count: 1 + Math.floor(rng() * cap) });
  };
  const random = row.slots - (row.sure ? 1 : 0);
  for (let i = 0; i < random; i++) {
    if (rng() < T.legendary) take('legendary');
    else take(pickRarity(row.rarity, rng()));
  }
  if (row.sure) take(row.sure);
  return { tier: t, items };
}
