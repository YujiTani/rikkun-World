// COOP-1 5d（AC165）: 建築士さんの メニューの ボタンの 画面を、パッドの 十字＋A・B で 押せる 形か。HouseUi の 根の data-pad-ready の 目印（focusNav.activeMenuRoot が 見る）。
import type { HouseMenuState } from '../house/talk';

/**
 * true の 画面: はじめの メニュー・けんちくの 一覧・ひつような もの〔建てる 流れ〕・確かめの まど〔上空の 視点で confirm〕・なまえを かえる の 一覧。
 * false の 画面（マウス・キーで）: とじている・エディター・場所を えらぶ 上空の 視点・名前の 字を えらぶ 画面。
 * menu = `house.menu()`、confirm = 上空の 視点の 確かめの まど〔`house.cursor()?.confirm`〕が 出て いるか
 */
export function housePadReady(menu: Pick<HouseMenuState, 'open' | 'page' | 'build'>, confirm: boolean): boolean {
  if (!menu.open) return false;
  switch (menu.page) {
    case 'top':
    case 'pick':
    case 'rename':
      return true;
    case 'need':
      return menu.build === true;
    case 'sky':
      return confirm;
    case 'editor':
    case 'renameName':
    case null:
      return false;
    default: {
      const never: never = menu.page;
      return never;
    }
  }
}
