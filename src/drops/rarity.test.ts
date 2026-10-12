import { describe, expect, it } from 'vitest';
import { ITEM_TYPES } from '../inventory/items';
import { RARITY_COLOR, isKnownItemRarity, itemRarity, topRarity } from './rarity';

describe('めずらしさ', () => {
  it('全アイテムにめずらしさが決まっている', () => {
    for (const t of ITEM_TYPES) expect(isKnownItemRarity(t.id), t.id).toBe(true);
  });
  it('決めた表どおり', () => {
    for (const i of ['dirt', 'stone', 'sand', 'grass', 'leaves', 'paper', 'string', 'cloth'] as const) expect(itemRarity(i)).toBe('common');
    for (const i of ['log', 'coal_ore', 'clay', 'oil', 'yokai_orb'] as const) expect(itemRarity(i)).toBe('uncommon');
    expect(itemRarity('iron_ore')).toBe('rare');
    expect(itemRarity('crystal')).toBe('superRare');
  });
  it('いちばんめずらしいもの・色は 4 種ちがう', () => {
    expect(topRarity(['dirt', 'iron_ore', 'log'])).toBe('rare');
    expect(topRarity(['dirt', 'crystal'])).toBe('superRare');
    expect(new Set(Object.values(RARITY_COLOR)).size).toBe(4);
  });
});
