import { describe, expect, it } from 'vitest';
import type { ItemId, ItemStack } from '../contracts';
import { cooldownCells } from './hotbarModel';

/** #264: シャイニングの 休みの のこりを 虹の マスに 出す（LoL の ような 円の おおい・のこりの 秒） */
const st = (item: string, count = 1) => ({ item, count }) as unknown as ItemStack;
const cdOf = (item: ItemId) => (item === 'niji' ? 600 : null);

describe('#264 cooldownCells', () => {
  it('休みで なければ どの マスにも 出さない', () => {
    expect(cooldownCells([st('niji')], cdOf, 0)).toEqual([]);
  });

  it('休み中は 虹の マス 全部に 同じ のこりを 出す（ほかの 武器の マスには 出さない）', () => {
    const slots = [st('katana'), st('niji'), null, st('raijin_ken'), st('niji')];
    expect(cooldownCells(slots, cdOf, 600)).toEqual([
      { index: 1, ratio: 1, seconds: 10 },
      { index: 4, ratio: 1, seconds: 10 },
    ]);
  });

  it('のこりの わりと 秒（切り上げ）', () => {
    expect(cooldownCells([st('niji')], cdOf, 300)).toEqual([{ index: 0, ratio: 0.5, seconds: 5 }]);
    expect(cooldownCells([st('niji')], cdOf, 1)).toEqual([{ index: 0, ratio: 1 / 600, seconds: 1 }]);
    expect(cooldownCells([st('niji')], cdOf, 541)).toEqual([{ index: 0, ratio: 541 / 600, seconds: 10 }]);
  });

  it('ホットバーの 9 マスの 外（もちもの）には 出さない', () => {
    const slots: (ItemStack | null)[] = new Array(12).fill(null);
    slots[10] = st('niji');
    expect(cooldownCells(slots, cdOf, 300)).toEqual([]);
  });
});
