import { describe, expect, it } from 'vitest';
import type { ArmorSlot, ItemId } from '../../contracts';
import { ITEM_DEFS } from '../../content/items/registry';
import { rarityTier } from '../../drops/rarityTable';
import { fakeWallet } from '../../dama/walletTestKit';
import { InventoryImpl } from '../../inventory/Inventory';
import { ArmorSystemImpl } from '../../craft/ArmorSystem';
import { createCraftConfig } from '../../craft/config';
import { SmithService } from './smith';
import { SMITH_PRICE } from './vendorTable';

/** TOWN-1 1E AC34: かじやさん（ようかいダマで たいきゅうを まんたんに。ねだんは めずらしさの ★ だけで 決まる） */

function rig() {
  const inv = { 1: new InventoryImpl(), 2: new InventoryImpl() };
  const armor = { 1: new ArmorSystemImpl(inv[1], createCraftConfig()), 2: new ArmorSystemImpl(inv[2], createCraftConfig()) };
  const wallet = fakeWallet(); // 1.6〔1F〕: さいふ
  const smith = new SmithService({ inventory: (w) => inv[w], wallet, armor: (w) => armor[w] });
  return { inv, wallet, armor, smith };
}

const stars = (id: string): number => rarityTier(ITEM_DEFS[id as keyof typeof ITEM_DEFS].rarity).stars;
const priceOf = (id: string): number => SMITH_PRICE[stars(id) as keyof typeof SMITH_PRICE];

describe('AC34 かじやさん', () => {
  it('1 へった かたな と 半分の かたな で ねだんが 同じ（その ★ の 数）', () => {
    const r = rig();
    r.inv[1].setSlot(1, { item: 'katana', count: 1 });
    r.inv[1].setSlot(2, { item: 'katana', count: 1 });
    const max = r.inv[1].durability(1)!.max;
    r.inv[1].setDurability(1, max - 1);
    r.inv[1].setDurability(2, Math.floor(max / 2));
    const items = r.smith.items(1);
    const a = items.find((i) => i.slot === 1)!;
    const b = items.find((i) => i.slot === 2)!;
    expect(a.price).toBe(b.price);
    expect(a.price).toBe(priceOf('katana'));
    expect(a.durability).toBe(max - 1);
    expect(a.max).toBe(max);
  });

  it('ねだんの 表は ★1〜7 ぜんぶ（§4.8）', () => {
    expect(Object.keys(SMITH_PRICE).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // レジェンダリー（★7・たいきゅう 10000）も 30 で なおせる
    const r = rig();
    r.inv[1].setSlot(0, { item: 'raijin_ken', count: 1 });
    const d = r.inv[1].durability(0)!;
    expect(stars('raijin_ken')).toBe(7);
    r.inv[1].setDurability(0, d.max - 1);
    expect(r.smith.items(1).find((i) => i.slot === 0)!.price).toBe(SMITH_PRICE[7]);
  });

  it('fix で ようかいダマが その 数 へり たいきゅうが max。まんたんの 物・ブロックは items に ない', () => {
    const r = rig();
    r.inv[1].setSlot(0, { item: 'katana', count: 1 });
    r.inv[1].setSlot(3, { item: 'dirt', count: 10 });
    r.inv[1].setSlot(4, { item: 'stone_pickaxe', count: 1 }); // まんたん
    r.wallet.add(1, 20);
    const max = r.inv[1].durability(0)!.max;
    r.inv[1].setDurability(0, 3);
    const items = r.smith.items(1);
    expect(items.map((i) => i.slot)).toEqual([0]);
    expect(items[0]!.canFix).toBe(true);
    expect(r.smith.fix(1, 0)).toBe('ok');
    expect(r.wallet.count(1)).toBe(20 - priceOf('katana'));
    expect(r.inv[1].durability(0)).toEqual({ max, left: max });
    expect(r.smith.items(1)).toEqual([]);
    expect(r.smith.fix(1, 0), 'まんたんは full').toBe('full');
    expect(r.smith.fix(1, 3), 'ブロックは full').toBe('full');
  });

  it('着て いる 防具も 出て なおせる（slot は armor:<部位>）', () => {
    const r = rig();
    r.inv[1].setSlot(0, { item: 'kabuto', count: 1 } as never);
    r.inv[1].select(0);
    expect(r.armor[1].tryEquip('kabuto' as ItemId)).toBe(true);
    const slot: ArmorSlot = 'head';
    const d = r.armor[1].durability(slot)!;
    r.armor[1].setDurability(slot, 1);
    r.wallet.add(1, 50);
    const it0 = r.smith.items(1).find((i) => i.slot === 'armor:head')!;
    expect(it0.item).toBe('kabuto');
    expect(it0.price).toBe(priceOf('kabuto'));
    expect(r.smith.fix(1, 'armor:head')).toBe('ok');
    expect(r.armor[1].durability(slot)).toEqual({ max: d.max, left: d.max });
    expect(r.wallet.count(1)).toBe(50 - priceOf('kabuto'));
  });

  it('ダマ たりない → short・何も かわらない。2P の ものは 1P と 別', () => {
    const r = rig();
    r.inv[1].setSlot(0, { item: 'katana', count: 1 });
    r.inv[1].setDurability(0, 2);
    r.wallet.add(1, priceOf('katana') - 1);
    const it0 = r.smith.items(1)[0]!;
    expect(it0.canFix).toBe(false);
    expect(r.smith.fix(1, 0)).toBe('short');
    expect(r.wallet.count(1)).toBe(priceOf('katana') - 1);
    expect(r.inv[1].durability(0)!.left).toBe(2);
    expect(r.smith.short(1, 0)).toBe(1);
    expect(r.smith.items(2)).toEqual([]);
  });

  it('2P が いない ときは 何も ない', () => {
    const inv = new InventoryImpl();
    const smith = new SmithService({ inventory: (w) => (w === 1 ? inv : null), wallet: fakeWallet(), armor: () => null });
    expect(smith.items(2)).toEqual([]);
    expect(smith.fix(2, 0)).toBe('full');
  });
});
