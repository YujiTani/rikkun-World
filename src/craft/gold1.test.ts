import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { findUnrubiedKanji } from '../ui/text';
import { TOOL_DEFAULTS } from '../tools/config';
import { ArmorSystemImpl } from './ArmorSystem';
import { CRAFT_DEFAULTS, ARMOR_SLOT_OF } from './config';
import { ALL_RECIPES, BAKE_RECIPES } from './recipes';
import { createItemInfo, defaultInfoNumbers } from './info/build';
import { CRAFT_RECIPE_NAMES, BAKE_RECIPE_NAMES } from '../achievements/defs';

const KIN8 = ['kin_katana', 'kin_yumi', 'kin_pickaxe', 'kin_axe', 'kin_kabuto', 'kin_yoroi', 'kin_kote', 'kin_suneate'] as const;
const NEW10 = ['kin', ...KIN8, 'harapan_mimizu'] as const;

describe('GOLD-1 アイテム・めずらしさ（AC1・AC2）', () => {
  it('10 こ とも 登録 ずみ・ほし 5（epic）', () => {
    for (const id of NEW10) {
      expect(itemType(id as ItemId), id).toBeTruthy();
      expect(itemRarity(id as ItemId), id).toBe('epic');
    }
    expect(itemType('kin_katana')?.maxStack).toBe(1);
    expect(itemType('kin')?.maxStack).toBeGreaterThan(1);
  });
  it('名前 に ルビ なし の 漢字 が 無い', () => {
    for (const id of NEW10) expect(findUnrubiedKanji(itemType(id as ItemId)!.name), id).toEqual([]);
  });
});

describe('GOLD-1 レシピ（AC3）', () => {
  it('きん の やきかた は かまど で kin_tamago 1 → kin 1', () => {
    const k = BAKE_RECIPES.find((r) => r.id === 'kin')!;
    expect(k.station).toBe('furnace');
    expect(k.inputs).toEqual([{ item: 'kin_tamago', count: 1 }]);
    expect(k.output).toEqual({ item: 'kin', count: 1 });
  });
  it('きん の そうび 8 こ の 材料', () => {
    const t = (id: string) => ALL_RECIPES.find((r) => r.id === id)!.inputs.map((i) => `${i.item}${i.count}`).join(',');
    expect(t('kin_katana')).toBe('kin2,log1');
    expect(t('kin_yumi')).toBe('kin3,string3');
    expect(t('kin_pickaxe')).toBe('kin3,log2');
    expect(t('kin_axe')).toBe('kin3,log2');
    expect(t('kin_kabuto')).toBe('kin2,cloth1');
    expect(t('kin_yoroi')).toBe('kin3,string2,cloth2');
    expect(t('kin_kote')).toBe('kin1,cloth1');
    expect(t('kin_suneate')).toBe('kin2,string1');
  });
  it('きん の そうび は「ぜんぶ つくる」にも やく の 1 こ ごと の 表にも 入らない', () => {
    expect(BAKE_RECIPE_NAMES.some(([id]) => id === 'kin')).toBe(false);
    expect(CRAFT_RECIPE_NAMES.some(([id]) => id.startsWith('kin'))).toBe(false);
  });
});

describe('GOLD-1 つよさ・たいきゅう・ぼうぐ（AC4〜AC6）', () => {
  it('かたな・つるはし・おの は 強さ 5・たいきゅう 500', () => {
    for (const id of ['kin_katana', 'kin_pickaxe', 'kin_axe'] as const) expect(TOOL_DEFAULTS.weaponDamage[id], id).toBe(5);
    for (const id of KIN8) expect(W2_SETTING_DEFAULTS.toolDurability[id], id).toBe(500);
  });
  it('ゆみ: ちから 3 だん で 2・3・5', () => {
    expect(W2_SETTING_DEFAULTS.bowDamageByItem.kin_yumi).toEqual([2, 3, 5]);
  });
  it('ほる はやさ は てつ と 同じ', () => {
    expect(TOOL_DEFAULTS.toolPower.kin_pickaxe).toBe(TOOL_DEFAULTS.toolPower.iron_pickaxe);
    expect(TOOL_DEFAULTS.toolPower.kin_axe).toBe(TOOL_DEFAULTS.toolPower.iron_axe);
    expect(TOOL_DEFAULTS.toolLevel.kin_pickaxe).toBe(TOOL_DEFAULTS.toolLevel.iron_pickaxe);
  });
  it('ぼうぐ は てつ より 1 おおく ふせぐ（0 の しゅるい は 0 の まま）・おなじ マス', () => {
    const v = CRAFT_DEFAULTS.armorValue;
    for (const [iron, kin] of [['kabuto', 'kin_kabuto'], ['yoroi', 'kin_yoroi'], ['kote', 'kin_kote'], ['suneate', 'kin_suneate']] as const) {
      for (const k of ['normal', 'ball', 'fall'] as const) {
        const base = v[iron]![k];
        expect(v[kin]![k], `${kin} ${k}`).toBe(base > 0 ? base + 1 : 0);
      }
      expect(ARMOR_SLOT_OF[kin]).toBe(ARMOR_SLOT_OF[iron]);
    }
  });
  it('きん の よろい を 着る と normal が 3 へる', () => {
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    inv.setSlot(0, { item: 'kin_yoroi', count: 1 });
    expect(armor.tryEquip('kin_yoroi')).toBe(true);
    expect(armor.equipped('body')).toBe('kin_yoroi');
    expect(armor.cut('normal')).toBe(3);
  });
});

describe('GOLD-1 説明（AC7・AC21）', () => {
  it('説明 の 表 に 10 こ・文 に ルビ なし の 漢字 が 無い・かたな は たたく つよさ 5・たいきゅう 500', () => {
    const nameOf = (i: ItemId) => itemType(i)?.name ?? i;
    const src = createItemInfo({ recipes: () => ALL_RECIPES, nameOf, numbers: () => defaultInfoNumbers() });
    for (const id of NEW10) {
      const i = src.info(id as ItemId);
      expect(src.items()).toContain(id);
      expect(findUnrubiedKanji(`${i.use}${i.how}${i.source}${i.stats.map((s) => s.label + s.value).join('')}`), id).toEqual([]);
      expect(i.use, id).not.toBe('');
    }
    const st = src.info('kin_katana').stats;
    expect(st.find((s) => s.key === 'damage')?.value).toBe(5);
    expect(st.find((s) => s.key === 'durability')?.value).toBe(500);
  });
});
