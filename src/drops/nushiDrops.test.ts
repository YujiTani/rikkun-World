import { describe, expect, it } from 'vitest';
import { createW2Settings } from '../contracts';
import { LEGEND4_IDS } from '../content/items/ids';
import { chestPool } from '../world/gen/mineChest';

/** LEGEND-4 K-C2（§3.9）: ヌシの 表・宝箱の くじに 新しい レジェンダリーが 自動で 入る（件数は 表から 数える。決め打ち しない） */
describe('K-C2 kokuryu: ヌシの 表・宝箱', () => {
  it('nushiDrops に kokuryu が weight 1 で 1 行', () => {
    const rows = createW2Settings().nushiDrops.filter((r) => r.item === 'kokuryu');
    expect(rows).toEqual([{ item: 'kokuryu', weight: 1 }]);
  });
  it('宝箱の legendary の 箱に 1 回', () => {
    const legendary = chestPool().legendary;
    expect(legendary.filter((i) => i === 'kokuryu')).toHaveLength(1);
    // 登録表の legendary を ぜんぶ 数える（雷神剣 3 ＋ LEGEND-4 の 分）
    expect(legendary.length).toBeGreaterThanOrEqual(3 + LEGEND4_IDS.length);
  });
});

/** LEGEND-4 PR2 Y-C2（§3.9）: 八咫烏も 自動で ヌシの 表（weight 1）・宝箱の legendary に 1 回 */
describe('Y-C2 yatagarasu: ヌシの 表・宝箱', () => {
  it('nushiDrops に weight 1 で 1 行・宝箱の legendary の 箱に 1 回', () => {
    expect(createW2Settings().nushiDrops.filter((r) => r.item === 'yatagarasu')).toEqual([{ item: 'yatagarasu', weight: 1 }]);
    expect(chestPool().legendary.filter((i) => i === 'yatagarasu')).toHaveLength(1);
  });
});
