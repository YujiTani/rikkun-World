import { describe, expect, it } from 'vitest';
import { chestExcluded, rollChest } from './mineChest';

/** TOWN-1 1A AC6: 宝箱の くじ（どの 表・シード 1,000 こ）で ようかいダマが 1 こも 出ない。のぞく 表に 行が あり、理由は 新しい 文 */
describe('AC6: 宝箱から ようかいダマは 出ない', () => {
  it('chestExcluded() に yokai_orb が あり、理由は 新しい 文（行は 消さない）', () => {
    const row = chestExcluded().find((e) => (e.item as string) === 'yokai_orb');
    expect(row).toBeDefined();
    expect(row!.reason).toContain('ようかいダマ');
    expect(row!.reason).toContain('たからばこ');
    expect(row!.reason).not.toContain('いまは 手に 入らない');
  });
  it('どの 段・どの シードでも 1 こも 出ない（1,000 シード × 4 段）', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      for (const tier of [1, 2, 3, 4] as const) {
        for (const it of rollChest('kodo', seed, tier).items) expect(it.item as string, `seed ${seed} 段 ${tier}`).not.toBe('yokai_orb');
      }
    }
  });
});
