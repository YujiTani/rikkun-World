import { describe, expect, it } from 'vitest';
import { createW2Settings } from '../contracts';
import { LEGEND4_IDS } from '../content/items/ids';
import { chestPool } from '../world/gen/mineChest';

/** LEGEND-4 T-C2（§3.9）: ヌシの 表・宝箱の くじに 新しい レジェンダリーが 自動で 入る（件数は 表から 数える。決め打ち しない） */
describe('T-C2 tenshi_yumi: ヌシの 表・宝箱', () => {
  it('nushiDrops に tenshi_yumi が weight 1 で 1 行', () => {
    const rows = createW2Settings().nushiDrops.filter((r) => r.item === 'tenshi_yumi');
    expect(rows).toEqual([{ item: 'tenshi_yumi', weight: 1 }]);
  });
  it('宝箱の legendary の 箱に 1 回', () => {
    const legendary = chestPool().legendary;
    expect(legendary.filter((i) => i === 'tenshi_yumi')).toHaveLength(1);
    // 登録表の legendary を ぜんぶ 数える（雷神剣 3 ＋ LEGEND-4 の 分）
    expect(legendary.length).toBeGreaterThanOrEqual(3 + LEGEND4_IDS.length);
  });
});
