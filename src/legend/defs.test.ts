import { describe, expect, it } from 'vitest';
import { createW2Settings, type LegendaryDef } from '../contracts';
import { createRng } from '../world/gen/random';
import { chargeOf, legendDefOf, legendPowerOf, pickNushiDrop } from './defs';

/** WEAPON-7 AC1・AC6（G8）: legendary の データから 引く 口 */
describe('legendary の データ（AC1）', () => {
  it('雷神剣の 行・power・charge が 引ける。ほかの 刀は undefined', () => {
    const S = createW2Settings();
    expect(legendDefOf(S, 'raijin_ken')?.power).toBe(8);
    expect(legendPowerOf(S, 'raijin_ken')).toBe(8);
    expect(chargeOf(S, 'raijin_ken')?.kind).toBe('lightning');
    expect(legendDefOf(S, 'katana')).toBeUndefined();
    expect(legendDefOf(S, null)).toBeUndefined();
    expect(chargeOf(S, 'katana')).toBeNull();
    expect(legendPowerOf(S, 'katana')).toBeNull();
  });
  it('新しい データを 1 つ 足すと（にせ物）ほかの コードを 変えずに 引ける', () => {
    const S = createW2Settings();
    const fake: LegendaryDef = {
      item: 'crystal_katana',
      power: 5,
      charge: { kind: 'lightning', chargeTicks: 30, range: 20, radius: 5, damageMul: 2, knock: [2, 4], strikeF: 8, boltSteps: 12, recovery: 40 },
      onAttack: [],
      passive: [],
    };
    S.legendary.push(fake);
    expect(legendPowerOf(S, 'crystal_katana')).toBe(5);
    expect(chargeOf(S, 'crystal_katana')?.chargeTicks).toBe(30);
  });
  it('charge が null の 武器は ためない', () => {
    const S = createW2Settings();
    S.legendary.push({ item: 'katana', power: 6, charge: null, onAttack: [], passive: [] });
    expect(chargeOf(S, 'katana')).toBeNull();
    expect(legendPowerOf(S, 'katana')).toBe(6);
  });
  it('強さが [最小, 最大] の ときは 整数の まん中（強さを 決める のは 落ちた とき。PR3）', () => {
    const S = createW2Settings();
    S.legendary.push({ item: 'katana', power: [4, 10], charge: null, onAttack: [], passive: [] });
    expect(legendPowerOf(S, 'katana')).toBe(7);
  });
});

describe('ヌシの 表の 選び方（AC6）', () => {
  const rows = [
    { item: 'bokuto' as const, weight: 2 },
    { item: 'katana' as const, weight: 1 },
    { item: 'crystal_katana' as const, weight: 1 },
  ];
  it('weight に 比例（2:1:1 で 3,000 回）', () => {
    const rng = createRng(1);
    const n: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const it = pickNushiDrop(rows, rng)!;
      n[it] = (n[it] ?? 0) + 1;
    }
    expect(n.bokuto).toBeGreaterThanOrEqual(1350);
    expect(n.bokuto).toBeLessThanOrEqual(1650);
    expect(n.katana! + n.crystal_katana!).toBe(3000 - n.bokuto!);
  });
  it('空・weight 0 だけ → null。1 本 → いつも それ', () => {
    expect(pickNushiDrop([], createRng(1))).toBeNull();
    expect(pickNushiDrop([{ item: 'katana', weight: 0 }], createRng(1))).toBeNull();
    for (let i = 0; i < 20; i++) expect(pickNushiDrop([{ item: 'katana', weight: 1 }], createRng(i))).toBe('katana');
  });
  it('乱数を 1 つだけ 使う（ほかの 列を ずらさない）', () => {
    let calls = 0;
    pickNushiDrop(rows, () => (calls++, 0.5));
    expect(calls).toBe(1);
  });
});
