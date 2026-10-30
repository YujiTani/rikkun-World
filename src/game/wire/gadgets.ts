// 小物（ITEM-FX-1・#342）のつなぎ: ふとんで ねる・たこ・わらじ。戦闘（wireFighters）の中で 1 回だけ作る。
import type { ItemId } from '../../contracts';
import { jumpHeightWith } from '../../content/items/gadgetTuning';
import { KiteView } from '../../fx/kiteView';
import { KiteSystem } from '../../player/kite';
import { NOT_NIGHT_TEXT, SleepSystem } from '../../time/sleep';
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
  /** ねはじめに 鳴らす 音（別の 係が 作る。まだ なければ 何も しない） */
  onSleepStart?: () => void;
}

export function wireGadgets(d: GadgetDeps) {
  const sleep = new SleepSystem(d.time);
  const kite = new KiteSystem();
  const ui = new GadgetUi(d.hud);
  const kiteView = new KiteView(d.scene);
  // ねている 間は 動けない・クリックも きかない（入力を 止める）
  const origEnabled = d.lock.playInputEnabled.bind(d.lock);
  d.lock.playInputEnabled = () => origEnabled() && !sleep.blocksInput();
  return {
    sleep,
    kite,
    ui,
    /** DigSystem の右クリックの 実行（m4.gadgets） */
    port: {
      sleep: (): void => {
        const r = sleep.use();
        if (r === 'notNight') ui.show(NOT_NIGHT_TEXT);
        else if (r === 'start') d.onSleepStart?.();
      },
      kite: (): void => {
        kite.toggle(d.controller.state.position, d.controller.state.yawDeg);
      },
    },
    /** 毎ステップ（dt は 秒） */
    step(dt: number): void {
      sleep.update();
      kite.onHeld(d.held());
      kite.update(d.controller.state.position);
      kiteView.update(kite.position(), d.controller.state.position, d.tick());
      ui.update(dt, sleep.fade());
      // わらじ: はいている 間だけ ジャンプが 高い
      d.controller.setJumpHeight(jumpHeightWith(d.armor.equipped('legs'), d.controller.settings.jumpHeight));
    },
    /** window.__rikkun.sleep / kite */
    hook: {
      sleep: {
        get: () => ({ sleeping: sleep.sleeping(), stepsLeft: sleep.stepsLeft(), fade: sleep.fade(), notice: ui.notice() }),
      },
      kite: {
        get: () => ({ up: kite.up(), position: kite.position() ? { ...kite.position()! } : null, height: kite.height(d.controller.state.position), solid: kite.solid }),
      },
    },
  };
}
