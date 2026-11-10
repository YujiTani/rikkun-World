// COOP-1 5d: 2 人あそびの 本・建築士さん（世界を 止める 画面）の つなぎ。開いた 人（modalOwner）の 出し入れ、2P が 開いた ときの パッド、
// 1P の 錠の かけなおし待ち、窓口（duo.modalOwner・duo.openBook）。duo.ts の 流れから 呼ぶ。
import { activeMenuRoot, clickFocused, handleMenuDir } from '../../ui/menu/focusNav';
import type { ActionState } from '../../input/actions';
import type { DuoPadRouter } from '../../input/gamepad';
import type { DuoNotices } from '../../ui/duoNotice';
import type { ModalLock } from './modalLock';
import type { ModalOwner, Who } from './modalOwner';

/** 十字で メニューを 動かす Action（毎ステップ 配列を 作らない） */
const DIRS = [
  ['focusUp', 'up'],
  ['focusDown', 'down'],
  ['focusLeft', 'left'],
  ['focusRight', 'right'],
] as const;

interface DuoModalDeps {
  owner: ModalOwner;
  lock: ModalLock;
  router: DuoPadRouter;
  notices: DuoNotices;
  /** 1P の キー・パッド（game.input）と 2P の パッド */
  p1Actions: ActionState;
  p2Actions: ActionState;
  joined: () => boolean;
  padLost: () => boolean;
  /** 2P の もちもの画面が 開いて いる */
  panelOpen: () => boolean;
  /** ほんだなで 本を 開いた のと 同じ（`?duo=dev` の 窓口 `duo.openBook(who)`）。開けたら true */
  openBook: (who: Who) => boolean;
  dev: boolean;
}

export function wireDuoModal(d: DuoModalDeps) {
  /** 2P の パッドを メニューの 割り当て（けってい・もどる・十字）に するか。もちもの画面か、本・建築士さんの 持ち主が いる あいだ */
  const menuOpen2 = (): boolean => d.joined() && (d.panelOpen() || d.owner.padMenu());
  /** 毎ステップ（世界が 動いて いる ときも 止まって いる ときも）: 持ち主の 出し入れ・「ちょっと まってね」・かけなおし待ちの 案内 */
  const noticeStep = (): void => {
    d.owner.step(d.padLost());
    d.notices.setRelockHint(d.lock.relockPending());
  };
  /** 世界が 止まって いる 1 コマごとに: 2P が 持ち主なら 2P の パッドを 読んで、十字で えらび A で 押す（B は 本・建築士さんの 入力で とじる） */
  const tick = (): void => {
    if (d.owner.get() !== 2 || !d.joined()) return;
    d.router.setMenuOpen2(menuOpen2());
    d.router.poll(performance.now(), true);
    const a = d.owner.menuSource(d.p1Actions, d.p2Actions);
    const root = activeMenuRoot();
    if (root) {
      for (const [action, dir] of DIRS) if (a.wasPressed(action)) handleMenuDir(root, dir);
      if (a.wasPressed('confirm')) clickFocused(root);
    }
    d.p2Actions.endFrame(); // 世界の 更新が 止まって いる ので ここで おしまい
  };
  return {
    menuOpen2,
    noticeStep,
    tick,
    /** 1P の 錠を かけなおす 操作（クリック・キー）が 来た */
    onGesture: (): void => d.lock.onGesture(),
    hook: {
      modalOwner: (): Who | null => d.owner.get(),
      openBook: (who: Who): boolean => d.dev && d.openBook(who),
    },
  };
}
