import { describe, expect, it } from 'vitest';
import { planFlatten, applyFlatten, FLATTEN_CLEAR, type FlattenWorld } from './flatten';
import { coopPlan } from '../animals/coop';

/** 小さい 世界（x・z 0〜19、高さ 16）。y < 5 は いし（床 = y 5）。 */
function mk(): FlattenWorld & { set(x: number, y: number, z: number, b: string): void } {
  const cells = new Map<string, string>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const SOLID = new Set(['stone', 'dirt', 'grass', 'sand', 'bedrock', 'brick', 'log', 'bamboo', 'tansu', 'furnace', 'farmland', 'saku', 'toriya_fence', 'nukunuku', 'nukunuku_e', 'leaves', 'snow', 'coal_ore', 'iron_ore']);
  const get = (x: number, y: number, z: number): string => {
    const c = cells.get(key(x, y, z));
    if (c) return c;
    return y < 5 ? 'stone' : 'air';
  };
  return {
    size: { y: 16 },
    isLoaded: (x, z) => x >= 0 && z >= 0 && x < 20 && z < 20,
    getBlock: get as FlattenWorld['getBlock'],
    isSolid: (x, y, z) => SOLID.has(get(x, y, z)),
    set: (x, y, z, b) => void cells.set(key(x, y, z), b),
  };
}
const Y = 5;
const coop = (w: FlattenWorld) => coopPlan(w, 10, Y, 10);
const kit = (w: FlattenWorld, y = Y) => planFlatten(w, { x0: 10, z0: 10, w: 2, d: 2, y, h: 1 });

describe('LIVE-2.1 AC1 たいら の 判定', () => {
  it('たいら → 置ける・変える 0', () => {
    const p = coop(mk());
    expect(p).not.toBeNull();
    expect(p!.edits).toEqual([]);
  });
  it('1 列 だけ 床 +1 に くさ → 置ける・その 1 マス が 消える', () => {
    const w = mk();
    w.set(9, Y, 9, 'grass');
    const p = coop(w)!;
    expect(p.edits).toEqual([{ x: 9, y: Y, z: 9, block: 'air' }]);
    expect(p.cleared).toBe(1);
  });
  it('+2（y と y+1 に つち）→ 置ける・2 マス 消える。+3（y+2 も つち）→ だめ', () => {
    const w = mk();
    w.set(9, Y, 9, 'dirt');
    w.set(9, Y + 1, 9, 'dirt');
    expect(coop(w)!.cleared).toBe(2);
    w.set(9, Y + 2, 9, 'dirt');
    expect(coop(w)).toBeNull();
  });
  it('y+3 に はっぱ → 置ける・消える（高さ に 関係 なし）', () => {
    const w = mk();
    w.set(8, Y + 3, 8, 'leaves');
    const p = coop(w)!;
    expect(p.edits).toEqual([{ x: 8, y: Y + 3, z: 8, block: 'air' }]);
  });
  it('1 列 だけ y-1 が くうき → 置ける・y-1 に くさ', () => {
    const w = mk();
    w.set(9, Y - 1, 9, 'air');
    expect(coop(w)!.edits).toEqual([{ x: 9, y: Y - 1, z: 9, block: 'grass' }]);
  });
  it('うめる 列 に たいまつ・作物 など 固くない ブロック → 置けない（つぶさない）。水 は うめて よい', () => {
    for (const b of ['torch', 'start_torch', 'toriya_gate']) {
      const w = mk();
      w.set(9, Y - 1, 9, b);
      expect(coop(w), b).toBeNull();
    }
    const w = mk();
    w.set(9, Y - 1, 9, 'water');
    expect(coop(w)).not.toBeNull();
  });
  it('y-1・y-2 が くうき・y-3 が いし → y-2 に つち・y-1 に くさ', () => {
    const w = mk();
    w.set(9, Y - 1, 9, 'air');
    w.set(9, Y - 2, 9, 'air');
    const p = coop(w)!;
    expect(p.edits).toContainEqual({ x: 9, y: Y - 2, z: 9, block: 'dirt' });
    expect(p.edits).toContainEqual({ x: 9, y: Y - 1, z: 9, block: 'grass' });
    expect(p.filled).toBe(2);
  });
  it('y-1〜y-3 が くうき → だめ', () => {
    const w = mk();
    for (const d of [1, 2, 3]) w.set(9, Y - d, 9, 'air');
    expect(coop(w)).toBeNull();
  });
  it.each(['bedrock', 'log', 'bamboo', 'brick', 'tansu', 'furnace', 'farmland', 'saku', 'torch', 'water', 'nukunuku_e', 'toriya_fence'])('y に %s が 1 つ → だめ', (b) => {
    const w = mk();
    w.set(10, Y, 10, b);
    expect(coop(w)).toBeNull();
  });
  it('y-1 が toriya_fence（ほか の 置き物 の 上）→ だめ', () => {
    const w = mk();
    w.set(10, Y - 1, 10, 'toriya_fence');
    expect(coop(w)).toBeNull();
  });
  it('こたつ（H 1）で y+1 に つち → 置ける・y+1 は のこる', () => {
    const w = mk();
    w.set(10, Y + 1, 10, 'dirt');
    const p = kit(w)!;
    expect(p.edits).toEqual([]);
    applyFlatten(p, (x, y, z, b) => w.set(x, y, z, b));
    expect(w.getBlock(10, Y + 1, 10)).toBe('dirt');
  });
  it('こたつ で y に すな → 消える。世界 の はし・読みこみ 外 → だめ', () => {
    const w = mk();
    w.set(10, Y, 10, 'sand');
    expect(kit(w)!.edits).toEqual([{ x: 10, y: Y, z: 10, block: 'air' }]);
    expect(planFlatten(w, { x0: 19, z0: 10, w: 2, d: 2, y: Y, h: 1 })).toBeNull();
    expect(planFlatten(w, { x0: 10, z0: 10, w: 2, d: 2, y: 15, h: 4 })).toBeNull();
  });
  it('消える なかま は 16 種', () => {
    expect(FLATTEN_CLEAR.size).toBe(16);
  });
  it('つぶ は 1 列 に 1 つ・25 まで', () => {
    const w = mk();
    for (let x = 8; x <= 12; x++) for (let z = 8; z <= 12; z++) w.set(x, Y, z, 'grass');
    const p = coop(w)!;
    expect(p.cleared).toBe(25);
    expect(p.dust.length).toBe(25);
    const big = planFlatten(w, { x0: 6, z0: 6, w: 8, d: 8, y: Y, h: 1 })!;
    expect(big.dust.length).toBeLessThanOrEqual(25);
  });
  it('見る マス の 数（とりごや 25×7・こたつ 4×4）', () => {
    expect(coop(mk())!.looked).toBe(25 * 7);
    expect(kit(mk())!.looked).toBe(4 * 4);
  });
  it('足もと の 板 は 床 の 高さ・足もと の 広さ', () => {
    expect(coop(mk())!.plate).toEqual({ x0: 8, z0: 8, w: 5, d: 5, y: Y });
  });
});
