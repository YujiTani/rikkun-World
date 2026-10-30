import type { ItemId, Rarity } from '../../contracts';
import { itemDef } from '../../content/items/registry';
import { rarityIndex } from '../../drops/rarityTable';
import { yomiOf } from '../text';
import { CATEGORY_ITEMS, ITEM_CATEGORIES, type ItemCategory } from '../itemCategory';

/**
 * ZUKAN-1: 本の 「アイテム ずかん」の データ（DOM なし）。
 * アイテムは 登録表（content/items/）から 色分けの 並び（`CATEGORY_ITEMS`）で ぜんぶ のる。id を ここに 書かない。
 * レア度 7（レジェンダリー）以上は 絵が ずっと 影で、てに いれかた は 「？？？」（yuzu 2026-10-29）。
 */
export type ZukanGroup = 'weapon' | 'armor' | 'tool' | 'food' | 'plant' | 'block' | 'home' | 'material';

/** さがす ボタン（字が 読めなくても 絵で 分かるよう 見本の アイテムの 絵を つける。見本は その 組の 先頭） */
export const ZUKAN_GROUPS: readonly { id: ZukanGroup; label: string }[] = [
  { id: 'weapon', label: 'ぶき' },
  { id: 'armor', label: 'ぼうぐ' },
  { id: 'tool', label: 'どうぐ' },
  { id: 'food', label: 'たべもの' },
  { id: 'plant', label: 'しょくぶつ' },
  { id: 'block', label: 'ブロック' },
  { id: 'home', label: 'くらし' },
  { id: 'material', label: 'ざいりょう' },
];

/** 色分けの 分類 → さがす 組 */
const GROUP_OF: Readonly<Record<ItemCategory, ZukanGroup>> = {
  weapon: 'weapon',
  armor: 'armor',
  tool: 'tool',
  food: 'food',
  plant: 'plant',
  soil: 'block',
  stone: 'block',
  ore: 'block',
  build: 'block',
  home: 'home',
  light: 'home',
  material: 'material',
  metal: 'material',
};

/** 影に なる レア度の 段（0 から。6 ＝ ほし 7） */
export const ZUKAN_SHADOW_INDEX = 6;
/** 影の アイテムの てに いれかた */
export const ZUKAN_SECRET = '？？？';

export interface ZukanEntry {
  id: ItemId;
  /** 名前（ルビ記法 `［漢字｜よみ］` のまま） */
  name: string;
  /** さがす ための よみ（ひらがな・空白なし） */
  key: string;
  group: ZukanGroup;
  rarity: Rarity;
  shadow: boolean;
}

/** カタカナ → ひらがな、空白を とる（さがす ときに くらべる 形） */
export function normalizeKana(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 全アイテム（色分けの 並び） */
export function zukanEntries(): ZukanEntry[] {
  return ITEM_CATEGORIES.flatMap((cat) =>
    CATEGORY_ITEMS[cat].map((id) => {
      const d = itemDef(id)!;
      return { id: id as ItemId, name: d.name, key: normalizeKana(yomiOf(d.name)), group: GROUP_OF[cat], rarity: d.rarity, shadow: rarityIndex(d.rarity) >= ZUKAN_SHADOW_INDEX };
    }),
  );
}

/** 名前の 一部（ひらがな・カタカナ どちらでも）と 組で しぼる。どちらも 空なら ぜんぶ */
export function filterZukan(entries: readonly ZukanEntry[], query: string, group: ZukanGroup | null): string[] {
  const q = normalizeKana(query);
  return entries.filter((e) => (group === null || e.group === group) && (q === '' || e.key.includes(q))).map((e) => e.id);
}

/** 1 見開きの マスの 数（左 12・右 16） */
export const ZUKAN_LEFT = 12;
const ZUKAN_RIGHT = 16;
export const ZUKAN_SPREAD = ZUKAN_LEFT + ZUKAN_RIGHT;

/** 一覧の 見開きの 数（0 こ でも 1） */
export function zukanPages(n: number): number {
  return Math.max(1, Math.ceil(n / ZUKAN_SPREAD));
}

/** 説明が 空の とき（地形・かざり）の 文 */
export const ZUKAN_NO_USE = 'せかい の どこか に ある';
export const ZUKAN_NO_SOURCE = 'せかい で みつけて ほる';
