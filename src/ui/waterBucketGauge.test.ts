import { describe, expect, it } from 'vitest';
import type { ItemStack } from '../contracts';
import { waterView } from './waterGauge';

/**
 * WATER-1 §6.2（BUCKET-1 に 足す 分）: みずの バケツ の 量 = じょうろ と 同じ 青い 棒。はば = 量 ÷ 8。
 * 欄 `water` の ない `water_bucket`（前の 保存）は 量 8。じょうろ は 今の まま。
 * 実装の まえに 書いた テスト（`waterView` が バケツを まだ 知らないので 落ちるのが 正しい）。
 */

const bucket = (water?: number): ItemStack => ({ item: 'water_bucket', count: 1, ...(water === undefined ? {} : { water }) });

describe('WATER-1 §6.2 みずの バケツ の 棒', () => {
  it('量 3 の みずの バケツ: はば = 3/8（max 8）', () => {
    const v = waterView(bucket(3));
    expect(v).not.toBeNull();
    expect(v!.max).toBe(8);
    expect(v!.water).toBe(3);
    expect(v!.ratio).toBeCloseTo(3 / 8, 9);
  });

  it('量 1〜8 の どれでも はば = 量 ÷ 8', () => {
    for (let a = 1; a <= 8; a++) {
      const v = waterView(bucket(a));
      expect(v?.water, `量 ${a}`).toBe(a);
      expect(v?.ratio, `量 ${a}`).toBeCloseTo(a / 8, 9);
    }
  });

  it('欄 `water` の ない みずの バケツ（前の 保存）は 量 8 = いっぱい', () => {
    const v = waterView(bucket());
    expect(v?.water).toBe(8);
    expect(v?.max).toBe(8);
    expect(v?.ratio).toBe(1);
  });

  it('からの バケツは 棒を 出さない。じょうろ は 今の まま（欄 なし = からっぽ）', () => {
    expect(waterView({ item: 'bucket', count: 1 })).toBeNull();
    const can = waterView({ item: 'watering_can', count: 1 });
    expect(can).not.toBeNull();
    expect(can!.water).toBe(0);
    expect(can!.ratio).toBe(0);
    const some = waterView({ item: 'watering_can', count: 1, water: 2 });
    expect(some!.water).toBe(2);
  });
});
