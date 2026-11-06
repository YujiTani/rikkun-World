import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { chestFrontAt, chestBlockId } from '../../world/blocks/chestBlock';
import { chestLogLine } from './mine';

const R: Record<string, number> = { a: 1, b: 5, c: 3, d: 2, e: 4 };
const rarity = (i: ItemId): number => R[i]!;
const name = (i: ItemId): string => `N${i}`;
const got = (...ids: string[]) => ids.map((item) => ({ item: item as ItemId }));

describe('chestLogLine〔宝箱の 中身の 1 行〕', () => {
  it('めずらしい 順の 先頭 3 つ ＋「など」〔種類が 4 つ いじょう〕', () => {
    expect(chestLogLine(got('a', 'b', 'c', 'd'), name, rarity)).toBe('たからばこ から Nb と Nc と Nd など を てにいれた！');
  });
  it('3 つ いかは「など」なし・同じ アイテムは 1 つ', () => {
    expect(chestLogLine(got('a', 'a', 'b'), name, rarity)).toBe('たからばこ から Nb と Na を てにいれた！');
  });
  it('空なら null', () => {
    expect(chestLogLine([], name, rarity)).toBeNull();
  });
});

describe('chestFrontAt〔となりあう 宝箱〕', () => {
  it('南向きの 2 つが よこに ならんでも 4 マス とも 南向き', () => {
    const cells = new Map<number, string>();
    // s の 右は +x: 本体 0・のこり 1・本体 2・のこり 3
    [false, true, false, true].forEach((rest, i) => cells.set(i, chestBlockId(1, false, rest)));
    const get = (x: number): string => cells.get(x) ?? 'air';
    expect([0, 1, 2, 3].map((x) => chestFrontAt((px) => get(px), x, 0, 0))).toEqual(['s', 's', 's', 's']);
  });
});
