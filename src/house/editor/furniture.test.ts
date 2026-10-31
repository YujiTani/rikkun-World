import { describe, expect, it } from 'vitest';
import { HOUSE_FURNITURE_IDS } from '../../content/items/ids';
import { itemDef } from '../../content/items/registry';
import { FURNITURE, FURN_ORDER, paletteColumns } from './furniture';
import { MATERIAL_ORDER } from './tuning';

/** HOUSE-1B 家具 13 種（2.4）の 大きさ・材料は 1 か所の 表（FURNITURE）。足し忘れ・材料の 食いちがいは ここで 落とす */

describe('家具 13 種の 表', () => {
  it('13 種 そろって いる（ボタンの 並び ＝ 上 7: かまど・たんす・こたつ・ふとん・テーブル・ながい テーブル・まるい テーブル ／ 下 6: いす・まるいす・あんどん・ほんだな・おふろ・はにわ。§4.3）', () => {
    expect([...FURN_ORDER]).toEqual([
      'furnace', 'tansu', 'nukunuku', 'futon', 'table', 'long_table', 'round_table',
      'chair', 'stool', 'andon', 'shelf', 'ofuro', 'haniwa',
    ]);
    expect(Object.keys(FURNITURE).sort()).toEqual([...FURN_ORDER].sort());
  });

  it('ボタンの 列の 数は ⌈種類 ÷ 2⌉（9 しゅるい ＝ 5、13 しゅるい ＝ 7）。上 7・下 6', () => {
    expect(paletteColumns(9)).toBe(5);
    expect(paletteColumns(13)).toBe(7);
    expect(paletteColumns(FURN_ORDER.length)).toBe(7);
    const cols = paletteColumns(FURN_ORDER.length);
    expect([FURN_ORDER.slice(0, cols), FURN_ORDER.slice(cols)].map((r) => r.length)).toEqual([7, 6]);
  });

  it('2.4 で 足した 4 つ（ながい テーブル 3×1・まるい テーブル 1×1・まるいす 1×1・はにわ 1×1）の 大きさと 材料（AC10）', () => {
    expect(FURNITURE.long_table).toMatchObject({ name: 'ながい テーブル', cells: [3, 1], mats: [['log', 6]] });
    expect(FURNITURE.round_table).toMatchObject({ name: 'まるい テーブル', cells: [1, 1], mats: [['log', 2]] });
    expect(FURNITURE.stool).toMatchObject({ name: 'まるいす', cells: [1, 1], mats: [['log', 2]] });
    expect(FURNITURE.haniwa).toMatchObject({ name: 'はにわ', cells: [1, 1], mats: [['clay', 2]] });
  });

  it('新しい 8 種（テーブル・いす・あんどん・ほんだな・おふろ・ながい テーブル・まるい テーブル・まるいす）は アイテムとして 登録されて いる。5 種は もとから ある 物', () => {
    for (const id of HOUSE_FURNITURE_IDS) {
      expect(FURN_ORDER, id).toContain(id);
      expect(itemDef(id), id).toBeDefined();
    }
    expect([...HOUSE_FURNITURE_IDS].sort()).toEqual(['andon', 'chair', 'long_table', 'ofuro', 'round_table', 'shelf', 'stool', 'table']);
    for (const k of FURN_ORDER) expect(itemDef(k), k).toBeDefined();
  });

  it('大きさは 1〜3 マス。材料の 並びは 「ひつような もの」の 材料の 表に ある 物だけ（ねんど を ふくむ 10 しゅるい）', () => {
    expect(MATERIAL_ORDER).toHaveLength(10);
    expect(MATERIAL_ORDER).toContain('clay');
    for (const k of FURN_ORDER) {
      const { cells, mats, name } = FURNITURE[k];
      expect(name, k).toMatch(/^[ぁ-んァ-ヶー ]+$/);
      expect(cells.every((n) => n >= 1 && n <= 3), k).toBe(true);
      expect(mats.length, k).toBeGreaterThan(0);
      for (const [item, n] of mats) {
        expect(MATERIAL_ORDER as readonly string[], `${k}: ${item}`).toContain(item);
        expect(Number.isInteger(n) && n > 0, `${k}: ${item}`).toBe(true);
      }
    }
  });

  it('もとから ある 家具（ふとん・こたつ・かまど・たんす・はにわ）の 材料は そのアイテムの 作り方〔recipe〕と 同じ', () => {
    for (const k of ['futon', 'nukunuku', 'furnace', 'tansu', 'haniwa'] as const) {
      const recipe = itemDef(k)?.recipe;
      if (!recipe) continue;
      expect(Object.fromEntries(FURNITURE[k].mats), k).toEqual(Object.fromEntries(recipe.inputs));
    }
    expect(itemDef('futon')?.recipe, 'ふとんは 作り方が ある（比べる 相手が いる）').toBeDefined();
  });
});
