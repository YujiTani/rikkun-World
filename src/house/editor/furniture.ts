// HOUSE-1B 家具 9 種の 大きさと 材料（1 か所の 表。ルール #304）。仕様 docs/design/HOUSE-1.md §4.3。DOM・three なし。
// id は アイテムの id（ふとん・こたつ・かまど・たんすは 今ある 物、テーブル・いす・あんどん・ほんだな・おふろは 新しい 物 = content/items/houseEditor.ts）。
// 足す ときは ここと、見本の 形（house/look/furnitureArt.ts の 箱の 表。Record なので 足し忘れると 型で 落ちる）。
import type { ItemId } from '../../contracts';

/** 家具の 並び（= 画面の ボタンの 並び 5＋4）。ボタンの testid は `furniture-<id>` */
export const FURN_ORDER = ['futon', 'chair', 'table', 'andon', 'shelf', 'ofuro', 'nukunuku', 'tansu', 'furnace'] as const satisfies readonly ItemId[];
export type FurnKind = (typeof FURN_ORDER)[number];

export interface FurnDef {
  /** 画面に 出す 名前（ひらがな・カタカナ） */
  name: string;
  /** 方眼の 大きさ（よこ, たて。マス）。向き 0 の とき */
  cells: readonly [number, number];
  /** 1 こ ぶんの 材料（アイテムの id, 数）。今ある 家具は その 作り方と 同じ（furniture.test.ts が 確かめる） */
  mats: ReadonlyArray<readonly [ItemId, number]>;
}

export const FURNITURE: Readonly<Record<FurnKind, FurnDef>> = {
  futon: { name: 'ふとん', cells: [1, 2], mats: [['cloth', 3], ['string', 1]] },
  chair: { name: 'いす', cells: [1, 1], mats: [['log', 2]] },
  table: { name: 'テーブル', cells: [2, 1], mats: [['log', 4]] },
  andon: { name: 'あんどん', cells: [1, 1], mats: [['paper', 2], ['log', 1], ['oil', 1]] },
  shelf: { name: 'ほんだな', cells: [1, 1], mats: [['log', 6], ['paper', 3]] },
  ofuro: { name: 'おふろ', cells: [2, 1], mats: [['stone', 6], ['log', 4]] },
  nukunuku: { name: 'こたつ', cells: [2, 2], mats: [['grass', 3], ['log', 2], ['torch', 1]] },
  tansu: { name: 'たんす', cells: [1, 1], mats: [['log', 8], ['iron_ingot', 2]] },
  furnace: { name: 'かまど', cells: [1, 1], mats: [['stone', 5]] },
};

/** ふとん（必ず 1 つ 以上。それだけだと 確かめる）と、見本で 特別に 描く 物の id（コードで 比べる ときは 文字を 直書きせず ここから 読む） */
export const K_FUTON = 'futon' satisfies FurnKind;
export const K_KOTATSU = 'nukunuku' satisfies FurnKind;

/** 天井の ちょうちん（あかり）。家具の 表には 入れない（置かない・とれない）。見本の 絵の 名前 */
export const K_LANTERN = 'lantern';

export function isFurnKind(x: unknown): x is FurnKind {
  return typeof x === 'string' && (FURN_ORDER as readonly string[]).includes(x);
}
