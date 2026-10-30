import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { ARMOR_SLOT_OF } from '../../craft/config';
import { createItemInfo, defaultInfoNumbers } from '../../craft/info';
import { ALL_RECIPES, CRAFT_RECIPES } from '../../craft/recipes';
import { InventoryImpl } from '../../inventory/Inventory';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { findUnrubiedKanji } from '../../ui/text';
import { BLOCK_INDEX, BLOCK_TYPES } from '../../world/blocks/blockTypes';
import { LIGHT_CONFIG } from '../../world/light/config';
import { EMISSION } from '../../world/light/opacity';
import { GADGET_TUNING, jumpHeightWith } from './gadgetTuning';
import { itemDef } from './registry';

/**
 * ITEM-FX-1（issue #342）の AC のうち、表・持ち物・作り方・説明で見られるもの。
 * 数は gadgetTuning.ts から読む（決め打ちしない）。約束は docs/tickets/ITEM-FX-1-contract.md。
 */

const SIX = ['lantern', 'kite', 'futon', 'omamori', 'waraji', 'haniwa'] as const;
const nameOf = (i: ItemId) => itemType(i)?.name ?? i;
const info = createItemInfo({ recipes: () => ALL_RECIPES, nameOf, numbers: defaultInfoNumbers });

describe('数の表 GADGET_TUNING（1 か所）', () => {
  it('ちょうちんの光はたいまつより強く、最大の 15 を こえない（AC2）', () => {
    expect(GADGET_TUNING.lantern.light).toBeGreaterThan(LIGHT_CONFIG.torchLevel);
    expect(GADGET_TUNING.lantern.light).toBeLessThanOrEqual(LIGHT_CONFIG.maxLevel);
  });
  it('湧かない半径はたいまつ（8）より広い（AC3）', () => {
    expect(GADGET_TUNING.lantern.noSpawnRadius).toBeGreaterThan(LIGHT_CONFIG.torchDimRadius);
  });
  it('たこの高さ・ふとんの長さ・おまもりの数・わらじの高さが正の数で入っている', () => {
    expect(GADGET_TUNING.kite.height).toBeGreaterThan(0);
    expect(GADGET_TUNING.futon.sleepSteps).toBeGreaterThan(0);
    expect(GADGET_TUNING.omamori.maxOwned).toBe(1); // AC13: 持ち物全体で 1 つだけ
    expect(GADGET_TUNING.waraji.jumpHeight).toBeGreaterThan(1.25); // AC17: ふだん 1.25 より高い
    expect(GADGET_TUNING.waraji.jumpHeight).toBeLessThan(2); // 1 段は届くが 2 段は届かない
  });
  it('jumpHeightWith: わらじを足にはいている間だけ高い。ほかの足の防具・はだしは元のまま（AC17）', () => {
    expect(jumpHeightWith('waraji', 1.25)).toBe(GADGET_TUNING.waraji.jumpHeight);
    expect(jumpHeightWith(null, 1.25)).toBe(1.25);
    expect(jumpHeightWith('suneate', 1.25)).toBe(1.25);
    expect(jumpHeightWith('ninja_tabi', 1.25)).toBe(1.25);
  });
});

describe('ブロック（AC1・AC5・AC18）', () => {
  it('lantern・futon・haniwa は BLOCK_TYPES に入り、こわせる。同名のアイテムが置く', () => {
    for (const id of ['lantern', 'futon', 'haniwa'] as const) {
      const b = BLOCK_TYPES.find((t) => t.id === id);
      expect(b, id).toBeDefined();
      expect(b!.breakable, id).toBe(true);
      expect(itemType(id)?.placeBlock, id).toBe(id);
    }
  });
  it('ちょうちんの出す光は表の数。たいまつより強い（AC2）', () => {
    expect(EMISSION[BLOCK_INDEX.lantern]).toBe(GADGET_TUNING.lantern.light);
    expect(EMISSION[BLOCK_INDEX.torch]).toBe(LIGHT_CONFIG.torchLevel);
  });
  it('kite・omamori・waraji は置けない', () => {
    for (const id of ['kite', 'omamori', 'waraji', 'omamori_torn'] as const) expect(itemType(id as ItemId)?.placeBlock ?? null, id).toBeNull();
  });
});

