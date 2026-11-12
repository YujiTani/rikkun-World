import { describe, expect, it } from 'vitest';
import { itemType } from '../../inventory/items';
import { dugItemOf } from '../../dig/dugItems';
import { BLOCK_INDEX, BLOCK_TYPES } from './blockTypes';
import { EMISSION } from '../light/opacity';

/**
 * #187-AC7（この PR の 3 ブロック）: おちば（ochiba）・すいしょう（suisho）・とうろう（touro）の役わり（VOX-I §5）と、光（すいしょう 9・とうろう 14）。
 * 名前は docs/tickets/VOX-I-4b.md の「テストが 前提にした 名前」。
 */
const type = (id: string) => BLOCK_TYPES.find((t) => t.id === id);
const index = (id: string): number => {
  const v = (BLOCK_INDEX as Record<string, number>)[id];
  expect(v, `${id} が まだ無い`).toBeDefined();
  return v!;
};

describe('#187-AC7: おちば・すいしょう・とうろう', () => {
  for (const id of ['ochiba', 'suisho']) {
    it(`${id}: 固くて、こわせて、持てて、置ける`, () => {
      expect(type(id), `${id} が まだ無い`).toBeDefined();
      expect(type(id)!.solid).toBe(true);
      expect(type(id)!.breakable).toBe(true);
      expect(itemType(id)?.placeBlock).toBe(id);
      expect(dugItemOf(id as never)).toBe(id);
    });
  }
  it('suisho は 炭鉱の すいしょう（suisho_ore・アイテム crystal）とは べつの 物', () => {
    expect(type('suisho_ore')).toBeDefined();
    expect(itemType('suisho')?.placeBlock).toBe('suisho');
    expect(dugItemOf('suisho' as never)).not.toBe('crystal');
  });
  it('touro: 固い・こわせない・持てない（アイテムが ない）', () => {
    expect(type('touro'), 'touro が まだ無い').toBeDefined();
    expect(type('touro')!.solid).toBe(true);
    expect(type('touro')!.breakable).toBe(false);
    expect(itemType('touro')).toBeUndefined();
  });
  it('光: すいしょう 9・とうろう 14（たいまつ と 同じ）。おちば は 光らない', () => {
    expect(EMISSION[index('suisho')]).toBe(9);
    expect(EMISSION[index('touro')]).toBe(EMISSION[BLOCK_INDEX.torch]);
    expect(EMISSION[index('touro')]).toBe(14);
    expect(EMISSION[index('ochiba')]).toBe(0);
  });
});
