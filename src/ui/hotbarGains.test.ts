import { describe, expect, it } from 'vitest';
import type { ItemStack } from '../contracts';
import { gainedItems, snapshotSlots } from './hotbarModel';

const st = (item: string, count = 1) => ({ item, count }) as unknown as ItemStack;

describe('gainedItems〔宝箱の 中身を ホットバーの ぽんに〕', () => {
  it('あけた コマの 前の 状態と くらべて、ふえた マスと アイテムを 返す', () => {
    const before = snapshotSlots([st('stone', 3), null, st('dirt', 1)]);
    const after = [st('stone', 3), st('diamond', 2), st('dirt', 4)];
    expect(gainedItems(before, after)).toEqual([
      { index: 1, item: 'diamond' },
      { index: 2, item: 'dirt' },
    ]);
  });
  it('ふえて いなければ 空', () => {
    const s = [st('stone', 3)];
    expect(gainedItems(snapshotSlots(s), s)).toEqual([]);
  });
  it('描きなおしで 前の 状態が 新しく なる〔こうなると ふたの あとの pickup は 空になる ＝ 今までの ふぐあい〕', () => {
    const after = [st('diamond', 2)];
    expect(gainedItems(snapshotSlots(after), after)).toEqual([]);
  });
});
