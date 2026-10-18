import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { ALL_RECIPES } from '../craft/recipes';
import { createDefaultItemInfo } from '../craft/info';
import { itemCategory } from './itemCategory';
import { itemIconPixels } from './itemIcon';
import { buildTooltip } from './tooltipModel';
import { findUnrubiedKanji } from './text';

const same = (a: readonly unknown[], b: readonly unknown[]) => JSON.stringify(a) === JSON.stringify(b);

describe('LIVE-1 たまご（AC20）', () => {
  it('名前・上限（トマトと同じ）・置けない・カテゴリー・めずらしさ・レシピ 0', () => {
    expect(itemType('egg')?.name).toBe('たまご');
    expect(itemType('egg')?.maxStack).toBe(itemType('tomato')?.maxStack);
    expect(itemType('egg')?.placeBlock).toBeNull();
    expect(itemCategory('egg')).toBe('food');
    expect(itemRarity('egg')).toBe('common');
    expect(ALL_RECIPES.filter((r) => r.output.item === 'egg' || r.inputs.some((i) => i.item === 'egg'))).toHaveLength(0);
  });
  it('絵は やさい 4 しゅるい・かみ・いとと ちがい、ふちどりが ある', () => {
    const egg = itemIconPixels('egg');
    expect(egg).toHaveLength(256);
    for (const o of ['onion', 'tomato', 'pumpkin', 'eggplant', 'paper', 'string'] as const) expect(same(egg, itemIconPixels(o)), o).toBe(false);
    expect(egg.some((c) => c[3] === 0)).toBe(true);
    expect(egg.some((c) => c[0] === 0x2a && c[1] === 0x1e && c[2] === 0x14)).toBe(true);
    // たまごの 形: たて長（高さ > はば）
    const xs: number[] = [];
    const ys: number[] = [];
    egg.forEach((c, i) => {
      if (c[3] > 0) {
        xs.push(i % 16);
        ys.push(Math.floor(i / 16));
      }
    });
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
  });
  it('説明の表とツールチップが §3.1 の 文', () => {
    const info = createDefaultItemInfo((i) => (i === 'egg' ? 'たまご' : i)).info('egg' as ItemId);
    expect(info.use).toBe('たべると ハート が 1 こ もどる');
    expect(info.how).toBe('もって みぎクリック');
    expect(info.buttons).toEqual(['1-9', 'right']);
    expect(info.source).toBe('なかま の にわとり が くれる');
    const tip = buildTooltip('egg' as ItemId, { nameOf: (i) => i, rarityOf: () => 'common', placeable: () => false, recipes: () => [] });
    expect(tip.lines).toContain('たべると ハート が もどる');
    for (const t of [info.use, info.how, info.source, ...tip.lines]) expect(findUnrubiedKanji(t)).toEqual([]);
  });
});
