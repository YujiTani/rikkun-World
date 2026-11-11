// COOP-1 5d（docs/design/COOP-1.md 1.16 §3.7 (e)・§8 の 5d）: 本・建築士さんの メニューを 開いた 人（開いた 人）の 持ち主と、入力の ふりわけ、「ちょっと まってね」の 行き先。
// 世界を 止める 画面は 1 度に 1 人だけ 開ける。動かせるのは 開いた 人の パッド（と マウス）だけ。もう 1 人の 半分には「ちょっと まってね」が 出る。
import type { Action } from '../../input/actions';

export type Who = 1 | 2;
/** 入力の 出どころ: 1P の キー・パッド（game.input）／ 2P の パッド（p2Actions）／ マウス（画面の ボタン） */
export type ModalSource = 'p1' | 'p2' | 'mouse';

export interface ModalOwnerDeps {
  /** 2P が いるか */
  joined(): boolean;
  /** 「ちょっと まってね」を who の 半分に 出す／消す（DuoNotices.setWait） */
  setWait(who: Who, on: boolean): void;
  /** 開いて いる 物を その ステップで しまう（本は Book.closeNow〔音なし〕、建築士さんは house.close()） */
  closeNow(): void;
}

export interface ModalOwner {
  /** 開いた 人。開いて いなければ null（`duo.modalOwner()` の 中身） */
  get(): Who | null;
  /** 開こうと した 人が 持ち主に なる。もう だれかが 開いて いれば・2P が いない のに who 2 なら false */
  claim(who: Who): boolean;
  /** しまった（本の visibleHook・建築士さんの onClose から）。持ち主を はずす */
  release(): void;
  /** 毎ステップ 1 回: 「ちょっと まってね」の 出し入れ（参加・やめる も ここで 追いつく）と、2P が 持ち主の とき やめた／パッドが ぬけたら closeNow */
  step(padLost: boolean): void;
  /** その 入力を 本・メニューに 通すか（持ち主の 入力と マウス だけ。開いて いない ときは 'p1' だけ） */
  accepts(src: ModalSource): boolean;
  /** 十字・けってい を 読む ActionState（持ち主が 2P なら p2、それ以外は p1） */
  menuSource<T>(p1: T, p2: T): T;
  /** 2 本の パッドを メニューの 割り当て（けってい・もどる・十字）に するか（持ち主が いる あいだ 両方 true） */
  padMenu(): boolean;
}

export function createModalOwner(d: ModalOwnerDeps): ModalOwner {
  let owner: Who | null = null;
  /** 「ちょっと まってね」を 今 出して いる か（1P の 半分・2P の 半分。変わった ときだけ setWait） */
  const shown: Record<Who, boolean> = { 1: false, 2: false };
  const show = (who: Who, on: boolean): void => {
    if (shown[who] === on) return;
    shown[who] = on;
    d.setWait(who, on);
  };
  return {
    get: () => owner,
    claim: (who) => {
      if (owner !== null || (who === 2 && !d.joined())) return false;
      owner = who;
      return true;
    },
    release: () => {
      owner = null;
    },
    step: (padLost) => {
      if (owner === 2 && (!d.joined() || padLost)) {
        d.closeNow();
        owner = null;
      }
      const joined = d.joined();
      // 開いて いない 人の 半分に だけ
      show(1, joined && owner === 2);
      show(2, joined && owner === 1);
    },
    accepts: (src) => {
      if (owner === null) return src === 'p1';
      return src === 'mouse' || (owner === 1 ? src === 'p1' : src === 'p2');
    },
    menuSource: (p1, p2) => (owner === 2 ? p2 : p1),
    padMenu: () => owner !== null,
  };
}

/** 建築士さんの 取り合い。onOpen で claim し、取れなければ 建築士さんを 閉じる（先に 開いた 人が 勝つ）。onClose は 取った ときだけ 持ち主を はずす */
export function createHouseGate(owner: Pick<ModalOwner, 'claim' | 'release'>, closeHouse: () => void): { onOpen(who: Who): void; onClose(): void } {
  let mine = false;
  return {
    onOpen: (who) => {
      mine = owner.claim(who);
      if (!mine) closeHouse();
    },
    onClose: () => {
      if (!mine) return;
      mine = false;
      owner.release();
    },
  };
}

/** 本の 入力: 1P の game.input.onPress には p1、2P の p2Actions.onPress には p2 を つなぐ。持ち主の 入力だけ 同じ Action の まま 本へ わたす */
export function createBookInput(owner: Pick<ModalOwner, 'accepts'>, book: { onAction(a: Action): void }): { p1(a: Action): void; p2(a: Action): void } {
  return {
    p1: (a) => {
      if (owner.accepts('p1')) book.onAction(a);
    },
    p2: (a) => {
      if (owner.accepts('p2')) book.onAction(a);
    },
  };
}
