import type { ItemId } from '../contracts';
import { KONGO_IDS, type KongoId } from '../content/items/ids';
import { GOLD_ROWS } from './itemArtGold';
import type { Rgba } from '../world/blocks/textures';

/**
 * KONGO-1 こんごう（ダイヤ）の そうび（案 C「けっしょう の きりこ」）の 16x16 アイコン。
 * 装備 8 こ は 金の 文字データ（itemArtGold.ts の kin_katana〜kin_suneate）と 同じ 形で、色表だけ 案 C。
 * 切り子: 刃・板の G・H の うち (x+y)%4==0 の 点を 1 段 明るく。ふち I の うち (x*7+y*3)%11==0 の 点を しゅ色。
 * 材料 ダイヤは 新しい 16x16 で、しゅ色は なし（共有フォルダ kongo/directions/README.md の 最終データ）。
 */
export type KongoItemId = KongoId;

export function isKongoItem(item: ItemId): item is KongoItemId & ItemId {
  return (KONGO_IDS as readonly string[]).includes(item);
}

/** 案 C の 最終パレット */
const PAL: Record<string, number> = {
  A: 0xffffff,
  B: 0xffffff,
  D: 0xd8fbff,
  G: 0x7ad8f0,
  H: 0x3a7fc0,
  C: 0x1a1a40,
  I: 0x140e2a,
  E: 0x4a2e6a,
  F: 0x2e1c48,
  J: 0xf0f0ff,
};
const SHU = 0xff7a3d; // しゅ色（★6 ミラクルの 色。そうびの ふちの 点だけ）
/** 切り子で 1 段 明るくする 色 */
const BRIGHTER: Record<string, string> = { G: 'D', H: 'G' };

const DIAMOND_ROWS: readonly string[] = [
  '................',
  '................',
  '....IIIIIIII....',
  '...IBAAADDGI....',
  '..IBAADDGGGGI...',
  '.IIIIIIIIIIIII..',
  '.IAADDDGGGGHHI..',
  '..IADDDGGGHHI...',
  '...IADDGGGHI....',
  '....IADGGHI..A..',
  '.....IADHI..ABA.',
  '......IAI....A..',
  '.......I........',
  '................',
  '................',
  '................',
];

const CLEAR: Rgba = [0, 0, 0, 0];
const rgba = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];

/** こんごうの そうび 8 こ・ダイヤ の 16x16 */
export function kongoItemPixels(item: KongoItemId): Rgba[] {
  const out: Rgba[] = [];
  const diamond = item === 'diamond';
  const rows = diamond ? DIAMOND_ROWS : GOLD_ROWS[GOLD_OF[item]];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      let c: number | undefined = PAL[ch];
      if (!diamond && c !== undefined) {
        if ((ch === 'G' || ch === 'H') && (x + y) % 4 === 0) c = PAL[BRIGHTER[ch]];
        else if (ch === 'I' && (x * 7 + y * 3) % 11 === 0) c = SHU;
      }
      out.push(c === undefined ? CLEAR : rgba(c));
    });
  });
  return out;
}

/** こんごうの そうび → 同じ 形の 金の そうび（ダイヤは 新しい 絵なので ない） */
const GOLD_OF: Record<Exclude<KongoItemId, 'diamond'>, keyof typeof GOLD_ROWS> = {
  kongo_katana: 'kin_katana',
  kongo_yumi: 'kin_yumi',
  kongo_pickaxe: 'kin_pickaxe',
  kongo_axe: 'kin_axe',
  kongo_kabuto: 'kin_kabuto',
  kongo_yoroi: 'kin_yoroi',
  kongo_kote: 'kin_kote',
  kongo_suneate: 'kin_suneate',
};
