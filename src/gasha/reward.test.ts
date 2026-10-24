import { describe, expect, it } from 'vitest';
import { ITEM_TYPES } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { rarityIndex } from '../drops/rarityTable';
import { createRng } from '../world/gen/random';
import { NINJA_GEAR } from '../craft/config';
import { RELEASE } from './releaseTuning';
import { rewardRng, rollReward } from './reward';

const R = RELEASE.reward;

describe('ごほうびの 中身（コアを こわした 一山）', () => {
  // NINJA-1（#299）で 変わった: 足袋 ぴったり ではなく「まだ 手に 入れて いない 忍者装備 1 つ」。くわしくは src/craft/ninjaDrop.test.ts
  it('忍者装備が かならず 1 つ 入る（4 つの どれか。調整表の guaranteed には 置かない）', () => {
    const ninja = Object.values(NINJA_GEAR) as string[];
    for (let i = 0; i < 50; i++) {
      const stacks = rollReward(createRng(i));
      const mine = stacks.filter((s) => ninja.includes(s.item));
      expect(mine).toHaveLength(1);
      expect(mine[0]!.count).toBe(1);
    }
    for (const g of R.guaranteed) expect(ninja).not.toContain(g.item);
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

  it('表の アイテムは ぜんぶ 本当に ある アイテムで、レア素材は レア（スーパーレア いか 〜 ） 以上、忍者装備 4 つは レジェンダリー', () => {
    const ids = new Set(ITEM_TYPES.map((t) => t.id));
    for (const g of R.guaranteed) expect(ids.has(g.item), g.item).toBe(true);
    for (const row of R.rare) {
      expect(ids.has(row.item), row.item).toBe(true);
      expect(rarityIndex(itemRarity(row.item)), row.item).toBeGreaterThanOrEqual(1); // ふつう（0）より 上
      expect(row.max).toBeGreaterThanOrEqual(row.min);
      expect(row.min).toBeGreaterThanOrEqual(1);
    }
    for (const id of Object.values(NINJA_GEAR)) expect(itemRarity(id), id).toBe('legendary');
  });

  it('1 つの 山の 数が 持ち物の 上限（maxStack）を こえない（ばらまく ときは 山ごと）', () => {
    const max = new Map(ITEM_TYPES.map((t) => [t.id, t.maxStack]));
    for (const s of rollReward(createRng(1))) expect(s.count).toBeLessThanOrEqual(max.get(s.item) ?? 99);
  });
});
