import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { itemIconPixels } from './itemIcon';
import { axeItemPixels, nickIconPixels, type AxeItem } from './itemArtBal';
import { AXE_HELD_PARTS } from '../camera/heldAxes';
import { HELD_MODELS } from '../camera/heldTools';
import * as announce from "./titleAnnounce";

/**
 * BAL-G（#115）: 仮の絵が 本物（ART-BAL の絵）に入れかわったことを確かめる（DESIGN 13.3・13.4）。
 * 窓口（tester が決めた名前）:
 *  - `titleAnnounce.ts`: `announceIconPixels(icon)`（= nickIconPixels）・`ANNOUNCE_ICON_PX = 48`（16 × 3）。`ANNOUNCE_STARS` は無くす
 *  - `hpBar.ts`: `hpBarIconPixels(icon)`・`HpBar.iconInfo`・`HpBar.underlay`（hpBar.test.ts）
 */
const AXES: AxeItem[] = ['wood_axe', 'stone_axe', 'iron_axe'];

describe('BAL-G おのの絵', () => {
  it('アイテムのアイコンは axeItemPixels（ART-BAL の かた刃）', () => {
    for (const a of AXES) expect(itemIconPixels(a)).toEqual(axeItemPixels(a));
  });
  it('仮の axePixels（src/ui/itemArtAxe.ts）は 使わなくなったので 消えている', () => {
    expect(existsSync(resolve(__dirname, 'itemArtAxe.ts'))).toBe(false);
  });
  it('手に持つ形は AXE_HELD_PARTS（箱 6 つ）。ほかの道具は そのまま', () => {
    for (const a of AXES) {
      expect(HELD_MODELS[a]).toEqual(AXE_HELD_PARTS[a]);
      expect(HELD_MODELS[a]).toHaveLength(6);
    }
    expect(HELD_MODELS.wood_pickaxe).toBeDefined();
  });
});

describe('BAL-G 登場のおしらせの アイコン', () => {
  it('★ の文字（ANNOUNCE_STARS）はやめて、nickIconPixels を 48px（16 × 3）で出す', () => {
    expect('ANNOUNCE_STARS' in announce).toBe(false);
    expect(announce.ANNOUNCE_ICON_PX).toBe(48);
    for (const t of ['taisho', 'nushi'] as const) expect(announce.announceIconPixels(t)).toEqual(nickIconPixels(t));
  });
});