describe('作り方と説明（6 つとも働きが入った）', () => {
  it('作り方の works が全部 true（時計の絵が出ない）。はにわはかまどで焼く', () => {
    for (const id of SIX) {
      const r = ALL_RECIPES.find((x) => x.id === id);
      expect(r, id).toBeDefined();
      expect(r!.works, id).toBe(true);
    }
    expect(ALL_RECIPES.find((x) => x.id === 'haniwa')!.station).toBe('furnace');
  });
  it('説明は「できること」になり（later なし）、ルビなしの漢字と数字が無い', () => {
    for (const id of SIX) {
      const i = info.info(id as ItemId);
      expect(i.later, id).toBeNull();
      expect(i.use, id).not.toMatch(/もうすぐ/);
      expect(i.how, id).not.toBe('いまは もてる だけ');
      expect(i.use.length, id).toBeGreaterThan(0);
      expect(findUnrubiedKanji(`${i.use}${i.how}`), id).toEqual([]);
      expect(`${i.use}${i.how}`, id).not.toMatch(/[0-9０-９]/); // 内部の数字は書かない
    }
  });
});

describe('おまもり（AC12〜AC14）', () => {
  it('やぶれた おまもり: 新しいアイテム。記念の品で 64 まで重なり、作り方がなく、持ち物の並びに 1 回だけ（AC12）', () => {
    const t = ITEM_TYPES.find((x) => x.id === 'omamori_torn');
    expect(t).toBeDefined();
    expect(t!.maxStack).toBe(64);
    expect(ITEM_TYPES.filter((x) => x.id === 'omamori_torn')).toHaveLength(1);
    expect(ALL_RECIPES.some((r) => r.output.item === ('omamori_torn' as ItemId))).toBe(false);
    expect(itemDef('omamori_torn')?.wear).toBe('permanent');
    const inv = new InventoryImpl();
    expect(inv.add('omamori_torn' as ItemId, 64)).toBe(0); // 64 まで重なる
    expect(inv.slots().filter((s) => s).length).toBe(1);
    expect(inv.add('omamori_torn' as ItemId, 1)).toBe(0); // 2 つ目以上も持てる（制限なし）
  });
  it('材料は すいしょう 3・きん 1・ぬの 2・いと 2（AC14）', () => {
    const r = CRAFT_RECIPES.find((x) => x.id === 'omamori')!;
    expect(r.output).toEqual({ item: 'omamori', count: 1 });
    expect(r.inputs).toEqual([
      { item: 'crystal', count: 3 },
      { item: 'kin', count: 1 },
      { item: 'cloth', count: 2 },
      { item: 'string', count: 2 },
    ]);
  });
  it('持ち物全体で 1 つだけ: 持っていると 入らない（戻り値 = 入らなかった数）。ほかのマスでも・手に持っていても同じ（AC13）', () => {
    const max = GADGET_TUNING.omamori.maxOwned;
    const inv = new InventoryImpl();
    expect(inv.add('omamori', 1)).toBe(0);
    expect(inv.add('omamori', 1)).toBe(1);
    expect(inv.count('omamori')).toBe(max);
    // 別のマスにあっても数える
    const inv2 = new InventoryImpl();
    inv2.setSlot(inv2.size - 1, { item: 'omamori', count: 1 });
    expect(inv2.add('omamori', 1)).toBe(1);
    expect(inv2.count('omamori')).toBe(max);
    // 手放したらまた入る
    inv2.setSlot(inv2.size - 1, null);
    expect(inv2.add('omamori', 1)).toBe(0);
    // やぶれた おまもり は数えない
    inv.add('omamori_torn' as ItemId, 1);
    expect(inv.count('omamori')).toBe(max);
  });
});

describe('わらじ（AC16）', () => {
  it('足（legs）の防具。守りは 0。すねあて・忍者の足袋と同じ場所', () => {
    expect(ARMOR_SLOT_OF.waraji).toBe('legs');
    expect(ARMOR_SLOT_OF.waraji).toBe(ARMOR_SLOT_OF.suneate);
    const d = itemDef('waraji')!;
    expect(d.armor?.slot).toBe('legs');
    expect(d.armor?.value).toEqual({ normal: 0, ball: 0, fall: 0 });
    expect(d.maxStack).toBe(1);
  });
});
