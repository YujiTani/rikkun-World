import { describe, expect, it } from 'vitest';
import { CHALK_MARK_IDS } from './blocks/chalkMark';
import { applyFlatten, planFlatten, type FlattenWorld } from './flatten';

/** MINE-1B: チョークの しるしは 置き物（こたつ・とりごや）を 置く ときの じゃまに ならない（たいらに する とき いっしょに 消える。草と 同じ） */
function mk(): FlattenWorld & { set(x: number, y: number, z: number, b: string): void } {
  const cells = new Map<string, string>();
  const get = (x: number, y: number, z: number): string => cells.get(`${x},${y},${z}`) ?? (y < 5 ? 'stone' : 'air');
  return {
    size: { y: 16 },
    isLoaded: (x, z) => x >= 0 && z >= 0 && x < 20 && z < 20,
    getBlock: get as FlattenWorld['getBlock'],
    isSolid: (x, y, z) => get(x, y, z) === 'stone',
    set: (x, y, z, b) => void cells.set(`${x},${y},${z}`, b),
  };
}
const Y = 5;
const kit = (w: FlattenWorld) => planFlatten(w, { x0: 10, z0: 10, w: 2, d: 2, y: Y, h: 2 });

describe('チョークの しるし と 置き物の たいらに する', () => {
  it('ゆか・かべの しるし 12 こ どれが あしもとに あっても 置ける。その マスは 消える（草と 同じ）', () => {
    for (const id of CHALK_MARK_IDS) {
      const w = mk();
      w.set(10, Y, 10, id);
      const p = kit(w);
      expect(p, id).not.toBeNull();
      expect(p!.edits, id).toEqual([{ x: 10, y: Y, z: 10, block: 'air' }]);
      expect(p!.cleared, id).toBe(1);
    }
  });

  it('置き物の 高さの 中（y+1）の しるしも 消える。書いたら 本当に 空気に なる', () => {
    const w = mk();
    w.set(11, Y + 1, 11, 'chalk_mark_w_n');
    const p = kit(w)!;
    const wrote: string[] = [];
    applyFlatten(p, (x, y, z, b) => wrote.push(`${x},${y},${z}=${b}`));
    expect(wrote).toEqual([`11,${Y + 1},11=air`]);
  });

  it('うめる マス（床の すぐ 下の くぼみ）に しるしが あっても 土で うめられる', () => {
    const w = mk();
    w.set(10, Y - 1, 10, 'air'); // くぼみ
    w.set(10, Y - 1, 10, 'chalk_mark');
    const p = planFlatten(w, { x0: 10, z0: 10, w: 1, d: 1, y: Y, h: 1 });
    expect(p).not.toBeNull();
    expect(p!.filled).toBe(1);
  });
});
