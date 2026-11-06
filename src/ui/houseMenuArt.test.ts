import { describe, expect, it } from 'vitest';
import { houseMenuPixels } from './houseMenuArt';

/** HOUSE-1A: メニューの ボタンの 仮の 絵（方眼と 家・えんぴつ。1E: 蔵の 絵は ない）と 照準の 下の 案内「はなす」の ふきだし。書きまちがい（行の 長さ・色の 表に ない 字）を 見張る */

describe('メニューの 仮の 絵', () => {
  for (const kind of ['editor', 'rename', 'talk'] as const) {
    it(`${kind}: 16x16 で、色の ついた 画素が たくさん あり、まわりは すき間`, () => {
      const p = houseMenuPixels(kind);
      expect(p).toHaveLength(256);
      const solid = p.filter((c) => c[3] === 255).length;
      expect(solid).toBeGreaterThan(40);
      expect(solid).toBeLessThan(256);
      // 上の 1 行・下の 1 行・左右の 1 列は すき間（ふちが 切れない）。方眼は わく自体が 1 ます 内がわ
      for (let i = 0; i < 16; i++) {
        expect(p[i]![3], `${kind} 上 ${i}`).toBe(0);
        expect(p[15 * 16 + i]![3], `${kind} 下 ${i}`).toBe(0);
      }
    });
  }

  it('絵ごとに 見た目が ちがう', () => {
    const key = (k: 'editor' | 'rename' | 'talk'): string => JSON.stringify(houseMenuPixels(k));
    expect(new Set([key('editor'), key('rename'), key('talk')]).size).toBe(3);
  });
});
