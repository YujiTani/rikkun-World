// HOUSE-2A（#364）ポップアップの 行（`editor().popupRows`）と ばしょの ボタン。仕様 §2.3。DOM・three なし。
import { PARTS, PART_FORMS, STYLES, USUAL, isStyleless, type Part } from './kinds';
import type { RecipeLog } from './log';
import { DECO_RECIPES } from './table';

/** 1 行に ならぶ 数の 上限（こえたら おなじ なかまの 中で 次の 行へ） */
const ROW_MAX = 5;

/**
 * ばしょ part の ポップアップの 行。上から いつもの → むら → おしろ → こうざん。1 行に 1 つの なかま・行の 中は §2.3 の 表の 順・
 * 1 行 ROW_MAX こまで（こえたら 同じ なかまの 次の 行）・空の 行は 出さない。しゃちほこ は おしろの 行にだけ 入る
 */
export function popupRows(part: Part, log: RecipeLog): string[][] {
  const learned = log.formsOf(part, PART_FORMS[part]);
  const groups: string[][] = [(USUAL[part] as readonly string[]).map((k) => `${part}-${k}`)];
  for (const style of STYLES) {
    const g: string[] = [];
    for (const form of PART_FORMS[part]) {
      if (!learned.includes(form)) continue;
      if (isStyleless(form)) {
        if (style === 'shiro') g.push(`${part}-${form}`);
      } else g.push(`${part}-${form}_${style}`);
    }
    groups.push(g);
  }
  const rows: string[][] = [];
  for (const g of groups) for (let i = 0; i < g.length; i += ROW_MAX) rows.push(g.slice(i, i + ROW_MAX));
  return rows;
}

/** いま 出て いる ばしょ（かざりは かざりを 1 つ おぼえて から） */
export function visibleParts(log: RecipeLog): Part[] {
  return PARTS.filter((p) => p !== 'deco' || DECO_RECIPES.some((id) => log.has(id)));
}
