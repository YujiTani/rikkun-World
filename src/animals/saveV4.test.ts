import { describe, expect, it } from 'vitest';
import { parseAnimalSave, type ParseLimits } from './saveV3';

/** LIVE-2.1 §4.3: 保存 v 4（kits の 行 が eggs）と v 3 → v 4 の 読み直し */
const lim: ParseLimits = { followMax: 18000, friendMax: 8, coopMax: 6, coopCountMax: 3, kitMax: 6, kitEggMax: 3 };
const base = { friends: [], coops: [], machoMiss: 0 };
const eggs = (n: number, left = 1000) => Array.from({ length: n }, (_, i) => ({ egg: 'egg', left: left * (i + 1) }));

describe('保存 v 4 の kits', () => {
  it('v 4 の eggs を 入れた 順 で 読む', () => {
    const p = parseAnimalSave({ v: 4, ...base, kits: [{ x: 1, y: 9, z: 2, eggs: [{ egg: 'egg', left: 1000 }, { egg: 'gold', left: 3000 }, { egg: 'egg', left: 7200 }] }] }, lim)!;
    expect(p.kits).toEqual([{ x: 1, y: 9, z: 2, eggs: [{ egg: 'egg', left: 1000 }, { egg: 'gold', left: 3000 }, { egg: 'egg', left: 7200 }] }]);
  });
  it('v 3 の 行 { egg, left } → eggs 1 行', () => {
    const p = parseAnimalSave({ v: 3, ...base, kits: [{ x: 1, y: 9, z: 2, egg: 'gold', left: 500 }] }, lim)!;
    expect(p.kits).toEqual([{ x: 1, y: 9, z: 2, eggs: [{ egg: 'gold', left: 500 }] }]);
  });
  it('v 2・v 1 には kits が 無い（空）', () => {
    expect(parseAnimalSave({ v: 2, friends: [] }, lim)!.kits).toEqual([]);
  });
  it('eggs が 4 こ 以上 → 先の 3 こ だけ', () => {
    const p = parseAnimalSave({ v: 4, ...base, kits: [{ x: 1, y: 9, z: 2, eggs: eggs(5) }] }, lim)!;
    expect(p.kits[0]!.eggs.map((e) => e.left)).toEqual([1000, 2000, 3000]);
  });
  it('eggs が 0 こ の 行 は すてる。おかしい たまご は とばす', () => {
    const p = parseAnimalSave(
      { v: 4, ...base, kits: [{ x: 1, y: 9, z: 2, eggs: [] }, { x: 3, y: 9, z: 2, eggs: [{ egg: 'ham', left: 5 }, { egg: 'egg', left: -3 }, { egg: 'egg' }] }, { x: 5, y: 9, z: 2 }] },
      lim,
    )!;
    expect(p.kits).toEqual([{ x: 3, y: 9, z: 2, eggs: [{ egg: 'egg', left: 0 }] }]);
  });
  it('世界 ぜんぶ で 6 こ を こえた 分 は 読まない（前 の 行 から 数える）', () => {
    const rows = [0, 1, 2].map((i) => ({ x: i * 4, y: 9, z: 0, eggs: eggs(3) }));
    const p = parseAnimalSave({ v: 4, ...base, kits: rows }, lim)!;
    expect(p.kits).toHaveLength(2);
    expect(p.kits.reduce((s, k) => s + k.eggs.length, 0)).toBe(6);
    // 5 こ 目 で 行 の 途中 で きれる
    const q = parseAnimalSave({ v: 4, ...base, kits: [{ x: 0, y: 9, z: 0, eggs: eggs(3) }, { x: 4, y: 9, z: 0, eggs: eggs(3) }, { x: 8, y: 9, z: 0, eggs: eggs(3) }] }, { ...lim, kitMax: 5 })!;
    expect(q.kits.map((k) => k.eggs.length)).toEqual([3, 2]);
  });
  it('kitEggMax を 渡さない とき は 3', () => {
    const { kitEggMax: _ignore, ...rest } = lim;
    void _ignore;
    const p = parseAnimalSave({ v: 4, ...base, kits: [{ x: 0, y: 9, z: 0, eggs: eggs(5) }] }, rest)!;
    expect(p.kits[0]!.eggs).toHaveLength(3);
  });
});
