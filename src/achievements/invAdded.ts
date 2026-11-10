// COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c) ②・AC149）: もちものに 物が 入った → 図鑑（レジェンダリー・忍び・侍）と めずらしさの 実績。
// 1P の もちものと 2P の もちものに 同じ 関数を 入れる（図鑑・実績は 2 人で 共有）。つくる・ひろう・宝箱・たんすから 入った 物は ぜんぶ Inventory.add を 通る。
import type { ItemId } from '../contracts';
import type { NinjaBook } from '../craft/NinjaBook';
import type { SamuraiBook } from '../craft/SamuraiBook';
import type { LegendBook } from '../legend/LegendBook';
import type { AchievementSystem } from './AchievementSystem';

export function createInvAdded(d: {
  legendBook: Pick<LegendBook, 'add'>;
  ninjaBook: Pick<NinjaBook, 'add'>;
  samuraiBook: Pick<SamuraiBook, 'add'>;
  achievements: Pick<AchievementSystem, 'feedLegend' | 'feedNinja' | 'feedSamurai' | 'feedRarity'>;
  rarityOf(item: ItemId): string;
}): (item: ItemId, n?: number) => void {
  return (item) => {
    const r = d.legendBook.add(item);
    if (r) d.achievements.feedLegend(item, r.kinds);
    const n = d.ninjaBook.add(item);
    if (n) d.achievements.feedNinja(item, n.kinds);
    const sm = d.samuraiBook.add(item);
    if (sm) d.achievements.feedSamurai(item, sm.kinds);
    d.achievements.feedRarity(d.rarityOf(item));
  };
}
