import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS, createW2Settings, type ItemId } from '../contracts';
import { NinjaBook, NINJA_IDS } from '../craft/NinjaBook';
import { SamuraiBook, SAMURAI_IDS } from '../craft/SamuraiBook';
import { itemRarity } from '../drops/rarity';
import { InventoryImpl } from '../inventory/Inventory';
import { ITEM_TYPES } from '../inventory/items';
import { LegendBook } from '../legend/LegendBook';
import { AchievementSystem } from './AchievementSystem';
import { createInvAdded } from './invAdded';

/**
 * COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c) ②・AC149）の 先行テスト（赤）。2P の もちものに レジェンダリー・忍び・侍の 物が 入ると
 * 図鑑（LegendBook・NinjaBook・SamuraiBook）と めずらしさの 実績に 1P と 同じに 数える。図鑑・実績は 2 人で 共有（1 つの 本を 2 人で 書く）。
 * いま `inventory.onAdded` は 1P の もちものにしか つながって いない（game/wire/ui.ts）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/achievements/invAdded.ts（新しく）
 *     createInvAdded(d: {
 *       legendBook: Pick<LegendBook, 'add'>; ninjaBook: Pick<NinjaBook, 'add'>; samuraiBook: Pick<SamuraiBook, 'add'>;
 *       achievements: Pick<AchievementSystem, 'feedLegend' | 'feedNinja' | 'feedSamurai' | 'feedRarity'>;
 *       rarityOf(item: ItemId): string;
 *     }): (item: ItemId, n?: number) => void
 *     … 今の ui.ts の `inventory.onAdded = (item) => { … }` の 中身を そのまま 1 つの 関数に（legendBook.add → feedLegend(item, kinds)・ninjaBook.add → feedNinja・samuraiBook.add → feedSamurai・feedRarity(rarityOf(item))）。
 *     **1P の ui.ts も これで `inventory.onAdded` を 作り**、同じ 関数を 2P の もちもの（`shared.p2.inventory.onAdded`）にも 入れる。
 *     つくる・ひろう・宝箱・たんすから 入った 物は ぜんぶ Inventory.add を 通る ので、onAdded だけで 足りる。
 *   1 人の ときは かわらない（AC146）: 2P の もちものに 何も 入らなければ 1P の 実績は 今まで どおり。
 */

const mk = (): AchievementSystem => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
const legends = (): ItemId[] => createW2Settings().legendary.map((d) => d.item);

function world() {
  const w2 = createW2Settings();
  const legendBook = new LegendBook((i) => w2.legendary.some((d) => d.item === i));
  const ninjaBook = new NinjaBook();
  const samuraiBook = new SamuraiBook();
  const achievements = mk();
  const onAdded = createInvAdded({ legendBook, ninjaBook, samuraiBook, achievements, rarityOf: (i) => itemRarity(i) });
  const inv1 = new InventoryImpl();
  const inv2 = new InventoryImpl();
  inv1.onAdded = onAdded;
  inv2.onAdded = onAdded; // 同じ 関数を 2 人の もちものに
  return { achievements, legendBook, ninjaBook, samuraiBook, inv1, inv2, onAdded };
}

describe('AC149: 2P の もちものに 入った 物も 図鑑と めずらしさの 実績に のる', () => {
  it('レジェンダリー: 2P が 手に 入れると 図鑑に のり、get:<item> と legendKinds が 1P と 同じに ふえる', () => {
    const [first] = legends();
    expect(first).toBeDefined();
    const one = world();
    one.inv1.add(first!, 1);
    const two = world();
    two.inv2.add(first!, 1);
    expect(two.legendBook.got()).toEqual([first]);
    expect(two.achievements.stats()).toEqual(one.achievements.stats());
    expect(two.achievements.stats()[`get:${first}`]).toBe(1);
    expect(two.achievements.stats()['legendKinds']).toBe(1);
  });

  it('図鑑は 2 人で 1 つ: 1P と 2P が ちがう レジェンダリーを 手に 入れると しゅるいの 数は 合わせて ふえる', () => {
    const [a, b] = legends();
    if (!a || !b) return; // 1 種類しか ない 設定なら この 確認は いらない
    const w = world();
    w.inv1.add(a, 1);
    w.inv2.add(b, 1);
    expect(w.legendBook.got()).toEqual([a, b]);
    expect(w.achievements.stats()['legendKinds']).toBe(2);
  });

  it('忍び・侍: 2P が 入れると それぞれの 帳に のり、ninjaKinds・samuraiKinds が ふえる(legendKinds には 数えない)', () => {
    const w = world();
    w.inv2.add(NINJA_IDS[0]!, 1);
    w.inv2.add(SAMURAI_IDS[0]!, 1);
    expect(w.ninjaBook.got()).toEqual([NINJA_IDS[0]]);
    expect(w.samuraiBook.got()).toEqual([SAMURAI_IDS[0]]);
    expect(w.achievements.stats()['ninjaKinds']).toBe(1);
    expect(w.achievements.stats()['samuraiKinds']).toBe(1);
    expect(w.achievements.stats()['legendKinds'] ?? 0).toBe(0);
  });

  it('めずらしさ epic の 物: 2P が 入れると obtainRarity:epic が 1P と 同じに ふえる', () => {
    const epic = ITEM_TYPES.find((t) => itemRarity(t.id as ItemId) === 'epic')?.id as ItemId | undefined;
    expect(epic).toBeDefined();
    const one = world();
    one.inv1.add(epic!, 1);
    const two = world();
    two.inv2.add(epic!, 1);
    expect(two.achievements.stats()['obtainRarity:epic']).toBe(1);
    expect(two.achievements.stats()).toEqual(one.achievements.stats());
  });

  it('ふつうの 物(つち)は 図鑑にも 実績にも のらない', () => {
    const w = world();
    w.inv2.add('dirt' as ItemId, 4);
    expect(w.legendBook.got()).toEqual([]);
    expect(w.ninjaBook.got()).toEqual([]);
    expect(w.samuraiBook.got()).toEqual([]);
    expect(w.achievements.stats()['legendKinds'] ?? 0).toBe(0);
  });
});
