// HOUSE-2A（#364）どの レシピに なるか（拾った とき に 決まる。仕様 §2.1）。DOM・three なし。
// 1 まい目は かならず かわらの やね。つぎからは まだの 物から 1 まい。同じ 世界・同じ 場所・同じ おぼえた 物 なら いつも 同じ 答え（おぼえた 順は 関係ない）。
import { RECIPE_IDS, type RecipeId } from './table';

/** 1 まい目に かならず 出る レシピ（かわらの やね） */
export const FIRST_RECIPE: RecipeId = 'roof_kawara';

export interface PickInput {
  seed: number;
  at: { x: number; y: number; z: number };
  learned: readonly string[];
}

/** 文字の 混ぜ（32 ビット。シード付きの ハッシュ。同じ 入力なら 同じ 出力） */
function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** まだの レシピから 1 まい。ぜんぶ おぼえて いたら null */
export function pickRecipe(o: PickInput): RecipeId | null {
  const left = RECIPE_IDS.filter((id) => !o.learned.includes(id));
  if (left.length === 0) return null;
  if (o.learned.length === 0) return FIRST_RECIPE;
  let h = mix(o.seed | 0, Math.floor(o.at.x));
  h = mix(h, Math.floor(o.at.y));
  h = mix(h, Math.floor(o.at.z));
  return left[h % left.length]!;
}
