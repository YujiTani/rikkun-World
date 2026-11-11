// 小物（ITEM-FX-1・#342）のつなぎ: ふとんで ねる・たこ・わらじ。戦闘（wireFighters）の中で 1 回だけ作る。
// COOP-1 5e: 1P の たこ・わらじ・ふとんの 窓口・入力止め・起こす 入力は 2P と 同じ 部品（duo/p2Gadgets.ts）を 通す。ふとんは 世界で 1 つ（1P も 2P も 同じ SleepSystem）。
import type { ActionState } from '../../input/actions';
import type { ItemId } from '../../contracts';
import { blockInputWhileSleeping, createP2Gadgets, createSleepPort, createWaitWake, kiteInfo } from '../../duo/p2Gadgets';
import { KiteView } from '../../fx/kiteView';
import { SleepSystem, type SleepUse, type SleepWho } from '../../time/sleep';
import type { TimeOfDayImpl } from '../../time';
import { GadgetUi } from '../../ui/gadgetUi';

interface GadgetDeps {
  hud: HTMLElement;
  scene: import('three').Object3D;
  time: TimeOfDayImpl;
  tick: () => number;
  held: () => ItemId | null;
  controller: { state: { position: { x: number; y: number; z: number }; yawDeg: number }; settings: { jumpHeight: number }; setJumpHeight(h: number | null): void };
  armor: { equipped(slot: 'legs'): ItemId | null };
  lock: { playInputEnabled(): boolean };
  /** ねはじめに 鳴らす 音（別の 係が 作る。まだ なければ 何も しない）。ねむりが 本当に はじまる たびに 1 回 */
  onSleepStart?: () => void;
  /** 1P の 入力（待ちを 起こす 歩く・ジャンプを 見る） */
  actions: Pick<ActionState, 'isHeld' | 'wasPressed'>;
  /** 1P の ハート（ひるむ・倒れるで 待ちを 起こす。あとで 作る ので 関数の 中で 読む） */
  combat: () => { flinching(): boolean; dead?(): boolean };
  /** 1P の もちもの画面が 開いて いる（その 間は 歩く 入力で 待ちを 起こさない） */
  paused: () => boolean;
  /** 「2 人」に 数えられる 人の 数（1 人の とき 1。毎ステップ 読む） */
  ready: () => number;
  /** 毎ステップ、待ちを 起こす 入力の 次・sleep.update の 前に 呼ぶ（2P の 起こす 入力） */
  beforeSleep: () => void;
  /** 2P が 使った とき 「よる に ねようね」を 2P の 半分に 出す */
  noteFor2: (text: string) => void;
}

export function wireGadgets(d: GadgetDeps) {
  const sleep = new SleepSystem(d.time, { ready: d.ready, ...(d.onSleepStart ? { onStart: d.onSleepStart } : {}) });
  const ui = new GadgetUi(d.hud);
  const kiteView = new KiteView(d.scene);
  const g = createP2Gadgets({ body: d.controller, held: d.held, legs: () => d.armor.equipped('legs'), tick: d.tick, view: kiteView });
  const kite = g.kite;
  // ねている 間は 動けない・クリックも きかない（入力を 止める）。待ち中は 止めない
  blockInputWhileSleeping(d.lock, sleep);
  const wake1 = createWaitWake({ who: 1, sleep, actions: d.actions, combat: { flinching: () => d.combat().flinching(), dead: () => d.combat().dead?.() === true }, paused: d.paused });
  const sleepPort = createSleepPort({
    sleep,
    showNote: (who, text) => {
      if (who === 1) ui.show(text);
      else d.noteFor2(text);
    },
  });
  return {
    sleep,
    kite,
    ui,
    /** DigSystem の右クリックの 実行（m4.gadgets）。who ＝ 使った 人（省くと 1P） */
    port: {
      sleep: (who: SleepWho = 1): SleepUse => sleepPort(who),
      kite: (): void => void g.useKite(),
    },
    /** 毎ステップ（dt は 秒）。ふとんは ① 待ちを 起こす 入力（1P・2P） → ② sleep.update の 順（待っている 本人が 倒れた ステップに 夜が とばない ため） */
    step(dt: number): void {
      wake1.step();
      d.beforeSleep();
      sleep.update();
      g.step();
      ui.update(dt, sleep.fade());
    },
    /** window.__rikkun.sleep / kite */
    hook: {
      sleep: {
        get: () => ({ sleeping: sleep.sleeping(), stepsLeft: sleep.stepsLeft(), fade: sleep.fade(), notice: ui.notice() }),
      },
      kite: {
        get: () => ({ ...(kiteInfo(kite) as { up: boolean; position: { x: number; y: number; z: number } | null }), height: kite.height(d.controller.state.position), solid: kite.solid }),
      },
    },
  };
}
