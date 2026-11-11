import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS, createW2Settings } from '../contracts';
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

/** LEGEND-4 G-C3（§3.9）: get.gnome_axe.1・legend.kinds の 段・テロップ */
describe('G-C3 gnome_axe: 実績', () => {
  it('get.gnome_axe.1 が ある・legend.kinds の 段の 数は LEGEND_NAMES と 同じ', () => {
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'get.gnome_axe.1')).toBeDefined();
    expect(ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('legend.kinds.'))).toHaveLength(LEGEND_NAMES.length);
    expect(LEGEND_NAMES.some(([x]) => x === 'gnome_axe')).toBe(true);
  });
  it('inventory.add(gnome_axe) → get.gnome_axe.1 が 取れる（図鑑にも のる）', () => {
    const w2 = createW2Settings();
    const legendBook = new LegendBook((i) => w2.legendary.some((d) => d.item === i));
    const achievements = new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
    const inv = new InventoryImpl();
    inv.onAdded = createInvAdded({ legendBook, ninjaBook: new NinjaBook(), samuraiBook: new SamuraiBook(), achievements, rarityOf: (i) => itemRarity(i) });
    inv.add('gnome_axe', 1);
    expect(achievements.isUnlocked('get.gnome_axe.1')).toBe(true);
    expect(legendBook.got()).toEqual(['gnome_axe']);
  });
  it('ui.telop(gnome_axe): 上の 帯が telop・item gnome_axe', () => {
    const b = new TopBandModel(() => defaultCelebrateSettings());
    b.enqueueTelop('gnome_axe');
    b.step(1, false);
    expect(b.info(null)).toMatchObject({ kind: 'telop', item: 'gnome_axe' });
  });
});
