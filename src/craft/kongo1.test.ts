import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { ITEM_TYPES, itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { findUnrubiedKanji } from '../ui/text';
import { itemCategory } from '../ui/itemCategory';
import { TOOL_DEFAULTS } from '../tools/config';
import { DIG_DEFAULTS } from '../dig/config';
import { digTicksWith } from '../dig/toolFamily';
import { ArmorSystemImpl } from './ArmorSystem';
import { CRAFT_DEFAULTS, ARMOR_SLOT_OF } from './config';
import { ALL_RECIPES } from './recipes';
import { createItemInfo, defaultInfoNumbers } from './info/build';
import { STAT_MAX } from './info/table';
import { CRAFT_RECIPE_NAMES } from '../achievements/defs';

/**
 * KONGO-1 ユニット（docs/design/KONGO-1.md 版 1.1 §6 の 【ユニット】: AC1〜AC7・AC9b）。
 * 実装の 前に 書いた テスト（落ちるのが 正しい）。件数は 決めうちせず 表から 数える（#311）。
 * 並べ方・材料・強さ・防ぐ量は 仕様 §4 の 表そのもの（仕様が 決めた 値の 写し）。
 */
const EQUIP = ['kongo_katana', 'kongo_yumi', 'kongo_pickaxe', 'kongo_axe', 'kongo_kabuto', 'kongo_yoroi', 'kongo_kote', 'kongo_suneate'] as const;
const ALL9 = ['diamond', ...EQUIP] as const;
const GOLD_EQUIP = ['kin_katana', 'kin_yumi', 'kin_pickaxe', 'kin_axe', 'kin_kabuto', 'kin_yoroi', 'kin_kote', 'kin_suneate'] as const;

// ItemId に まだ 無い id を 読むので Record<string, …> として 扱う（実装の あとも 型は 通る）
const WD = TOOL_DEFAULTS.weaponDamage as Record<string, number | undefined>;
const TP = TOOL_DEFAULTS.toolPower as Record<string, number | undefined>;
const TL = TOOL_DEFAULTS.toolLevel as Record<string, number | undefined>;
const TD = W2_SETTING_DEFAULTS.toolDurability as Record<string, number | undefined>;
const BD = W2_SETTING_DEFAULTS.bowDamageByItem as Record<string, number[] | undefined>;
const AV = CRAFT_DEFAULTS.armorValue as Record<string, Record<string, number> | undefined>;
const SLOT = ARMOR_SLOT_OF as Record<string, string | undefined>;

const NAMES: Record<string, string> = {
  diamond: 'ダイヤ',
  kongo_katana: 'こんごうの かたな',
  kongo_yumi: 'こんごうの ゆみ',
  kongo_pickaxe: 'こんごうの つるはし',
  kongo_axe: 'こんごうの おの',
  kongo_kabuto: 'こんごうの かぶと',
  kongo_yoroi: 'こんごうの よろい',
  kongo_kote: 'こんごうの こて',
  kongo_suneate: 'こんごうの すねあて',
};
const CATS: Record<string, string> = {
  diamond: 'metal',
  kongo_katana: 'weapon',
  kongo_yumi: 'weapon',
  kongo_pickaxe: 'tool',
  kongo_axe: 'tool',
  kongo_kabuto: 'armor',
  kongo_yoroi: 'armor',
  kongo_kote: 'armor',
  kongo_suneate: 'armor',
};

describe('KONGO-1 AC1 アイテム 9 こ・めずらしさ', () => {
  it('9 こ とも 登録 ずみ・名前・かさなる 数・なかま が 表の とおり', () => {
    for (const id of ALL9) {
      const t = itemType(id as ItemId);
      expect(t, id).toBeTruthy();
      expect(t!.name, id).toBe(NAMES[id]);
      expect(itemCategory(id as ItemId), id).toBe(CATS[id]);
    }
    expect(itemType('diamond' as ItemId)!.maxStack).toBe(64);
    for (const id of EQUIP) expect(itemType(id as ItemId)!.maxStack, id).toBe(1);
  });
  it('9 こ とも mythic（ほし 6）。金の 10 こ は epic の まま', () => {
    for (const id of ALL9) expect(itemRarity(id as ItemId), id).toBe('mythic');
    for (const id of ['kin', ...GOLD_EQUIP, 'harapan_mimizu']) expect(itemRarity(id as ItemId), id).toBe('epic');
  });
  it('mythic は ちょうど この 9 こ（表から 数える）', () => {
    const mythic = ITEM_TYPES.filter((t) => itemRarity(t.id) === 'mythic').map((t) => t.id as string);
    expect([...mythic].sort()).toEqual([...ALL9].sort());
  });
  it('持ち物の 並び: 金の そうびの すぐ うしろに diamond・そうび 8 こ の 順', () => {
    const ids = ITEM_TYPES.map((t) => t.id as string);
    const from = ids.indexOf('kin_suneate') + 1;
    expect(ids.slice(from, from + 9)).toEqual([...ALL9]);
  });
});

describe('KONGO-1 AC2 作り方', () => {
  const t = (id: string) => ALL_RECIPES.find((r) => r.id === id)!.inputs.map((i) => `${i.item}${i.count}`).join(',');
  it('8 この ざいりょう（ダイヤ 合計 19）', () => {
    expect(t('kongo_katana')).toBe('diamond2,log1');
    expect(t('kongo_yumi')).toBe('diamond3,string3');
    expect(t('kongo_pickaxe')).toBe('diamond3,log2');
    expect(t('kongo_axe')).toBe('diamond3,log2');
    expect(t('kongo_kabuto')).toBe('diamond2,cloth1');
    expect(t('kongo_yoroi')).toBe('diamond3,string2,cloth2');
    expect(t('kongo_kote')).toBe('diamond1,cloth1');
    expect(t('kongo_suneate')).toBe('diamond2,string1');
    const total = EQUIP.reduce((s, id) => s + ALL_RECIPES.find((r) => r.id === id)!.inputs.filter((i) => (i.item as string) === 'diamond').reduce((a, i) => a + i.count, 0), 0);
    expect(total).toBe(19);
  });
  it('作業台の カードの いちばん うしろに 金 8 こ → こんごう 8 こ の 順。diamond の カードは ない', () => {
    const ids = ALL_RECIPES.map((r) => r.output.item as string);
    expect(ids.slice(-16)).toEqual([...GOLD_EQUIP, ...EQUIP]);
    expect(ids).not.toContain('diamond');
  });
  it('1 こ ごとの つくる 実績の 表には 入らない', () => {
    expect(CRAFT_RECIPE_NAMES.some(([id]) => id.startsWith('kongo') || id === 'diamond')).toBe(false);
  });
});

describe('KONGO-1 AC3 強さ・たいきゅう・メーター', () => {
  it('たたく つよさ: かたな 7・つるはし 6・おの 6。金は 5 の まま', () => {
    expect(WD.kongo_katana).toBe(7);
    expect(WD.kongo_pickaxe).toBe(6);
    expect(WD.kongo_axe).toBe(6);
    expect(WD.kin_katana).toBe(5);
  });
  it('ほる強さ: つるはし・おの 8、おの の レベル 0', () => {
    expect(TP.kongo_pickaxe).toBe(8);
    expect(TP.kongo_axe).toBe(8);
    expect(TL.kongo_axe).toBe(0);
  });
  it('たいきゅう 8 こ とも 1500', () => {
    for (const id of EQUIP) expect(TD[id], id).toBe(1500);
  });
  it('ゆみ: や 段 1・2・3 = 3・4・7（金は 2・3・5 の まま）', () => {
    expect(BD.kongo_yumi).toEqual([3, 4, 7]);
    expect(BD.kin_yumi).toEqual([2, 3, 5]);
  });
  it('メーターの 最大: STAT_MAX は damage 8・dig 8・guard 5', () => {
    expect(STAT_MAX).toEqual({ dig: 8, damage: 8, guard: 5 });
  });
  it('説明の 表: かたな たたく 7・たいきゅう 1500・つるはし ほる 8。メーターの 最大を こえない', () => {
    const nameOf = (i: ItemId) => itemType(i)?.name ?? i;
    const src = createItemInfo({ recipes: () => ALL_RECIPES, nameOf, numbers: () => defaultInfoNumbers() });
    const k = src.info('kongo_katana' as ItemId).stats;
    expect(k.find((s) => s.key === 'damage')?.value).toBe(7);
    expect(k.find((s) => s.key === 'durability')?.value).toBe(1500);
    const p = src.info('kongo_pickaxe' as ItemId).stats;
    expect(p.find((s) => s.key === 'dig')?.value).toBe(8);
    for (const id of ALL9) {
      expect(src.items()).toContain(id);
      for (const s of src.info(id as ItemId).stats) {
        if (typeof s.value === 'number' && s.max !== undefined) expect(s.value, `${id} ${s.key}`).toBeLessThanOrEqual(s.max);
      }
    }
    expect(src.info('kongo_pickaxe' as ItemId).use).toBe('いちばん はやく ほれる。ダイヤ も ほれる');
  });
});

describe('KONGO-1 AC4 つるはしの レベル（表から 計算）', () => {
  it('全ブロックの いる 段階の 最大 以上・ほかの どの つるはし 以上', () => {
    const lv = TL.kongo_pickaxe;
    expect(lv).toBeDefined();
    const maxBlock = Math.max(...Object.values(DIG_DEFAULTS.harvestLevel).map((n) => n ?? 0));
    expect(lv!).toBeGreaterThanOrEqual(maxBlock);
    const others = Object.entries(TOOL_DEFAULTS.toolLevel).filter(([id]) => id.endsWith('_pickaxe') && id !== 'kongo_pickaxe');
    expect(others.length).toBeGreaterThan(1);
    for (const [id, n] of others) expect(lv!, id).toBeGreaterThanOrEqual(n ?? 0);
  });
});

describe('KONGO-1 AC5 防具', () => {
  it('armorValue: かぶと ball 4・よろい normal 4・こて normal 3・すねあて fall 4（ほかの 種類は 0）。おなじ マス', () => {
    const v = AV;
    expect(v.kongo_kabuto).toEqual({ normal: 0, ball: 4, fall: 0 });
    expect(v.kongo_yoroi).toEqual({ normal: 4, ball: 0, fall: 0 });
    expect(v.kongo_kote).toEqual({ normal: 3, ball: 0, fall: 0 });
    expect(v.kongo_suneate).toEqual({ normal: 0, ball: 0, fall: 4 });
    for (const [g, k] of GOLD_EQUIP.slice(4).map((g, i) => [g, EQUIP[4 + i]] as const)) expect(SLOT[k], k).toBe(SLOT[g]);
  });
  it('かぶと を きて ball 5 を 受ける → 1。よろい を きて normal 3 → 1（最低 1）', () => {
    const mk = (item: string) => {
      const inv = new InventoryImpl();
      const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
      inv.setSlot(0, { item: item as ItemId, count: 1 });
      expect(armor.tryEquip(item as ItemId)).toBe(true);
      return armor;
    };
    expect(5 - mk('kongo_kabuto').cut('ball')).toBe(1);
    expect(Math.max(1, 3 - mk('kongo_yoroi').cut('normal'))).toBe(1);
    expect(mk('kongo_yoroi').equipped('body')).toBe('kongo_yoroi');
  });
});

describe('KONGO-1 AC7 文字', () => {
  it('名前・説明 に ルビ なし の 漢字 が 無い', () => {
    const nameOf = (i: ItemId) => itemType(i)?.name ?? i;
    const src = createItemInfo({ recipes: () => ALL_RECIPES, nameOf, numbers: () => defaultInfoNumbers() });
    for (const id of ALL9) {
      const i = src.info(id as ItemId);
      expect(findUnrubiedKanji(itemType(id as ItemId)!.name), id).toEqual([]);
      expect(findUnrubiedKanji(`${i.use}${i.how}${i.source}`), id).toEqual([]);
      expect(i.use, id).not.toBe('');
    }
  });
});

describe('KONGO-1 AC9b ほる はやさ', () => {
  it('てつの 鉱石を kongo_pickaxe は kin_pickaxe より 少ない ステップで ほる', () => {
    const cfg = DIG_DEFAULTS;
    const kongo = digTicksWith(cfg, TOOL_DEFAULTS, 'iron_ore', 'kongo_pickaxe' as ItemId);
    const kin = digTicksWith(cfg, TOOL_DEFAULTS, 'iron_ore', 'kin_pickaxe');
    expect(kongo).not.toBeNull();
    expect(kin).not.toBeNull();
    expect(kongo!).toBeLessThan(kin!);
  });
});
