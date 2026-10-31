// 字を えらぶ 画面（エディター・なまえを かえる の 名前の 画面。HOUSE-1 §2.6・AC14）の 間は、Esc いがいの キーを ゲームの 操作に しない。DOM なし（キーの 形だけ 読む）。
import type { HouseSystem } from './system';

/** キーを 読むのに 要る ぶん */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  stopImmediatePropagation(): void;
  preventDefault(): void;
}

/**
 * keydown の 受け手（window の 取りこみ段階に つなぐ）。W・E・Q・数字キーなどを ゲームに とどけない。Esc は 画面の 順で とじ、Backspace は 1 もじ けす。
 * 止めるのは 押した とき（keydown）だけ。はなした とき（keyup）は ゲームに とどける（キーを 押した まま ひらいて、中で はなしても、
 * とじた あとに ゲームの 側で 押しっぱなしの まま 残らない ように）。Ctrl・Cmd・Alt の 組み合わせと F1〜F12 は そのまま 通す。
 */
export function houseKeyGuard(house: Pick<HouseSystem, 'typing' | 'escape' | 'press'> & Partial<Pick<HouseSystem, 'skying' | 'skyDecide'>>): (e: KeyLike & { code?: string }) => void {
  return (e) => {
    // 上空の 視点（建てる 場所えらび。HOUSE-1C PR-2）: Enter は 決定（まどが あれば［ここに たてる］）。矢印・WASD・Esc は ふだんの 道（Action）に まかせる
    if (house.skying?.() && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) house.skyDecide?.();
      return;
    }
    if (!house.typing() || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
    e.stopImmediatePropagation();
    if (!e.repeat) {
      if (e.key === 'Escape') house.escape();
      else if (e.key === 'Backspace') house.press('erase');
    }
    e.preventDefault();
  };
}
