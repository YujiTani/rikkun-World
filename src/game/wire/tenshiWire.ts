import type * as THREE from 'three';
import type { ArrowInfo, ItemId } from '../../contracts';
import { playAirJump } from '../../fx/airJumpSound';
import type { SoundFx } from '../../fx/sound';
import { TenshiFx } from '../../fx/tenshiFx';
import type { PlayerController } from '../../player/PlayerController';
import { isTenshi } from '../../player/tenshiMove';

/**
 * 天使の弓の つなぎ（LEGEND-4 PR3）: 体の 空中ジャンプ → 音・羽。つばさ・羽の すじの 絵の 毎ステップの 更新。1P（step.ts）も 2P（duoPlay.ts）も これを 1 人に 1 つ 作って 使う。
 */
export interface TenshiWire {
  /** 毎ステップ（体の 更新の あと） */
  step(held: ItemId | null, arrows: readonly ArrowInfo[], hide: boolean, reduced: boolean): void;
  dispose(): void;
}

export function createTenshiWire(scene: THREE.Object3D, body: PlayerController, sound: Pick<SoundFx, 'playTones'>): TenshiWire {
  const fx = new TenshiFx(scene);
  let reducedNow = false;
  body.onAirJump = (nth) => {
    playAirJump(sound, nth);
    fx.airJump(body.state.position, reducedNow);
  };
  return {
    step(held, arrows, hide, reduced) {
      reducedNow = reduced;
      fx.step({ position: body.state.position, facingDeg: body.state.facingDeg, held: isTenshi(held), hide, reduced, arrows });
    },
    dispose() {
      body.onAirJump = null;
      fx.dispose();
    },
  };
}
