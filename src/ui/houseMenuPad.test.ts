import { describe, expect, it } from 'vitest';
import { housePadReady } from './houseMenuPad';

/**
 * COOP-1 5d（docs/design/COOP-1.md 1.15 §11.2-15 おすすめ ①・§3.7 (e)・AC165）: 建築士さんの メニューの ボタンの 画面を パッドの 十字＋A・B で 押せる ようにする（1P の パッドも）。
 * 実装の 前に 書いた 赤の テスト。パッドで 押せる 画面かどうかの 決まり。
 *
 * ---- 開発への つなぎ目の 約束（新しい ファイル `src/ui/houseMenuPad.ts`。名前は 開発が かえて よい）----
 *   export function housePadReady(menu: { open: boolean; page: HousePage | null; build?: true }, confirm: boolean): boolean
 *     menu = `house.menu()`、confirm = 上空の 視点の 確かめの まど〔`house.cursor()?.confirm`〕が 出て いるか。
 *     true の 画面: はじめの メニュー〔top。どうぐを もらう ふくむ〕・けんちくの 一覧〔pick〕・ひつような もの〔build の need〕・確かめの まど〔sky で confirm〕・なまえを かえる の 一覧〔rename〕。
 *     false の 画面（マウスで）: とじている・エディター〔editor・build でない need〕・上空の 視点で 場所を えらぶ〔sky で confirm なし〕・名前の 字を えらぶ〔renameName〕。
 *   ui/menu/focusNav.ts の activeMenuRoot() は housePadReady が true の とき 建築士さんの 画面の 根（HouseUi の el〔class house-ui〕）を 返す。
 *     優先は ダイアログ・せってい・もちもの画面・本・建築士さんの 画面・案内画面 の 順。
 */

describe('AC165 パッドで 押せる 建築士さんの 画面', () => {
  const top = { open: true, page: 'top' as const };
  it('とじて いれば false', () => {
    expect(housePadReady({ open: false, page: null }, false)).toBe(false);
  });
  it('はじめの メニュー・けんちくの 一覧・ひつような もの（建てる 流れ）・なまえを かえる の 一覧は true', () => {
    expect(housePadReady(top, false)).toBe(true);
    expect(housePadReady({ open: true, page: 'pick', build: true }, false)).toBe(true);
    expect(housePadReady({ open: true, page: 'need', build: true }, false)).toBe(true);
    expect(housePadReady({ open: true, page: 'rename' }, false)).toBe(true);
  });
  it('上空の 視点: 確かめの まどが 出て いれば true、場所を えらぶ ところは false（マウス）', () => {
    expect(housePadReady({ open: true, page: 'sky', build: true }, true)).toBe(true);
    expect(housePadReady({ open: true, page: 'sky', build: true }, false)).toBe(false);
  });
  it('エディター（ひつような もの を ふくむ）・名前の 字を えらぶ 画面は false（マウス・キーで）', () => {
    expect(housePadReady({ open: true, page: 'editor' }, false)).toBe(false);
    expect(housePadReady({ open: true, page: 'need' }, false)).toBe(false);
    expect(housePadReady({ open: true, page: 'renameName' }, false)).toBe(false);
  });
});
