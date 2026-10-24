import { describe, expect, it } from 'vitest';
import { ITEM_TYPES } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { rarityIndex } from '../drops/rarityTable';
import { createRng } from '../world/gen/random';
import { RELEASE } from './releaseTuning';
import { rewardRng, rollReward } from './reward';

const R = RELEASE.reward;

describe('ごほうびの 中身（大きな 宝箱）', () => {
  it('忍者の足袋が かならず 1 つ 入る', () => {
    for (let i = 0; i < 50; i++) {
      const stacks = rollReward(createRng(i));
      expect(stacks.filter((s) => s.item === 'ninja_tabi')).toEqual([{ item: 'ninja_tabi', count: 1 }]);
    }
  });

  it('レア素材は 表の 行ごとに 最小〜最大の 個数 入る', () => {
    for (let i = 0; i < 200; i++) {
      const stacks = rollReward(createRng(1000 + i));
      for (const row of R.rare) {
        const s = stacks.find((x) => x.item === row.item);
        expect(s, row.item).toBeDefined();
        expect(s!.count).toBeGreaterThanOrEqual(row.min);
        expect(s!.count).toBeLessThanOrEqual(row.max);
        expect(Number.isInteger(s!.count)).toBe(true);
      }
    }
  });

  it('表の 最小・最大が どちらも 出る（一様）', () => {
    const seen = new Set<number>();
    const row = R.rare[0]!;
    for (let i = 0; i < 400; i++) seen.add(rollReward(createRng(i)).find((x) => x.item === row.item)!.count);
    expect(Math.min(...seen)).toBe(row.min);
    expect(Math.max(...seen)).toBe(row.max);
  });

  it('同じ シードなら 同じ 中身（シード付きの 乱数）', () => {
    expect(rollReward(rewardRng(9, 3))).toEqual(rollReward(rewardRng(9, 3)));
  });

  it('表の アイテムは ぜんぶ 本当に ある アイテムで、レア素材は レア（スーパーレア いか 〜 ） 以上、足袋は レジェンダリー', () => {
    const ids = new Set(ITEM_TYPES.map((t) => t.id));
    for (const g of R.guaranteed) expect(ids.has(g.item) || g.item === 'ninja_tabi', g.item).toBe(true);
    for (const row of R.rare) {
      expect(ids.has(row.item), row.item).toBe(true);
      expect(rarityIndex(itemRarity(row.item)), row.item).toBeGreaterThanOrEqual(1); // ふつう（0）より 上
      expect(row.max).toBeGreaterThanOrEqual(row.min);
      expect(row.min).toBeGreaterThanOrEqual(1);
    }
    expect(itemRarity('ninja_tabi')).toBe('legendary');
  });

  it('1 つの 山の 数が 持ち物の 上限（maxStack）を こえない（宝箱から 出る ときは 山ごと）', () => {
    const max = new Map(ITEM_TYPES.map((t) => [t.id, t.maxStack]));
    for (const s of rollReward(createRng(1))) expect(s.count).toBeLessThanOrEqual(max.get(s.item) ?? 99);
  });
});
