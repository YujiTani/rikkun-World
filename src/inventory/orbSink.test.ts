import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { InventoryImpl } from './Inventory';

/** TOWN-1 1.6〔1F〕AC62・AC65・§2.3b の 5: ようかいダマ（yokai_orb）は どの 道でも もちものの マスに 入らず さいふへ */
const ORB = 'yokai_orb' as ItemId;
const DIRT = 'dirt' as ItemId;

function rig() {
  const inv = new InventoryImpl();
  const got: number[] = [];
  inv.orbSink = (n) => void got.push(n);
  return { inv, got };
}

describe('入口（orbSink）', () => {
  it('add: ぜんぶ さいふへ・返り値 0（あふれ なし）・マスは かわらない', () => {
    const { inv, got } = rig();
    for (let i = 0; i < inv.size; i++) inv.setSlot(i, { item: DIRT, count: 1 }); // いっぱい
    const before = JSON.stringify(inv.slots());
    expect(inv.add(ORB, 5)).toBe(0);
    expect(got).toEqual([5]);
    expect(JSON.stringify(inv.slots())).toBe(before);
    expect(inv.count(ORB)).toBe(0);
  });
  it('setSlot・setCursor でも マスに 入らず さいふへ', () => {
    const { inv, got } = rig();
    inv.setSlot(3, { item: ORB, count: 4 });
    expect(inv.slots()[3]).toBeNull();
    inv.setCursor({ item: ORB, count: 2 });
    expect(inv.cursor()).toBeNull();
    expect(got).toEqual([4, 2]);
  });
  it('ほかの 物は 今までどおり。0 以下は 何も しない', () => {
    const { inv, got } = rig();
    expect(inv.add(DIRT, 3)).toBe(0);
    expect(inv.count(DIRT)).toBe(3);
    expect(inv.add(ORB, 0)).toBe(0);
    expect(got).toEqual([]);
  });
  it('つないで いなければ（さいふの ない 道具・テスト）今までどおり マスに 入る', () => {
    const inv = new InventoryImpl();
    inv.add(ORB, 3);
    expect(inv.count(ORB)).toBe(3);
  });
});
