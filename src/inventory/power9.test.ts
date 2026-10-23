import { describe, expect, it } from 'vitest';
import { createW2Settings } from '../contracts';
import { createRng } from '../world/gen/random';
import { legendPowerOf, rollPower } from '../legend/defs';
import { copyStack, readPower } from '../tools/durability';
import { InventoryImpl } from './Inventory';

/** WEAPON-9 AC28: 虹の 強さ（4〜10）は その 1 本に 保存される */
describe('AC28 強さ', () => {
  it('rollPower: 10,000 回で 4〜10 の 整数が それぞれ 1/7 ±1%', () => {
    const S = createW2Settings();
    const rng = createRng(123);
    const n: Record<number, number> = {};
    for (let i = 0; i < 10000; i++) {
      const p = rollPower(S, 'niji', rng)!;
      expect(Number.isInteger(p)).toBe(true);
      n[p] = (n[p] ?? 0) + 1;
    }
    for (let p = 4; p <= 10; p++) {
      expect(n[p]! / 10000, `${p}`).toBeGreaterThan(1 / 7 - 0.01);
      expect(n[p]! / 10000, `${p}`).toBeLessThan(1 / 7 + 0.01);
    }
    expect(Object.keys(n)).toHaveLength(7);
  });
  it('数字ひとつの 武器・かたなでは null（乱数を 使わない）', () => {
    const S = createW2Settings();
    let used = 0;
    const rng = () => (used++, 0.5);
    expect(rollPower(S, 'raijin_ken', rng)).toBeNull();
    expect(rollPower(S, 'katana', rng)).toBeNull();
    expect(used).toBe(0);
  });
  it('legendPowerOf: 1 本の 強さが あれば それ。なければ まん中の 7', () => {
    const S = createW2Settings();
    expect(legendPowerOf(S, 'niji', 10)).toBe(10);
    expect(legendPowerOf(S, 'niji', null)).toBe(7);
    expect(legendPowerOf(S, 'niji')).toBe(7);
    expect(legendPowerOf(S, 'raijin_ken', 3)).toBe(8);
  });
  it('inventory.add(niji, 1, {power}) と serialize → deserialize で 変わらない。強さ なしは 7', () => {
    const a = new InventoryImpl();
    a.add('niji', 1, { power: 10 });
    a.add('niji', 1, { power: 4 });
    a.add('niji', 1);
    expect(a.slots().filter(Boolean).map((s) => s!.power)).toEqual([10, 4, 7]);
    const b = new InventoryImpl();
    b.deserialize(JSON.parse(JSON.stringify(a.serialize())));
    expect(b.slots().filter(Boolean).map((s) => s!.power)).toEqual([10, 4, 7]);
  });
  it('強さの 範囲を こえた 値は おさめる。虹でない 物は 強さを 持たない', () => {
    expect(readPower(99, 'niji')).toBe(10);
    expect(readPower(1, 'niji')).toBe(4);
    expect(readPower('x', 'niji')).toBe(7);
    expect(readPower(5, 'katana')).toBe(0);
    const inv = new InventoryImpl();
    inv.add('katana', 1, { power: 9 });
    expect(inv.slots()[0]!.power).toBeUndefined();
  });
  it('持ちかえ・シフトで うつす・たいきゅうが へっても 強さは のこる', () => {
    const inv = new InventoryImpl();
    inv.add('niji', 1, { power: 9 });
    inv.shiftMove(0);
    const at = inv.slots().findIndex((s) => s?.item === 'niji');
    expect(inv.slots()[at]!.power).toBe(9);
    inv.wearSlot(at, 5);
    expect(inv.slots()[at]!.power).toBe(9);
    expect(inv.slots()[at]!.wear).toBe(5);
    inv.setDurability(at, 20);
    expect(inv.slots()[at]!.power).toBe(9);
    expect(copyStack(inv.slots()[at]!).power).toBe(9);
  });
});
