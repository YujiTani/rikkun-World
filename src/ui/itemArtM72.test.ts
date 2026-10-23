import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { itemType } from '../inventory/items';
import { CRAFT_RECIPES } from '../craft/recipes';
import { itemRarity } from '../drops/rarity';
import { BLOCK_TILES, getTilePixels } from '../world/blocks/textures';
import { DIG_DEFAULTS } from '../dig/config';
import { itemCategory } from './itemCategory';
import { itemIconPixels } from './itemIcon';
import { M72_ITEMS } from './itemArtM72';
import { buildTooltip } from './tooltipModel';
import { createDefaultItemInfo } from '../craft/info';
import { findUnrubiedKanji } from './text';

const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]));

describe('M7-2 アイテム（AC19）', () => {
  it('名前・上限・めずらしさ・カテゴリー', () => {
    expect(['watering_can', 'long_watering_can', 'sprinkler'].map((i) => itemType(i)?.name)).toEqual(['じょうろ', 'ながい じょうろ', 'スプリンクラー']);
    expect(['watering_can', 'long_watering_can', 'sprinkler'].map((i) => itemType(i)?.maxStack)).toEqual([1, 1, 64]);
    expect(itemType('sprinkler')?.placeBlock).toBe('sprinkler');
    expect(itemType('watering_can')?.placeBlock).toBeNull();
    expect(['watering_can', 'long_watering_can', 'sprinkler'].map((i) => itemRarity(i as ItemId))).toEqual(['common', 'uncommon', 'uncommon']);
    expect(['watering_can', 'long_watering_can', 'sprinkler'].map((i) => itemCategory(i))).toEqual(['tool', 'tool', 'home']);
  });
  it('絵は ぜんぶ ちがう（アイコン 3・上・横・下）。アイコンは ふちどり', () => {
    const pics = [
      ...M72_ITEMS.map((i) => itemIconPixels(i)),
      getTilePixels('sprinkler_top'),
      getTilePixels('sprinkler_side'),
      getTilePixels('sprinkler_bottom'),
    ];
    for (let i = 0; i < pics.length; i++) for (let j = i + 1; j < pics.length; j++) expect(same(pics[i], pics[j]), `${i}/${j}`).toBe(false);
    for (const i of M72_ITEMS) {
      const p = itemIconPixels(i);
      expect(p).toHaveLength(256);
      expect(p.some((c) => c[3] === 0)).toBe(true);
      expect(p.some((c) => c[0] === 0x2a && c[1] === 0x1e && c[2] === 0x14)).toBe(true);
    }
    expect(BLOCK_TILES.sprinkler).toEqual(['sprinkler_top', 'sprinkler_bottom', 'sprinkler_side']);
  });
  it('スプリンクラー の かたさ 3・レベル 0・すで で こわせる・1 こ もどる', () => {
    expect(DIG_DEFAULTS.hardness.sprinkler).toBe(3);
    expect(DIG_DEFAULTS.harvestLevel.sprinkler).toBe(0);
    expect(DIG_DEFAULTS.rarity.sprinkler).toBe('uncommon');
  });
});

describe('M7-2 レシピ（AC20 の ユニット部分）', () => {
  it('おの 3 つは てつの つるはし のすぐ後ろ（BAL-D AC17。id の ならびを 直接）', () => {
    expect(CRAFT_RECIPES.slice(2, 6).map((r) => r.id)).toEqual(['iron_pickaxe', 'wood_axe', 'stone_axe', 'iron_axe']);
    expect(CRAFT_RECIPES.slice(3, 6).map((r) => r.inputs.map((i) => `${i.item}${i.count}`).join(','))).toEqual(['log3', 'stone3,log2', 'iron_ingot3,log2']);
  });
  it('30〜33 こ目は やさい 1 こ → たね 4 こ', () => {
    expect(CRAFT_RECIPES.slice(29, 33).map((r) => [r.id, r.output.count, r.inputs.map((i) => `${i.item}${i.count}`).join(','), r.works])).toEqual([
      ['seed_onion', 4, 'onion1', true],
      ['seed_tomato', 4, 'tomato1', true],
      ['seed_pumpkin', 4, 'pumpkin1', true],
      ['seed_eggplant', 4, 'eggplant1', true],
    ]);
  });
  it('26・27・28 こ目（おの 3 つが 4〜6 こ目に入って、うしろが 3 つずれる）', () => {
    expect(CRAFT_RECIPES).toHaveLength(44);
    expect(CRAFT_RECIPES.slice(25, 28).map((r) => [r.id, r.output.count, r.inputs.map((i) => `${i.item}${i.count}`).join(','), r.works])).toEqual([
      ['watering_can', 1, 'iron_ingot1,stone2', true],
      ['long_watering_can', 1, 'iron_ingot3,log1', true],
      ['sprinkler', 1, 'iron_ingot4,stone2', true],
    ]);
  });
});

describe('M7-2 説明の表・ツールチップ（U19〜U21）', () => {
  const info = createDefaultItemInfo((i) => itemType(i)?.name ?? i);
  it('説明の 文（漢字なし）・つよさ・どこで', () => {
    for (const id of ['watering_can', 'long_watering_can', 'sprinkler'] as const) {
      const d = info.info(id);
      expect(findUnrubiedKanji(`${d.use}${d.how}${d.source}${d.stats.map((s) => s.label + s.value).join('')}`), id).toEqual([]);
    }
    expect(info.info('watering_can').use).toBe('はたけ 1 マス に みず を まく');
    expect(info.info('watering_can').stats).toEqual([{ key: 'capacity', label: 'まける かず', value: 10 }]);
    expect(info.info('long_watering_can').stats[0].value).toBe(20);
    expect(info.info('sprinkler').stats).toEqual([]);
    expect(info.info('watering_can').source).toBe('てつの かたまり 1・いし 2 で つくる');
    expect(info.info('long_watering_can').source).toBe('てつの かたまり 3・き 1 で つくる');
    expect(info.info('sprinkler').source).toBe('てつの かたまり 4・いし 2 で つくる');
    expect(info.info('watering_can').buttons).toEqual(['1-9', 'right']);
    expect(info.info('sprinkler').buttons).toEqual(['1-9', 'right']);
  });
  it('ツールチップ の「できること」', () => {
    const d = {
      nameOf: (i: string) => itemType(i)?.name ?? i,
      rarityOf: itemRarity,
      placeable: (i: string) => !!itemType(i)?.placeBlock,
      recipes: () => CRAFT_RECIPES,
    };
    expect(buildTooltip('watering_can', d).lines).toContain('はたけ に みず を まく');
    expect(buildTooltip('long_watering_can', d).lines).toContain('はたけ に みず を まく');
    expect(buildTooltip('sprinkler', d).lines).toContain('まわり の はたけ を しめらせる');
    expect(buildTooltip('sprinkler', d).lines).toContain('おける');
  });
});
