import { describe, expect, it } from 'vitest';
import { ITEM_TYPES } from '../inventory/items';
import { itemIconPixels } from './itemIcon';
import { W7_ITEMS, isW7Item, w7ItemPixels } from './itemArtW7';

/** WEAPON-7: 雷神剣の 絵（オーナー決定 v3-A） */
describe('雷神剣の アイコン（v3-A）', () => {
  const px = w7ItemPixels('raijin_ken');
  const has = (hex: number) => px.some((c) => c[3] === 255 && ((c[0] << 16) | (c[1] << 8) | c[2]) === hex);
  it('16x16・アイテムの 絵の 口から 同じ 絵が 出る・ほかの 刀と ちがう', () => {
    expect(px).toHaveLength(256);
    expect(itemIconPixels('raijin_ken')).toEqual(px);
    expect(isW7Item('raijin_ken')).toBe(true);
    expect(isW7Item('katana')).toBe(false);
    expect(W7_ITEMS).toContain('raijin_ken'); // PR2 で 風神剣の 絵が 足されても よい
    for (const it of ['katana', 'crystal_katana', 'bokuto'] as const) expect(itemIconPixels(it)).not.toEqual(px);
  });
  it('そった むらさきの 刃・金の 小さな つば・こん色の 柄（柄なし・大きな 丸い つばは NG）', () => {
    expect(has(0xb080ff)).toBe(true); // 刃の むらさき
    expect(has(0x6a3fc8)).toBe(true);
    expect(has(0xf1e4ff)).toBe(true); // 刃の つや
    const gold = px.filter((c) => c[3] === 255 && ((c[0] << 16) | (c[1] << 8) | c[2]) === 0xf2c230).length;
    expect(gold, '金の つばは 小さい').toBeGreaterThanOrEqual(2);
    expect(gold).toBeLessThanOrEqual(6);
    expect(has(0x24336e)).toBe(true); // 柄の こん色
    expect(has(0x3f56a8)).toBe(true);
  });
  it('アイテムの 表に ある・めずらしさの ことば どおり 1 本だけ', () => {
    expect(ITEM_TYPES.filter((t) => t.id === 'raijin_ken')).toHaveLength(1);
  });
});
