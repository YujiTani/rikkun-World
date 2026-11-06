import type * as THREE from 'three';
import type { DigEvent, DigSystem } from '../contracts';
import { DigFx } from '../fx/DigFx';
import type { SoundFx } from '../fx/sound';
import { DUO_COLORS } from './tuning';

/** 2P の ねらいの わく・ひび用の DigFx（COOP-1 3a）。わくの 色は DUO_COLORS.p2。人形・画面ゆれ・合図は 1P のものなので 何もしない */
export function createP2DigFx(d: { scene: THREE.Scene; dig: DigSystem; sound: SoundFx; hideBlockFocus?: () => boolean; events?: () => DigEvent[] }): DigFx {
  return new DigFx({
    scene: d.scene,
    dig: d.dig,
    sound: d.sound,
    doll: { swing() {}, setDigging() {} },
    view: { setShake() {} },
    notice: { showSignal() {} },
    outlineColor: DUO_COLORS.p2,
    ...(d.hideBlockFocus ? { hideBlockFocus: d.hideBlockFocus } : {}),
    ...(d.events ? { events: d.events } : {}),
  });
}
