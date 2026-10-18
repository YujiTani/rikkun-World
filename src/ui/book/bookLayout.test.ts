import { describe, expect, it } from 'vitest';
import { bookLayout } from './bookLayout';

/** BOOK-1 §3.6 の 大きさの 表（本の四角 ＝ 表紙・金具を ふくむ 外がわ） */
describe('本の 大きさと ならべ方（§3.6）', () => {
  it.each([
    [1024, 700, 540, 810, 96, 107, 389, 508, 3],
    [1280, 800, 640, 960, 96, 160, 464, 608, 4],
    [1440, 900, 720, 1080, 96, 180, 524, 688, 4],
  ])('%i×%i: 本は %i×%i（上 %i・左 %i）、紙の 1 ページ %i×%i、挿絵は ×%i', (vw, vh, bh, bw, top, left, pw, ph, art) => {
    const L = bookLayout(vw, vh);
    expect([L.book.h, L.book.w, L.book.t, L.book.l]).toEqual([bh, bw, top, left]);
    expect([L.pageW, L.pageH, L.artScale]).toEqual([pw, ph, art]);
  });
  it('どの大きさでも ボタンは 64 以上で、本と ボタンは 画面の 内がわ 24px 以上', () => {
    for (const [vw, vh] of [[1024, 700], [1280, 800], [1440, 900], [1280, 720], [960, 640], [1920, 1080]]) {
      const L = bookLayout(vw, vh);
      for (const b of [L.book, ...Object.values(L.buttons)]) {
        expect(b.l, `${vw}x${vh}`).toBeGreaterThanOrEqual(24);
        expect(b.t, `${vw}x${vh}`).toBeGreaterThanOrEqual(24);
        expect(vw - (b.l + b.w), `${vw}x${vh}`).toBeGreaterThanOrEqual(24);
        expect(vh - (b.t + b.h), `${vw}x${vh}`).toBeGreaterThanOrEqual(24);
      }
      for (const b of Object.values(L.buttons)) expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(64);
      expect(L.book.h * 3).toBe(L.book.w * 2);
    }
  });
  it('紙の 見開き ＝ 本の 四角から 表紙 16 を のぞいた もの', () => {
    const L = bookLayout(1280, 800);
    expect(L.spread).toEqual({ l: 176, t: 112, w: 928, h: 608 });
  });
});
