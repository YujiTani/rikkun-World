import { describe, expect, it } from 'vitest';
import { LOG_CATEGORIES, categoryIconPixels, scrollIconPixels, shapeMask } from './categoryIcons';

const hexOf = (s: string): number[] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

describe('カテゴリーの印（AC21）', () => {
  it('6 つとも 16×16', () => {
    expect(LOG_CATEGORIES).toHaveLength(6);
    for (const c of LOG_CATEGORIES) expect(categoryIconPixels(c.id)).toHaveLength(256);
    expect(scrollIconPixels()).toHaveLength(256);
  });

  it('外の形が たがいに 20 ドット以上ちがう（G2: 実測。XOR のドット数）', () => {
    const masks = LOG_CATEGORIES.map((c) => shapeMask(c.shape));
    let min = Infinity;
    for (let i = 0; i < masks.length; i++) {
      for (let j = i + 1; j < masks.length; j++) {
        const diff = masks[i].filter((v, k) => v !== masks[j][k]).length;
        min = Math.min(min, diff);
        expect(diff, `${LOG_CATEGORIES[i].shape} と ${LOG_CATEGORIES[j].shape}`).toBeGreaterThanOrEqual(20);
      }
    }
    expect(min).toBeGreaterThanOrEqual(20);
  });

  it('塗りの色が §2.7 の表の色。ふちは こい色、中に白い絵がある', () => {
    for (const c of LOG_CATEGORIES) {
      const px = categoryIconPixels(c.id);
      const opaque = px.filter((p): p is string => p !== null);
      expect(opaque.includes(c.color)).toBe(true);
      expect(opaque.includes('#10141f')).toBe(true);
      expect(opaque.filter((p) => p === '#ffffff').length).toBeGreaterThanOrEqual(4);
      expect(hexOf(c.color)).toHaveLength(3);
      // 不透明ドットは 形のマスと同じ
      expect(opaque.length).toBe(shapeMask(c.shape).filter(Boolean).length);
    }
  });

  it('形の名前は 6 つ ちがう', () => {
    expect(new Set(LOG_CATEGORIES.map((c) => c.shape)).size).toBe(6);
  });
});
