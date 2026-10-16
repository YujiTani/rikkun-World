import { describe, expect, it } from 'vitest';
import { charRow } from './charSprite';

describe('キャラの行の選びかた', () => {
  // キャラは +z を向いている
  it('正面・うしろ・横', () => {
    expect(charRow(0, 1, 0, 5)).toBe(0); // カメラが正面
    expect(charRow(0, 1, 0, -5)).toBe(4); // うしろ
    expect(charRow(0, 1, -5, 0)).toBe(2); // キャラの右手側（-x）
    expect(charRow(0, 1, 5, 0)).toBe(6); // 左手側（+x）
  });
  it('45 度ごとに 1 つ進み、8 で一周', () => {
    const rows = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      rows.push(charRow(0, 1, -Math.sin(a) * 5, Math.cos(a) * 5));
    }
    expect(rows).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it('キャラが別の向きでも、正面から見れば 行 0', () => {
    expect(charRow(1, 0, 4, 0)).toBe(0);
  });
});
