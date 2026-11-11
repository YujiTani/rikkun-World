// 2P の 家具・小物（COOP-1 5e。docs/design/COOP-1.md 1.16 §3.7 (f)）: いす・おふろ・たこ・わらじ・ふとんの 待ちを 起こす 入力。
// 2P が 参加する たびに 1 組 作り、やめる たびに dispose する。中身は 1P と 同じ 部品（SeatSystem・createP2Gadgets・createWaitWake）を 2P の 体・もちもので 使う。
// duoPlay.ts は ここを 呼ぶ 行だけ。
import type * as THREE from 'three';
import type { PlayerCombatImpl } from '../../combat';
import { createP2Gadgets, createWaitWake } from '../../duo/p2Gadgets';
import type { P2State } from '../../duo/p2State';
import { KiteView } from '../../fx/kiteView';
import type { ActionState } from '../../input/actions';
import type { PlayerController } from '../../player/PlayerController';
import type { SeatSystem } from '../../house/seat';
import type { SleepSystem } from '../../time/sleep';

export interface DuoGadgetsDeps {
  /** 世界で 1 つの ふとん */
  sleep: SleepSystem;
  /** 2P の いす・おふろを 作る／すてる（wireSeat。すてる とき 立たせる） */
  attachSeat: (d: { controller: PlayerController; actions: ActionState; combat: PlayerCombatImpl }) => SeatSystem;
  detachSeat: () => void;
  scene: THREE.Object3D;
  tick: () => number;
  ctl: PlayerController;
  actions: ActionState;
  combat: PlayerCombatImpl;
  p2: P2State;
  /** 2P の パッドが ささって いるか */
  padPresent: () => boolean;
  /** 2P の もちもの画面が 開いて いる（その 間は 歩く 入力で 待ちを 起こさない） */
  panelOpen: () => boolean;
}

export type DuoGadgets = ReturnType<typeof createDuoGadgets>;

export function createDuoGadgets(d: DuoGadgetsDeps) {
  const seat = d.attachSeat({ controller: d.ctl, actions: d.actions, combat: d.combat });
  const kiteView = new KiteView(d.scene);
  const gad = createP2Gadgets({ body: d.ctl, held: () => d.p2.inventory.held()?.item ?? null, legs: () => d.p2.armor.equipped('legs'), tick: d.tick, view: kiteView });
  const wake = createWaitWake({ who: 2, sleep: d.sleep, actions: d.actions, combat: { flinching: () => d.combat.flinching(), dead: () => d.combat.dead() }, paused: d.panelOpen });
  return {
    seat,
    /** m4.gadgets の たこ（ZL） */
    useKite: (): void => void gad.useKite(),
    /** 2P の 体を 動かす 前（ctl2.update の 前）。座って いる 間は 位置・向きを 固定 */
    seatBefore: (): void => seat.update(),
    /** 2P の 体を 動かした あと */
    seatAfter: (): void => seat.afterUpdate(),
    /** 毎ステップ（2P の 更新の あと）: たこ・わらじ */
    step: (): void => gad.step(),
    /** 毎ステップ、sleep.update の 前（1P の gadgets.step が 呼ぶ）: 待ちを 起こす 入力、パッドが ぬけたら 起こす */
    wakeStep(): void {
      wake.step();
      if (!d.padPresent()) d.sleep.wake(2);
    },
    kite: gad.kite,
    eyeDrop: (): number => seat.eyeDrop(),
    /** 2P が やめた: 待ちを 消し・たこを おろし・立たせる */
    dispose(): void {
      d.sleep.wake(2);
      gad.clear();
      kiteView.dispose();
      d.detachSeat();
    },
  };
}

