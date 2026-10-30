import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { HOUSE_TOOL_IDS } from '../content/items/ids';
import { createDefaultItemInfo } from '../craft/info';
import { ALL_RECIPES } from '../craft/recipes';
import { itemType } from '../inventory/items';
import { itemClassOf } from '../tools/durability';
import { getTilePixels } from '../world/blocks/textures';
import { itemCategory } from './itemCategory';
import { itemIconPixels } from './itemIcon';
import { findUnrubiedKanji } from './text';

/** HOUSE-1A（#338）みずもり・どうづき: アイテムだけ。はたらきは HOUSE-1C（#340） */
describe('HOUSE-1A みずもり・どうづき', () => {
  it('id は mizumori・dotsuki。1 マスに 1 こ・置けない・こわれない・どうぐの 色', () => {
    expect([...HOUSE_TOOL_IDS]).toEqual(['mizumori', 'dotsuki']);
    expect(itemType('mizumori')).toMatchObject({ name: 'みずもり', maxStack: 1, placeBlock: null });
    expect(itemType('dotsuki')).toMatchObject({ name: 'どうづき', maxStack: 1, placeBlock: null });
    for (const id of HOUSE_TOOL_IDS) {
      expect(itemClassOf(id), id).toBe('permanent');
      expect(itemCategory(id), id).toBe('tool');
    }
  });

  it('作れない（レシピなし）。ずかんの「てにいれかた」は「けんちくし から もらう」', () => {
    const info = createDefaultItemInfo((i) => itemType(i)?.name ?? i);
    for (const id of HOUSE_TOOL_IDS) {
      expect(ALL_RECIPES.some((r) => r.output.item === id), id).toBe(false);
      const i = info.info(id as ItemId);
      expect(i.source, id).toBe('けんちくし から もらう');
      expect(findUnrubiedKanji(`${i.use}${i.how}${i.source}`), id).toEqual([]);
      expect(i.later, '作れない 物は 時計の 絵に しない').toBeNull();
    }
  });

  it('絵: 16×16・石の 絵に 落ちない・2 つは ちがう', () => {
    const stone = JSON.stringify(getTilePixels('stone'));
    const px = HOUSE_TOOL_IDS.map((id) => itemIconPixels(id));
    for (const p of px) {
      expect(p).toHaveLength(256);
      expect(JSON.stringify(p)).not.toBe(stone);
      expect(p.filter((c) => c[3] > 0).length).toBeGreaterThan(40);
    }
    expect(JSON.stringify(px[0])).not.toBe(JSON.stringify(px[1]));
  });
});
