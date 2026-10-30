import { describe, expect, it } from 'vitest';
import { HOUSE_FURNITURE_IDS } from '../../content/items/ids';
import { itemDef } from '../../content/items/registry';
import { FURNITURE, FURN_ORDER } from './furniture';
import { MATERIAL_ORDER } from './tuning';

/** HOUSE-1B 家具 9 種の 大きさ・材料は 1 か所の 表（FURNITURE）。足し忘れ・材料の 食いちがいは ここで 落とす */

describe('家具 9 種の 表', () => {
  it('9 種 そろって いる（ボタンの 順 ＝ ふとん・いす・テーブル・あんどん・ほんだな・おふろ・こたつ・たんす・かまど）', () => {
    expect([...FURN_ORDER]).toEqual(['futon', 'chair', 'table', 'andon', 'shelf', 'ofuro', 'nukunuku', 'tansu', 'furnace']);
    expect(Object.keys(FURNITURE).sort()).toEqual([...FURN_ORDER].sort());
  });

  it('新しい 5 種（テーブル・いす・あんどん・ほんだな・おふろ）は アイテムとして 登録されて いる。4 種は もとから ある 物', () => {
    for (const id of HOUSE_FURNITURE_IDS) {
      expect(FURN_ORDER, id).toContain(id);
      expect(itemDef(id), id).toBeDefined();
    }
    for (const k of FURN_ORDER) expect(itemDef(k), k).toBeDefined();
  });

  it('大きさは 1〜2 マス。材料の 並びは 「ひつような もの」の 材料の 表に ある 物だけ', () => {
    for (const k of FURN_ORDER) {
      const { cells, mats, name } = FURNITURE[k];
      expect(name, k).toMatch(/^[ぁ-んァ-ヶー]+$/);
      expect(cells.every((n) => n >= 1 && n <= 2), k).toBe(true);
      expect(mats.length, k).toBeGreaterThan(0);
      for (const [item, n] of mats) {
        expect(MATERIAL_ORDER as readonly string[], `${k}: ${item}`).toContain(item);
        expect(Number.isInteger(n) && n > 0, `${k}: ${item}`).toBe(true);
      }
    }
  });

  it('もとから ある 家具（ふとん・こたつ・かまど・たんす）の 材料は そのアイテムの 作り方〔recipe〕と 同じ', () => {
    for (const k of ['futon', 'nukunuku', 'furnace', 'tansu'] as const) {
      const recipe = itemDef(k)?.recipe;
      if (!recipe) continue;
      expect(Object.fromEntries(FURNITURE[k].mats), k).toEqual(Object.fromEntries(recipe.inputs));
    }
    expect(itemDef('futon')?.recipe, 'ふとんは 作り方が ある（比べる 相手が いる）').toBeDefined();
  });
});
