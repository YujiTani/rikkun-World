import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { BLOCK_MAX_STACK } from '../inventory/items';
import { itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { ALL_RECIPES, CRAFT_RECIPES } from '../craft/recipes';
import { createDefaultItemInfo } from '../craft/info';
import { itemCategory } from './itemCategory';
import { itemIconPixels } from './itemIcon';
import { buildTooltip } from './tooltipModel';
import { findUnrubiedKanji } from './text';

const same = (a: readonly unknown[], b: readonly unknown[]) => JSON.stringify(a) === JSON.stringify(b);
const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('LIVE-2 アイテム（AC23）', () => {
  it('名前・上限・置く・カテゴリー・めずらしさ（§4.2）', () => {
    expect(itemType('nukunuku')).toMatchObject({ name: 'こたつ', maxStack: 64, placeBlock: 'nukunuku' });
    expect(itemType('toriya')).toMatchObject({ name: 'とりごや', maxStack: 1, placeBlock: null });
    expect(itemType('kin_tamago')).toMatchObject({ name: 'きん の たまご', maxStack: itemType('egg')!.maxStack, placeBlock: null });
    expect(itemType('kin_tamago')!.maxStack).toBe(BLOCK_MAX_STACK);
    expect(itemRarity('nukunuku')).toBe('uncommon');
    expect(itemRarity('nukunuku')).toBe(itemRarity('tansu'));
    expect(itemRarity('toriya')).toBe('uncommon');
    expect(itemRarity('kin_tamago')).toBe('epic');
    expect(itemCategory('nukunuku')).toBe('home');
    expect(itemCategory('toriya')).toBe('home');
    // たからもの: たべものに しない
    expect(itemCategory('kin_tamago')).not.toBe('food');
  });

  it('名前に ぬくぬく・育成・たまご こたつ・きん の ひよこ・きん の にわとり を 使わない', () => {
    for (const id of ['nukunuku', 'toriya', 'kin_tamago'] as const) {
      const n = itemType(id)!.name;
      for (const bad of ['ぬくぬく', '育成', 'たまご こたつ', 'きん の ひよこ', 'きん の にわとり']) expect(n).not.toContain(bad);
    }
  });

  it('レシピ: こたつ = くさ 3・き 2・たいまつ 1、とりごや = き 8・くさ 4。いちばん うしろ（mushi_ami の うしろ）', () => {
    const tail = CRAFT_RECIPES.slice(-11, -8); // GOLD-1: うしろに きんの そうび 8 こ
    expect(tail.map((r) => r.id)).toEqual(['mushi_ami', 'nukunuku', 'toriya']);
    expect(CRAFT_RECIPES).toHaveLength(44);
    expect(tail[1].inputs).toEqual([{ item: 'grass', count: 3 }, { item: 'log', count: 2 }, { item: 'torch', count: 1 }]);
    expect(tail[2].inputs).toEqual([{ item: 'log', count: 8 }, { item: 'grass', count: 4 }]);
    expect(tail[1].output).toEqual({ item: 'nukunuku', count: 1 });
    expect(tail[2].output).toEqual({ item: 'toriya', count: 1 });
    // きん の たまご は つくれない
    expect(ALL_RECIPES.some((r) => r.output.item === 'kin_tamago')).toBe(false);
  });

  it('アイコン: 16×16・ふちどり あり・ほかの アイテムと ちがう', () => {
    for (const id of ['nukunuku', 'toriya', 'kin_tamago'] as const) {
      const px = itemIconPixels(id);
      expect(px, id).toHaveLength(256);
    }
    for (const id of ['toriya', 'kin_tamago'] as const) {
      const px = itemIconPixels(id);
      expect(px.some((c) => c[3] === 0), id).toBe(true);
      expect(px.some((c) => c[0] === 0x2a && c[1] === 0x1e && c[2] === 0x14), id).toBe(true);
    }
    const ids = ['nukunuku', 'toriya', 'kin_tamago', 'egg', 'tansu', 'furnace', 'mushi_ami'] as const;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(same(itemIconPixels(ids[i]), itemIconPixels(ids[j])), `${ids[i]}/${ids[j]}`).toBe(false);
  });

  it('kin_tamago の 絵は egg と 白黒でも ちがう（明るさが ひくい・キラが 1 つ ある）', () => {
    const egg = itemIconPixels('egg');
    const kin = itemIconPixels('kin_tamago');
    const mean = (px: readonly (readonly number[])[]) => {
      const f = px.filter((c) => c[3] > 0 && !(c[0] === 0x2a && c[1] === 0x1e && c[2] === 0x14));
      return f.reduce((s, c) => s + luma(c), 0) / f.length;
    };
    // 白黒に した ときの 体の 平均の 明るさが 20 以上 ちがう
    expect(Math.abs(mean(egg) - mean(kin))).toBeGreaterThan(20);
    // 白黒の 並びも ちがう（同じ 場所の 明るさ が 2 割 以上 の ドットで ちがう）
    let diff = 0;
    for (let i = 0; i < 256; i++) if (Math.abs((egg[i][3] > 0 ? luma(egg[i]) : -1) - (kin[i][3] > 0 ? luma(kin[i]) : -1)) > 25) diff++;
    expect(diff).toBeGreaterThan(30);
    // キラ（白）が ある
    expect(kin.some((c) => c[0] === 255 && c[1] === 255 && c[2] === 255 && c[3] === 255)).toBe(true);
    // たまごの キャッシュを こわさない
    expect(itemIconPixels('kin_tamago')).toBe(itemIconPixels('kin_tamago'));
  });

  it('説明の 表: 3 行（なにに・どう・どこで）。漢字なし・ぬくぬく なし', () => {
    const nm: Record<string, string> = { nukunuku: 'こたつ', toriya: 'とりごや', kin_tamago: 'きん の たまご', grass: 'くさ', log: 'き', torch: 'たいまつ' };
    const info = createDefaultItemInfo((i) => nm[i] ?? i);
    for (const id of ['nukunuku', 'toriya', 'kin_tamago'] as const) {
      const row = info.info(id);
      expect(row.use.length, id).toBeGreaterThan(0);
      expect(row.how.length, id).toBeGreaterThan(0);
      expect(row.source.length, id).toBeGreaterThan(0);
      for (const s of [row.use, row.how, row.source]) {
        expect(findUnrubiedKanji(s), `${id}: ${s}`).toEqual([]);
        expect(s).not.toContain('ぬくぬく');
        expect(s).not.toContain('育成');
      }
    }
    expect(info.info('nukunuku').use).toContain('たまご を あたためる');
    expect(info.info('nukunuku').source).toContain('つくる');
    expect(info.info('toriya').use).toContain('にわとり の いえ');
    expect(info.info('kin_tamago').use).toContain('マッチョ ひよこ');
    expect(info.info('kin_tamago').source).toContain('にわとり が ときどき うむ');
  });

  it('ツールチップ: kin_tamago は たべられない。toriya は おける。ふりがな', () => {
    const deps = { nameOf: (i: string) => i, rarityOf: () => 'epic' as const, placeable: () => false, recipes: () => [] };
    const k = buildTooltip('kin_tamago' as ItemId, deps);
    expect(k.lines).not.toContain('たべると ハート が もどる');
    const t = buildTooltip('toriya' as ItemId, deps);
    expect(t.lines).toContain('おける');
    for (const l of [...k.lines, ...t.lines]) expect(findUnrubiedKanji(l)).toEqual([]);
  });
});
