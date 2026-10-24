import { describe, expect, it } from 'vitest';
import { createRng } from '../world/gen/random';
import { NINJA_GEAR } from '../craft/config';
import { CHEST_LOOT, rollChestLoot } from './chestLoot';

describe('宝箱のレアドロップ（#293 試作・忍者装備）', () => {
  it('表に 忍者の足袋が 0.3% で 入っている', () => {
    const e = CHEST_LOOT.find((x) => x.item === 'ninja_tabi');
    expect(e?.chance).toBe(0.003);
  });
  it('忍者装備の まとまり: 足袋は あしの マス（ほかの 部位は まだ ない）', () => {
    expect(NINJA_GEAR).toEqual({ legs: 'ninja_tabi' });
  });
  it('乱数が 0.003 より 小さい ときだけ 出る', () => {
    expect(rollChestLoot(() => 0.0029)).toEqual(['ninja_tabi']);
    expect(rollChestLoot(() => 0.003)).toEqual([]);
    expect(rollChestLoot(() => 0.9)).toEqual([]);
  });
  it('シード付き: 同じ シードなら 同じ結果。10 万回で だいたい 0.3%', () => {
    const run = (seed: number) => {
      const r = createRng(seed);
      let n = 0;
      for (let i = 0; i < 100000; i++) n += rollChestLoot(r).length;
      return n;
    };
    expect(run(7)).toBe(run(7));
    const n = run(7);
    expect(n).toBeGreaterThan(220);
    expect(n).toBeLessThan(380);
  });
});
