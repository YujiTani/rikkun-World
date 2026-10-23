import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { BLOCK_MAX_STACK, itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { ALL_RECIPES, BAKE_RECIPES, CRAFT_RECIPES } from '../craft/recipes';
import { createDefaultItemInfo } from '../craft/info';
import { itemCategory } from './itemCategory';
import { itemIconPixels } from './itemIcon';
import { buildTooltip } from './tooltipModel';
import { findUnrubiedKanji } from './text';

/**
 * LIVE-3 の アイテム・レシピ・説明の 表・ツールチップ（docs/design/LIVE-3.md §3.1・§4.2・AC12 の 表・AC14）。
 * 本（ルールブック）の ページ・案内画面の 1 行は 週一の 本の まとめで 足す ので ここでは 見ない。
 */
const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('LIVE-3 アイテム（AC14）', () => {
  it('名前・上限・置けない・カテゴリー・めずらしさ（§3.1・§4.2）', () => {
    expect(itemType('momo_nama' as ItemId)).toMatchObject({ name: 'なま もも にく', maxStack: BLOCK_MAX_STACK, placeBlock: null });
    expect(itemType('momo_yaki' as ItemId)).toMatchObject({ name: 'やいた もも にく', maxStack: BLOCK_MAX_STACK, placeBlock: null });
    expect(itemType('momo_nama' as ItemId)!.maxStack).toBe(itemType('tomato')!.maxStack); // 上限は やさい と 同じ
    expect(itemCategory('momo_nama' as ItemId)).toBe('food');
    expect(itemCategory('momo_yaki' as ItemId)).toBe('food');
    expect(itemRarity('momo_nama' as ItemId)).toBe('common');
    expect(itemRarity('momo_yaki' as ItemId)).toBe('common');
  });

  it('名前に 漢字 も 禁止語（ころす・しぬ・しめる・肉）も 無い', () => {
    for (const id of ['momo_nama', 'momo_yaki'] as const) {
      const n = itemType(id as ItemId)!.name;
      expect(findUnrubiedKanji(n), id).toEqual([]);
      for (const bad of ['ころす', 'しぬ', 'しめる', '肉', '子', '大人']) expect(n).not.toContain(bad);
    }
  });

  it('アイコン: 16×16・ふちどり あり・2 つ は ちがう・白黒 でも 明るさ が ちがう（なま ＜ やいた でも 逆 でも よい。平均 の 明るさ が 20 以上 ちがう）', () => {
    const nama = itemIconPixels('momo_nama' as ItemId);
    const yaki = itemIconPixels('momo_yaki' as ItemId);
    expect(nama).toHaveLength(256);
    expect(yaki).toHaveLength(256);
    expect(JSON.stringify(nama)).not.toBe(JSON.stringify(yaki));
    const mean = (px: readonly (readonly number[])[]) => {
      const f = px.filter((c) => c[3] > 0);
      return f.reduce((s, c) => s + luma(c), 0) / f.length;
    };
    expect(Math.abs(mean(nama) - mean(yaki))).toBeGreaterThan(20);
    // 形（かげ）は 同じ: 透明 の 場所 が 同じ（「同じ 形 で こんがり」§3.2）
    const hole = (px: readonly (readonly number[])[]) => px.map((c) => (c[3] > 0 ? 1 : 0)).join('');
    expect(hole(nama)).toBe(hole(yaki));
  });
});

describe('LIVE-3 やく レシピ（AC12 の 表・§4.2）', () => {
  it('BAKE_RECIPES の いちばん うしろ に momo_yaki 1 ＝ momo_nama 1。やく は 5 こ。つくる（E）は 36 こ の まま。craft.everything には 入らない', () => {
    expect(BAKE_RECIPES).toHaveLength(5);
    const last = BAKE_RECIPES[BAKE_RECIPES.length - 1]!;
    expect(last).toMatchObject({ id: 'momo_yaki', output: { item: 'momo_yaki', count: 1 }, inputs: [{ item: 'momo_nama', count: 1 }], station: 'furnace', works: true });
    expect(CRAFT_RECIPES).toHaveLength(36);
    expect(CRAFT_RECIPES.some((r) => r.output.item === 'momo_nama' || r.output.item === 'momo_yaki')).toBe(false);
    expect(ALL_RECIPES.filter((r) => r.station === 'furnace').map((r) => r.id)).toEqual(['iron_ingot', 'kawara', 'brick', 'haniwa', 'momo_yaki']);
  });
});

describe('LIVE-3 説明の 表・ツールチップ（§3.1・AC14）', () => {
  const nm: Record<string, string> = { momo_nama: 'なま もも にく', momo_yaki: 'やいた もも にく' };
  const info = createDefaultItemInfo((i) => nm[i] ?? i);

  it('説明の 表: 3 行（なにに・どう・どこで）。漢字 なし。中身 は §3.1', () => {
    const a = info.info('momo_nama' as ItemId);
    const b = info.info('momo_yaki' as ItemId);
    for (const [id, row] of [['momo_nama', a], ['momo_yaki', b]] as const) {
      for (const s of [row.use, row.how, row.source]) {
        expect(s.length, id).toBeGreaterThan(0);
        expect(findUnrubiedKanji(s), `${id}: ${s}`).toEqual([]);
      }
    }
    expect(a.use).toContain('かまど で やく');
    expect(a.use).toContain('たべられる');
    expect(a.how).toContain('かまど に みぎクリック');
    expect(a.source).toContain('とりごや で そだった おとな');
    expect(b.use).toContain('ハート');
    expect(b.use).toContain('5');
    expect(b.how).toContain('もって みぎクリック');
    expect(b.source).toContain('かまど で やく');
  });

  it('ツールチップ: momo_nama は「かまど で やける」、momo_yaki は「もどる ハート 5」', () => {
    const deps = { nameOf: (i: string) => nm[i] ?? i, rarityOf: () => 'common' as const, placeable: () => false, recipes: () => ALL_RECIPES };
    const a = buildTooltip('momo_nama' as ItemId, deps);
    const b = buildTooltip('momo_yaki' as ItemId, deps);
    expect([...a.lines, a.desc].join('|')).toContain('かまど で やける');
    expect([...b.lines, b.desc].join('|')).toContain('もどる ハート 5');
    for (const l of [...a.lines, ...b.lines]) expect(findUnrubiedKanji(l)).toEqual([]);
  });
});
