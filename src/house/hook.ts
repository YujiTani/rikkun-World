import type { ItemId } from '../contracts';
import type { ArchitectInfo } from './manager';
import type { HouseSystem } from './system';
import type { HouseMenuState } from './talk';

/**
 * 窓口 `window.__rikkun.house`（HOUSE-1A。仕様 docs/design/HOUSE-1.md §6.1。テスト用）。
 *   architects()    読みこまれて いる 建築士さん { id, x, y, z, first, busy }（x・y・z は 足もと）
 *   talk(id)        右クリックで 話すのと 同じ
 *   menu()          { open, page: 'top' | 'kura' | null, bubble, buttons: { id, enabled }[] }
 *   press(id, arg?) メニューの ボタンを 押す（close は どの ページでも 全部 とじる）
 *   kura()          くらの 中身 { アイテムid: 数 }（1 こ以上 ある 種類だけ）
 *   deposit(item, n) / withdraw(item, n)   くらへ あずける / とりだす。動いた 数を 返す。メニューが とじて いても 動く
 */
export interface HouseHook {
  architects(): ArchitectInfo[];
  talk(id: string | number): void;
  menu(): HouseMenuState;
  press(id: string, arg?: unknown): void;
  kura(): Record<string, number>;
  deposit(item: string, n: number): number;
  withdraw(item: string, n: number): number;
}

export function createHouseHook(sys: Pick<HouseSystem, 'architects' | 'talkTo' | 'menu' | 'press' | 'deposit' | 'withdraw' | 'state'>): HouseHook {
  return {
    architects: () => sys.architects(),
    talk: (id) => void sys.talkTo(String(id)),
    menu: () => sys.menu(),
    // arg は 今の 票の ボタンでは 使わない（HOUSE-1B 以降の ボタン用）
    press: (id) => sys.press(id),
    kura: () => sys.state.kura.totals(),
    deposit: (item, n) => sys.deposit(item as ItemId, n),
    withdraw: (item, n) => sys.withdraw(item as ItemId, n),
  };
}
