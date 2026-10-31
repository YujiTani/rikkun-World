// HOUSE-1B 家具 13 種（2.4）の 大きさと 材料（1 か所の 表。ルール #304）。仕様 docs/design/HOUSE-1.md §4.3。DOM・three なし。
// id は アイテムの id（ふとん・こたつ・かまど・たんす・はにわは 今ある 物、テーブル・いす・あんどん・ほんだな・おふろ・
// ながい テーブル・まるい テーブル・まるいすは 新しい 物 = content/items/houseEditor.ts）。
// 足す ときは ここと、見本の 形（house/look/furnitureArt.ts の 箱の 表。Record なので 足し忘れると 型で 落ちる）。
import type { ItemId } from '../../contracts';

/**
 * 家具の 並び（= 画面の ボタンの 並び。上の 行から 左→右。13 種は 上 7・下 6。§4.3）。ボタンの testid は `furniture-<id>`。
 * 1 行の 数は paletteColumns（⌈しゅるい ÷ 2⌉）。足すと 行が ふえる のでは なく 2 行の まま 1 行の 数が ふえる
 */
export const FURN_ORDER = [
  'furnace', 'tansu', 'nukunuku', 'futon', 'table', 'long_table', 'round_table',
  'chair', 'stool', 'andon', 'shelf', 'ofuro', 'haniwa',
] as const satisfies readonly ItemId[];
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
  furnace: { name: 'かまど', cells: [1, 1], mats: [['stone', 5]] },
  tansu: { name: 'たんす', cells: [1, 1], mats: [['log', 8], ['iron_ingot', 2]] },
  nukunuku: { name: 'こたつ', cells: [2, 2], mats: [['grass', 3], ['log', 2], ['torch', 1]] },
  futon: { name: 'ふとん', cells: [1, 2], mats: [['cloth', 3], ['string', 1]] },
  table: { name: 'テーブル', cells: [2, 1], mats: [['log', 4]] },
  long_table: { name: 'ながい テーブル', cells: [3, 1], mats: [['log', 6]] },
  round_table: { name: 'まるい テーブル', cells: [1, 1], mats: [['log', 2]] },
  chair: { name: 'いす', cells: [1, 1], mats: [['log', 2]] },
  stool: { name: 'まるいす', cells: [1, 1], mats: [['log', 2]] },
  andon: { name: 'あんどん', cells: [1, 1], mats: [['paper', 2], ['log', 1], ['oil', 1]] },
  shelf: { name: 'ほんだな', cells: [1, 1], mats: [['log', 6], ['paper', 3]] },
  ofuro: { name: 'おふろ', cells: [2, 1], mats: [['stone', 6], ['log', 4]] },
  haniwa: { name: 'はにわ', cells: [1, 1], mats: [['clay', 2]] }, // 今の はにわの 作り方（かまどで やく）と 同じ
};

/** 家具の ボタンの 列の 数（1 行の こ数）。2 行に ならべる ので ⌈しゅるい ÷ 2⌉（9 ＝ 5＋4、13 ＝ 7＋6。§4.3） */
export function paletteColumns(kinds: number): number {
  return Math.ceil(kinds / 2);
}

/** ふとん（必ず 1 つ 以上。それだけだと 確かめる）と、見本で 特別に 描く 物の id（コードで 比べる ときは 文字を 直書きせず ここから 読む） */
export const K_FUTON = 'futon' satisfies FurnKind;
export const K_KOTATSU = 'nukunuku' satisfies FurnKind;

/** 天井の ちょうちん（あかり）。家具の 表には 入れない（置かない・とれない）。見本の 絵の 名前 */
export const K_LANTERN = 'lantern';

export function isFurnKind(x: unknown): x is FurnKind {
  return typeof x === 'string' && (FURN_ORDER as readonly string[]).includes(x);
}
