import { describe, expect, it } from 'vitest';
import { NO_DROP_BLOCKS } from '../../dig/config';
import { itemType } from '../../inventory/items';
import { BLOCK_TYPES } from './blockTypes';

/**
 * #187-AC7（この PR の 4 種）: きのこ（kinoko）・ひまわり（himawari と himawari_top）・かいがら（kaigara）・たけのこ（takenoko）の役わり（VOX-I §5）。
 * ブロックの名前は docs/tickets/VOX-I-4a.md の「テストが 前提にした 名前」。
 */
const type = (id: string) => BLOCK_TYPES.find((t) => t.id === id);

describe('#187-AC7: 新しいブロックの役わり（その 1）', () => {
  for (const id of ['kinoko', 'himawari', 'kaigara', 'takenoko']) {
    it(`${id}: 通れて（固くない）、こわせて、こわすと 持ち物になり、置ける`, () => {
      expect(type(id), `${id} が まだ無い`).toBeDefined();
      expect(type(id)!.solid).toBe(false);
      expect(type(id)!.breakable).toBe(true);
      expect(NO_DROP_BLOCKS.has(id as never)).toBe(false);
      expect(itemType(id)?.placeBlock).toBe(id);
    });
  }
  it('himawari_top（上の 段）: 通れて、こわせる。持ち物は himawari（himawari_top という アイテムは 無い）', () => {
    expect(type('himawari_top'), 'himawari_top が まだ無い').toBeDefined();
    expect(type('himawari_top')!.solid).toBe(false);
    expect(type('himawari_top')!.breakable).toBe(true);
    expect(itemType('himawari_top')).toBeUndefined();
  });
});
