import { describe, expect, it } from 'vitest';
import data from './repairFinal.json';
import { RepairFx, FX_CAP } from './townRepairFxModel';

/** 設計 JSON の fx の 数だけ（ぽん 箱 6 コマ・木くず 4 こ 18 ステップ・ほこり 2 こ 9 ステップ・上限 8・64・16・位置から 同じ 回転） */
describe('もどる エフェクトの 数', () => {
  it('上限は 設計の とおり（ぽん 箱 8・木くず 64・ほこり 16）', () => {
    expect(FX_CAP).toEqual({ pop: 8, chip: 64, dust: 16 });
  });

  it('1 マス もどる: ぽん 箱 1・木くず 4・ほこり 2。ぽん 箱の 大きさは 1.18 → … → 1.02 の 6 コマで 6 ステップ目に きえる', () => {
    const fx = new RepairFx();
    fx.spawn(10, 8, 20, 'stone');
    expect([fx.pops.count, fx.chips.count, fx.dusts.count]).toEqual([1, 4, 2]);
    const seen: number[] = [];
    for (let t = 0; t < 6; t++) {
      seen.push(fx.pops.scale[0]!);
      fx.step();
    }
    seen.forEach((v, i) => expect(v).toBeCloseTo(data.fx.pop_scale[i]!, 5));
    expect(fx.pops.count, 't=6 で きえる').toBe(0);
  });

  it('木くずは 18 ステップで きえる・ほこりは 9 ステップで きえる。高さは 2 ＋ 速さ×t − 0.12 t²（点）', () => {
    const fx = new RepairFx();
    fx.spawn(10, 8, 20, 'stone');
    for (let i = 0; i < 5; i++) fx.step();
    // 5 ステップ目の 木くず 0（dir 0 の つぶ）の 高さ
    const c = data.fx.chips;
    const expectY = 8 + 1 + (2 + c.speed_y[0]! * 5 - c.gravity * 25) / 16;
    expect(fx.chips.y[0]).toBeCloseTo(expectY, 5);
    for (let i = 0; i < 4; i++) fx.step();
    expect(fx.dusts.count).toBe(0);
    for (let i = 0; i < 9; i++) fx.step();
    expect(fx.chips.count).toBe(0);
  });

  it('同時に 出せる 上限を こえない（古い 物から けす）', () => {
    const fx = new RepairFx();
    for (let i = 0; i < 40; i++) fx.spawn(i, 8, 0, 'stone');
    expect(fx.pops.count).toBe(FX_CAP.pop);
    expect(fx.chips.count).toBeLessThanOrEqual(FX_CAP.chip);
    expect(fx.dusts.count).toBeLessThanOrEqual(FX_CAP.dust);
  });

  it('木くずの 向きの 組は ブロックの 位置から（同じ 位置は いつも 同じ・シード付き）', () => {
    const a = new RepairFx();
    const b = new RepairFx();
    a.spawn(33, 9, 71, 'stone');
    b.spawn(33, 9, 71, 'stone');
    for (let i = 0; i < 4; i++) a.step();
    for (let i = 0; i < 4; i++) b.step();
    expect(Array.from(a.chips.x.slice(0, 4))).toEqual(Array.from(b.chips.x.slice(0, 4)));
    // 向きは 90° ずつ: 4 つの 位置で 回転が 少なくとも 2 通り
    const rots = new Set<string>();
    for (let k = 0; k < 40; k++) {
      const f = new RepairFx();
      f.spawn(k * 7, 8, k * 3, 'stone');
      f.step();
      f.step();
      rots.add(`${Math.sign(f.chips.x[0]! - (k * 7 + 0.5))},${Math.sign(f.chips.z[0]! - (k * 3 + 0.5))}`);
    }
    expect(rots.size).toBeGreaterThan(1);
  });

  it('何も ない ときは 仕事を しない（step は 0 こ）', () => {
    const fx = new RepairFx();
    expect(fx.active()).toBe(false);
    fx.spawn(1, 1, 1, 'stone');
    expect(fx.active()).toBe(true);
  });
});
