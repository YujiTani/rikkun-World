import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { ALL_RECIPES, CRAFT_RECIPES } from '../craft/recipes';
const BASE_RECIPES = CRAFT_RECIPES.filter((r) => r.output.item !== 'torch' || r.id === 'torch'); // CRAFT-PAGE: たいまつの 足した作り方（2 つ）をのぞいた 元の 36 こ
import { W2_SETTING_DEFAULTS } from '../contracts';
import { itemClassOf } from '../tools/durability';
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
    expect(info.source).toBe('なかま の にわとり が むし を たべて うむ');
    const tip = buildTooltip('egg' as ItemId, { nameOf: (i) => i, rarityOf: () => 'common', placeable: () => false, recipes: () => [] });
    expect(tip.lines).toContain('たべると ハート が もどる');
    for (const t of [info.use, info.how, info.source, ...tip.lines]) expect(findUnrubiedKanji(t)).toEqual([]);
  });
});

const shape = (px: readonly (readonly number[])[]) => {
  const xs: number[] = [];
  const ys: number[] = [];
  px.forEach((c, i) => {
    if (c[3] > 0) {
      xs.push(i % 16);
      ys.push(Math.floor(i / 16));
    }
  });
  return { w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
};

describe('LIVE-1 版 3.2 むし・むしとりあみ（AC6・AC25。§4.2）', () => {
  it('名前・上限・置けない・カテゴリー・めずらしさ', () => {
    expect(itemType('mushi')?.name).toBe('むし');
    expect(itemType('mushi')?.maxStack).toBe(itemType('tomato')?.maxStack);
    expect(itemType('mushi')?.placeBlock).toBeNull();
    expect(itemCategory('mushi')).toBe('plant'); // 「そだてる」の なかま（たね と 同じ）。たべもの では ない
    expect(itemCategory('mushi')).toBe(itemCategory('seed_tomato'));
    expect(itemRarity('mushi')).toBe('common');
    expect(itemType('mushi_ami')?.name).toBe('むしとりあみ');
    expect(itemType('mushi_ami')?.maxStack).toBe(1);
    expect(itemType('mushi_ami')?.placeBlock).toBeNull();
    expect(itemCategory('mushi_ami')).toBe('tool');
    expect(itemRarity('mushi_ami')).toBe('common');
  });
  it('レシピ: カードの いちばん うしろ・き 1 ＋ いと 2・つくる 台・たいきゅう なし・むし は つくれない', () => {
    // LIVE-2 で nukunuku・toriya、GOLD-1 で きんの そうび 8 こ が 後ろに ふえたので、むしとりあみは うしろから 11 こ目 KONGO-1 で こんごうの そうび 8 こ も うしろに ふえた。
    const last = BASE_RECIPES[BASE_RECIPES.length - 19];
    expect(last.id).toBe('mushi_ami');
    expect(last.output).toEqual({ item: 'mushi_ami', count: 1 });
    expect(last.inputs).toEqual([{ item: 'log', count: 1 }, { item: 'string', count: 2 }]);
    expect(last.works).toBe(true);
    expect(last.station).toBe('craft');
    expect(ALL_RECIPES.filter((r) => r.output.item === 'mushi')).toHaveLength(0);
    expect(W2_SETTING_DEFAULTS.toolDurability.mushi_ami).toBeUndefined();
    expect(itemClassOf('mushi_ami')).toBe('permanent');
  });
  it('絵は 16×16・ふちどり あり・たね/やさい/たまご/くわ/じょうろ と ちがう・むし は よこ長・あみ は たて長', () => {
    const bug = itemIconPixels('mushi');
    const net = itemIconPixels('mushi_ami');
    for (const px of [bug, net]) {
      expect(px).toHaveLength(256);
      expect(px.some((c) => c[3] === 0)).toBe(true);
      expect(px.some((c) => c[0] === 0x2a && c[1] === 0x1e && c[2] === 0x14)).toBe(true);
    }
    const others = ['seed_onion', 'seed_tomato', 'seed_pumpkin', 'seed_eggplant', 'onion', 'tomato', 'pumpkin', 'eggplant', 'egg', 'kuwa', 'watering_can', 'long_watering_can', 'paper', 'string'] as const;
    for (const o of others) {
      expect(same(bug, itemIconPixels(o)), `mushi/${o}`).toBe(false);
      expect(same(net, itemIconPixels(o)), `mushi_ami/${o}`).toBe(false);
    }
    expect(same(bug, net)).toBe(false);
    // むし: 生成り（#F3E6C8）の まる ＋ だいだい（#E8962E）の 頭・帯
    expect(bug.some((c) => c[0] === 0xf3 && c[1] === 0xe6 && c[2] === 0xc8)).toBe(true);
    expect(bug.some((c) => c[0] === 0xe8 && c[1] === 0x96 && c[2] === 0x2e)).toBe(true);
    // あみ: 藍の にぎり（#3D5A9E）・生成り の ふくろ（#EFE7D4）
    expect(net.some((c) => c[0] === 0x3d && c[1] === 0x5a && c[2] === 0x9e)).toBe(true);
    expect(net.some((c) => c[0] === 0xef && c[1] === 0xe7 && c[2] === 0xd4)).toBe(true);
    const b = shape(bug);
    expect(b.w).toBeGreaterThanOrEqual(12);
    expect(b.h).toBeLessThan(b.w); // 影で「いもむし」: ななめに 長い まる の つながり
  });
  it('説明の表（§3.1）・ツールチップ・ふりがな', () => {
    const info = createDefaultItemInfo((i) => (i === 'mushi' ? 'むし' : i === 'mushi_ami' ? 'むしとりあみ' : i === 'log' ? 'き' : i === 'string' ? 'いと' : i));
    const m = info.info('mushi' as ItemId);
    expect(m.use).toBe('にわとり に あげる と なかよく なる');
    expect(m.how).toBe('もって にわとり に みぎクリック');
    expect(m.buttons).toEqual(['1-9', 'right']);
    expect(m.source).toBe('むしとりあみ で き から とる');
    expect(m.stats).toEqual([]);
    const a = info.info('mushi_ami' as ItemId);
    expect(a.use).toBe('き から むし を とる');
    expect(a.how).toBe('もって き に みぎクリック');
    expect(a.buttons).toEqual(['1-9', 'right']);
    expect(a.source).toBe('き 1・いと 2 で つくる');
    expect(a.stats).toEqual([]);
    const deps = { nameOf: (i: string) => i, rarityOf: () => 'common' as const, placeable: () => false, recipes: () => [] };
    const t1 = buildTooltip('mushi' as ItemId, deps);
    const t2 = buildTooltip('mushi_ami' as ItemId, deps);
    expect(t1.lines).toContain('にわとり に あげる');
    expect(t2.lines).toContain('き から むし を とる');
    expect(t1.lines).not.toContain('たべると ハート が もどる');
    for (const t of [m.use, m.how, m.source, a.use, a.how, a.source, ...t1.lines, ...t2.lines]) expect(findUnrubiedKanji(t)).toEqual([]);
  });
});
