import { describe, expect, it } from 'vitest';
import { takeLegacyOrbs } from './legacyOrbs';

/** TOWN-1 1.6〔1F〕AC66・§4.6: 古い セーブの 中の yokai_orb を 数えて 取りのぞく（もとの データは かえない） */
const O = 'yokai_orb';
const slots = (n: number, put: Record<number, { item: string; count: number }>) => Array.from({ length: n }, (_, i) => put[i] ?? null);

describe('takeLegacyOrbs', () => {
  const meta = () => ({
    inventory: { slots: slots(36, { 0: { item: O, count: 3 }, 12: { item: O, count: 20 }, 1: { item: 'dirt', count: 5 } }), selected: 0 },
    p2: { inventory: { slots: slots(36, { 4: { item: O, count: 7 } }), selected: 0 }, level: 1 },
    storage: [{ x: 1, y: 2, z: 3, facing: 'n', slots: slots(54, { 0: { item: O, count: 6 } }) }],
    bags: [
      { x: 0, y: 0, z: 0, item: O, count: 4, ticksLeft: 10 },
      { x: 0, y: 0, z: 0, item: 'dirt', count: 1, ticksLeft: 10 },
      { x: 0, y: 0, z: 0, slots: [{ item: O, count: 2 }, { item: 'dirt', count: 1 }], ticksLeft: 10 },
    ],
    furnaces: [{ x: 1, y: 1, z: 1, queue: [], progress: 0, done: [{ item: O, count: 1 }, { item: 'iron_ingot', count: 2 }] }],
  });

  it('1P・2P・たんす・地面・ぶくろ・かまど を 数える（world は たんす 6 ＋ 地面 4 ＋ ぶくろ 2 ＋ かまど 1）', () => {
    const r = takeLegacyOrbs(meta());
    expect(r.orbs).toEqual({ p1: 23, p2: 7, world: 13 });
  });
  it('取りのぞいた 写しを 返す（ほかの 物は のこる・マスの 数は かわらない）。もとは かえない', () => {
    const m = meta();
    const before = JSON.stringify(m);
    const r = takeLegacyOrbs(m);
    expect(JSON.stringify(m)).toBe(before);
    expect(takeLegacyOrbs(r.data).orbs).toEqual({ p1: 0, p2: 0, world: 0 });
    expect(r.data.inventory.slots).toHaveLength(36);
    expect(r.data.inventory.slots[1]).toEqual({ item: 'dirt', count: 5 });
    expect(r.data.inventory.slots[0]).toBeNull();
    expect(r.data.bags).toHaveLength(2);
    expect(r.data.furnaces[0]!.done).toEqual([{ item: 'iron_ingot', count: 2 }]);
  });
  it('yokai_orb が なければ 同じ もの（写さない）・形が おかしくても 落ちない', () => {
    const m = { inventory: { slots: slots(36, {}), selected: 0 } };
    expect(takeLegacyOrbs(m).data).toBe(m);
    expect(takeLegacyOrbs({ inventory: 5, p2: 'x', bags: {}, storage: [null, 3] } as never).orbs).toEqual({ p1: 0, p2: 0, world: 0 });
  });
});
