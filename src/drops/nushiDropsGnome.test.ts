import { describe, expect, it } from 'vitest';
import { createW2Settings } from '../contracts';
import { chestPool } from '../world/gen/mineChest';

/** LEGEND-4 G-C2（§3.9）: ヌシの 表・宝箱の くじに ノームの斧が 自動で 入る */
describe('G-C2 gnome_axe: ヌシの 表・宝箱', () => {
  it('nushiDrops に gnome_axe が weight 1 で 1 行', () => {
    expect(createW2Settings().nushiDrops.filter((r) => r.item === 'gnome_axe')).toEqual([{ item: 'gnome_axe', weight: 1 }]);
  });
  it('宝箱の legendary の 箱に 1 回', () => {
    expect(chestPool().legendary.filter((i) => i === 'gnome_axe')).toHaveLength(1);
  });
});
