import { describe, expect, it } from 'vitest';
import { BLOB, blobPlacement, groundBelow } from './blobShadow';

describe('キャラの丸い影の置き方（TEX-A 基準 8）', () => {
  it('地面に立つ: 高さ = 地面 + 0.13、大きさ 0.9、こさ 1', () => {
    const p = blobPlacement(21, 21);
    expect(p.visible).toBe(true);
    expect(p.y).toBeCloseTo(21.13, 5);
    expect(p.size).toBeCloseTo(0.9, 5);
    expect(p.opacity).toBe(1);
  });
  it('3 ブロックとぶと 小さく うすく（大きさ 0.8 倍・こさ 0.5 倍）。影は 地面のまま', () => {
    const p = blobPlacement(24, 21);
    expect(p.y).toBeCloseTo(21.13, 5);
    expect(p.size / 0.9).toBeCloseTo(0.8, 5);
    expect(p.opacity).toBeCloseTo(0.5, 5);
  });
  it('大きさは 0.6 倍まで。6 ブロックより上では 出さない', () => {
    const p = blobPlacement(26.9, 21);
    expect(p.size / BLOB.size).toBeGreaterThanOrEqual(BLOB.minSizeRatio);
    expect(p.visible).toBe(true);
    expect(blobPlacement(27, 21).visible).toBe(false);
    expect(blobPlacement(40, 21).visible).toBe(false);
  });
  it('地面が 見つからない（null）なら 出さない', () => {
    expect(blobPlacement(21, null).visible).toBe(false);
  });
  it('足の下の いちばん上の固いブロックの上。水に入ったら 出さない', () => {
    const col = (solidTop: number, water: number[] = []) => (y: number) => (water.includes(y) ? 'water' : y <= solidTop ? 'solid' : 'other');
    expect(groundBelow(21, col(20))).toBe(21);
    expect(groundBelow(21.4, col(20))).toBe(21);
    expect(groundBelow(25.2, col(20))).toBe(21);
    // 足のマスが 水
    expect(groundBelow(21.2, col(20, [21]))).toBeNull();
    // 水の上（下が水）
    expect(groundBelow(22, col(15, [21, 20, 19]))).toBeNull();
    // 深い穴の上: 7 ブロックより下までは さがさない
    expect(groundBelow(40, col(10))).toBeNull();
  });
});
