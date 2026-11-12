import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS, createW2Settings } from '../contracts';
import { LEGEND4_IDS } from '../content/items/ids';
import { itemRarity } from '../drops/rarity';
import { InventoryImpl } from '../inventory/Inventory';
import { LegendBook } from '../legend/LegendBook';
import { NinjaBook } from '../craft/NinjaBook';
import { SamuraiBook } from '../craft/SamuraiBook';
import { TopBandModel } from '../ui/celebrate/bandModel';
import { defaultCelebrateSettings } from '../ui/celebrate/config';
import { ACHIEVEMENT_DEFS, LEGEND_NAMES } from './defs';
import { AchievementSystem } from './AchievementSystem';
import { createInvAdded } from './invAdded';

/** LEGEND-4 T-C3（§3.9）: get.tenshi_yumi.1・legend.kinds の 段（武器の 数だけ。表から 数える）・テロップ */
const mk = (): AchievementSystem => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));

describe('T-C3 tenshi_yumi: 実績', () => {
  it('get.tenshi_yumi.1 が ある・legend.kinds の 段の 数は LEGEND_NAMES と 同じ・LEGEND4_IDS は ぜんぶ 入る', () => {
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'get.tenshi_yumi.1')).toBeDefined();
    expect(ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('legend.kinds.'))).toHaveLength(LEGEND_NAMES.length);
    for (const id of LEGEND4_IDS) expect(LEGEND_NAMES.some(([x]) => x === id)).toBe(true);
  });
  it('inventory.add(tenshi_yumi) → get.tenshi_yumi.1 が 取れ、legendKinds が 1 すすむ（図鑑にも のる）', () => {
    const w2 = createW2Settings();
    const legendBook = new LegendBook((i) => w2.legendary.some((d) => d.item === i));
    const achievements = mk();
    const inv = new InventoryImpl();
    inv.onAdded = createInvAdded({ legendBook, ninjaBook: new NinjaBook(), samuraiBook: new SamuraiBook(), achievements, rarityOf: (i) => itemRarity(i) });
    inv.add('tenshi_yumi', 1);
    expect(achievements.isUnlocked('get.tenshi_yumi.1')).toBe(true);
    expect(achievements.stats()['legendKinds']).toBe(1);
    expect(legendBook.got()).toEqual(['tenshi_yumi']);
  });
  it('ui.telop(tenshi_yumi): 上の 帯が telop・item tenshi_yumi', () => {
    const b = new TopBandModel(() => defaultCelebrateSettings());
    b.enqueueTelop('tenshi_yumi');
    b.step(1, false);
    expect(b.info(null)).toMatchObject({ kind: 'telop', item: 'tenshi_yumi' });
  });
});
