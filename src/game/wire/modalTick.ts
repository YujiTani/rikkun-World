// 世界を 止める 画面（本・建築士さん・2 人で 1P の 全面の もちもの画面）の 1 コマを 決める。player.ts の game.setModal が 使う
import type { GameModal } from '../Game';

export interface ModalParts {
  bookActive: () => boolean;
  bookTick: () => void;
  bookRender: () => void;
  houseFrozen: () => boolean;
  houseTick: () => void;
  houseRender: () => void;
  /** 2 人で 1P の 全面の もちもの画面が 世界を 止めている（COOP-1 AC84） */
  duoFrozen: () => boolean;
  /** 1P の パッド。実時間の コマでは 呼ばない（その コマの idle が 1 回 読む）。step() の 道だけ */
  padStep: () => void;
  /** もちもの画面まわりの 1 コマ（updaters が 動かない ので ここから 呼ぶ） */
  inventoryUiTick: () => void;
  duoModalTick: () => void;
}

export function createGameModal(p: ModalParts): GameModal {
  return {
    active: () => p.bookActive() || p.houseFrozen() || p.duoFrozen(),
    tick: (inFrame = false) => {
      if (p.bookActive()) p.bookTick();
      else if (p.houseFrozen()) p.houseTick();
      else {
        // 2 人で もちもの画面: updaters は 動かない ので、画面の 開閉・描きなおしを ここで 1 コマ 回す（開いた コマにも 必ず 1 回）
        p.inventoryUiTick();
        if (!inFrame) p.padStep(); // 1P の パッドで とじられる ように
      }
      p.duoModalTick();
    },
    render: () => {
      if (p.bookActive()) p.bookRender();
      else if (p.houseFrozen()) p.houseRender();
    },
  };
}
