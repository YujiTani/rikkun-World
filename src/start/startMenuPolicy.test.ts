// START-1 AC1: スタートメニューを 出すか（仕様 §4.1）。
// 窓口の 名前（実装は これに 合わせる）: src/start/startMenuPolicy.ts の
//   shouldShowStartMenu(search: string, envStartMenu: string | undefined): boolean
//   search = location.search（'' か '?a=1&b=2'）、envStartMenu = import.meta.env.VITE_START_MENU
import { describe, expect, it } from 'vitest';
import { shouldShowStartMenu } from './startMenuPolicy';

describe('AC1 メニューを 出すか（URL × 環境変数）', () => {
  it('URL に なにも ない → 出す', () => {
    expect(shouldShowStartMenu('', undefined)).toBe(true);
    expect(shouldShowStartMenu('?', undefined)).toBe(true);
  });
  it('?menu=1 → 出す。ほかの 指定と いっしょ（?menu=1&nosave=1）でも 出す', () => {
    expect(shouldShowStartMenu('?menu=1', undefined)).toBe(true);
    expect(shouldShowStartMenu('?menu=1&nosave=1', undefined)).toBe(true);
    expect(shouldShowStartMenu('?nosave=1&menu=1', undefined)).toBe(true);
    expect(shouldShowStartMenu('?menu=1&char=block', undefined)).toBe(true);
    expect(shouldShowStartMenu('?menu=1&seed=5', undefined)).toBe(true);
  });
  for (const q of ['?nosave=1', '?seed=3', '?char=boy', '?microR=16', '?ring=small', '?shadow=0', '?reset=1', '?menu=0', '?foo=1']) {
    it(`${q} → 出さない（今どおり すぐ 始める）`, () => {
      expect(shouldShowStartMenu(q, undefined)).toBe(false);
    });
  }
  it('menu=1 の ほかに 指定が 1 つでも あっても menu=1 が あれば 出す（?strength=easy&menu=1 など）', () => {
    expect(shouldShowStartMenu('?strength=easy&menu=1', undefined)).toBe(true);
  });
  it("'' でも 環境変数 off → 出さない（E2E の サーバー）", () => {
    expect(shouldShowStartMenu('', 'off')).toBe(false);
    expect(shouldShowStartMenu('?nosave=1', 'off')).toBe(false);
  });
  it('?menu=1 と 環境変数 off → 出す', () => {
    expect(shouldShowStartMenu('?menu=1', 'off')).toBe(true);
    expect(shouldShowStartMenu('?menu=1&nosave=1', 'off')).toBe(true);
  });
  it('環境変数が off 以外（空・on など）なら ないのと 同じ', () => {
    expect(shouldShowStartMenu('', '')).toBe(true);
    expect(shouldShowStartMenu('', 'on')).toBe(true);
    expect(shouldShowStartMenu('?seed=3', 'on')).toBe(false);
  });
});
