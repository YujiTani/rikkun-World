import type { ItemId } from '../../contracts';

/**
 * よろずやの ねだん表（TOWN-1-shop.md §4.2・§4.3。数は ここ 1 か所。テスト・画面・窓口は ここを 読む。#304・#311）。
 * ならびは 仕様の 表の 順（＝ 画面の カードの 順）。いちばん 後ろの 2 つは たからばこ（`SHOP_BOXES`）。
 * 品の 名前は アイテムの 登録表から 読む（写さない）。1 つの アイテムで ない 組の 品（たねの セット・かみ＋ふで）だけ 名前を 書く。
 * 〔1E〕かえりの おふだ（`kaeri_ofuda`・ねだん 3）は 1E で アイテムが できたら 「すいしょう」の あとに 1 行 足す。
 */

/** 品の しゅるい: set ＝ 書いた 物を そのまま わたす・scroll ＝ 家の レシピの まきもの（ぜんぶ おぼえたら 売り切れ） */
type ShopGoodKind = 'set' | 'scroll';

export interface ShopGive {
  item: ItemId;
  /** わたす 数（こ） */
  count: number;
}

export interface ShopGood {
  id: string;
  kind: ShopGoodKind;
  /** ねだん（ようかいダマ 何こ） */
  price: number;
  /** わたす 物（1 回 押すと 1 セット） */
  give: readonly ShopGive[];
  /** 下の 帯に 出す 数え方（「8 ほん」の「ほん」）。1 しゅるいの 品だけ */
  unit?: string;
  /** 組の 品の 名前（［漢字｜よみ］）。1 しゅるいの 品は 書かない（アイテムの 名前を 読む） */
  name?: string;
}

export const SHOP_GOODS = [
  /** たねの セット: トマト・かぼちゃ・たまねぎ・なす の たね 1 こずつ（ようかいダマ 2） */
  { id: 'tane_set', kind: 'set', price: 2, name: 'たねの セット', give: [{ item: 'seed_tomato', count: 1 }, { item: 'seed_pumpkin', count: 1 }, { item: 'seed_onion', count: 1 }, { item: 'seed_eggplant', count: 1 }] },
  /** たいまつ 8 ほん（ようかいダマ 2） */
  { id: 'torch', kind: 'set', price: 2, unit: 'ほん', give: [{ item: 'torch', count: 8 }] },
  /** むしとりあみ 1 こ（ようかいダマ 3） */
  { id: 'mushi_ami', kind: 'set', price: 3, unit: 'こ', give: [{ item: 'mushi_ami', count: 1 }] },
  /** ロープ 1 こ（ようかいダマ 3） */
  { id: 'rope', kind: 'set', price: 3, unit: 'こ', give: [{ item: 'rope', count: 1 }] },
  /** バケツ 1 こ（ようかいダマ 3） */
  { id: 'bucket', kind: 'set', price: 3, unit: 'こ', give: [{ item: 'bucket', count: 1 }] },
  /** にわとりの たまご 1 こ（ようかいダマ 5） */
  { id: 'egg', kind: 'set', price: 5, unit: 'こ', give: [{ item: 'egg', count: 1 }] },
  /** かみ 1 まい ＋ ふで 1 ぽん（ようかいダマ 5） */
  { id: 'kami_fude', kind: 'set', price: 5, name: 'かみと ふで', give: [{ item: 'paper', count: 1 }, { item: 'fude', count: 1 }] },
  /** てつ 4 こ（ようかいダマ 8） */
  { id: 'iron_ingot', kind: 'set', price: 8, unit: 'こ', give: [{ item: 'iron_ingot', count: 4 }] },
  /** きんの かたまり 2 こ（鉱石 `kin_ore` では ない。ようかいダマ 12） */
  { id: 'kin', kind: 'set', price: 12, unit: 'こ', give: [{ item: 'kin', count: 2 }] },
  /** ざいりょうの すいしょう 2 こ（かざりの ブロック `suisho` では ない。ようかいダマ 15） */
  { id: 'crystal', kind: 'set', price: 15, unit: 'こ', give: [{ item: 'crystal', count: 2 }] },
  /** 家の レシピの まきもの 1 まい（まだ おぼえて いない レシピ。読んだ とき くじ。ようかいダマ 20） */
  { id: 'recipe_scroll', kind: 'scroll', price: 20, unit: 'まい', give: [{ item: 'recipe_scroll', count: 1 }] },
  /** とくべつな かぐ: 1 版は はにわ 1 こ（ようかいダマ 30） */
  { id: 'haniwa', kind: 'set', price: 30, unit: 'こ', give: [{ item: 'haniwa', count: 1 }] },
] as const satisfies readonly ShopGood[];

type ShopGoodId = (typeof SHOP_GOODS)[number]['id'];
export type ShopBoxId = 'kobako' | 'obako';
export type ShopItemId = ShopGoodId | ShopBoxId;

export interface ShopBox {
  /** ねだん（ようかいダマ 何こ） */
  price: number;
  /** くじの 表（`world/gen/mineChestTable.ts` の 名前） */
  table: string;
  /** 名前 */
  name: string;
}

/** たからばこ（§4.3）。こばこ ＝ 坑道の 宝箱と 同じ 表 `kodo`、おおばこ ＝ 段 4 かくてい・★7 わくごと 0.026 の 表 `obako` */
export const SHOP_BOXES = {
  /** こばこ（ようかいダマ 10） */
  kobako: { price: 10, table: 'kodo', name: 'こばこ' },
  /** おおばこ（ようかいダマ 100。決定。ふつうの 1 時間で 1 回） */
  obako: { price: 100, table: 'obako', name: 'おおばこ' },
} as const satisfies Record<ShopBoxId, ShopBox>;

const SHOP_BOX_IDS: readonly ShopBoxId[] = ['kobako', 'obako'];

/** カードの 順（品 → こばこ → おおばこ） */
export const SHOP_ORDER: readonly ShopItemId[] = [...SHOP_GOODS.map((g) => g.id), ...SHOP_BOX_IDS];

export const SHOP_TUNING = {
  /** くじの たねに まぜる 数（世界の シードから 箱の たねを 分ける 札。数の 意味は ない） */
  seedSalt: 3811,
  /** 「こんな ものが でるかも」に ★7 を 出す わくごとの わりあいの 下限（0〜1。これより 小さい 表は ★7 を 見せない） */
  sampleLegendMin: 0.001,
  /** ★6 いじょうが 出たら キラキラの 音（めずらしさの ★） */
  sparkleStars: 6,
} as const;

/** id → 品（箱 なら null） */
export function shopGood(id: string): (typeof SHOP_GOODS)[number] | null {
  return SHOP_GOODS.find((g) => g.id === id) ?? null;
}

export function isShopBox(id: string): id is ShopBoxId {
  return (SHOP_BOX_IDS as readonly string[]).includes(id);
}

/** その 品・箱の ねだん（知らない id は null） */
export function shopPrice(id: string): number | null {
  if (isShopBox(id)) return SHOP_BOXES[id].price;
  return shopGood(id)?.price ?? null;
}
