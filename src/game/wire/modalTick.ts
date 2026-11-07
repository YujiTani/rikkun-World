// 世界を 止める 画面（本・建築士さん）の 1 コマを 決める。player.ts の game.setModal が 使う
import type { GameModal } from '../Game';

/**
 * 世界を 止める 画面は 本と 建築士さん（HOUSE-1A）の 2 つ だけ。
 * もちもの画面は 2 人の ときも 世界を 止めない（COOP-1 4a。AC75）ので、updaters が 動き、画面まわりも 1P の パッドも そこで 回る。
 */
export interface ModalParts {
  bookActive: () => boolean;
  bookTick: () => void;
  bookRender: () => void;
  houseFrozen: () => boolean;
  houseTick: () => void;
  houseRender: () => void;
  /** 2P の 側の 1 コマ（「ちょっと まってね」・「＋で さんか」の 出し入れ。updaters が 動かない ので ここから 呼ぶ） */
  duoModalTick: () => void;
}

export function createGameModal(p: ModalParts): GameModal {
  return {
    active: () => p.bookActive() || p.houseFrozen(),
    tick: () => {
      if (p.bookActive()) p.bookTick();
      else if (p.houseFrozen()) p.houseTick();
      p.duoModalTick();
    },
    render: () => {
      if (p.bookActive()) p.bookRender();
      else if (p.houseFrozen()) p.houseRender();
    },
  };
}
