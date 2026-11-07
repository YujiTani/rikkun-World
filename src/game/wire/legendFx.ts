// COOP-1 4d-2: 雷の 絵（ThunderFx）と 虹の 斬撃の 絵（RainbowFx）の 作り方。1P（wire/combat.ts）と 2P（wire/duoLegend.ts）で 同じ 関数を 使う。
// 板は その人の カメラを 向く: 1P は game.camera、2P は 2P の 区画の カメラ（DuoViewRenderer.camera2）で 2 つ目を 作る。
import type * as THREE from 'three';
import type { W2Settings } from '../../contracts';
import { RainbowFx } from '../../fx/rainbowFx';
import { ThunderFx } from '../../fx/thunderFx';

export interface LegendFx {
  thunderFx: ThunderFx;
  rainbowFx: RainbowFx;
}

export function createLegendFx(o: {
  scene: THREE.Scene;
  /** 板が 向く カメラ（その人の カメラ） */
  camera: THREE.PerspectiveCamera;
  seed: number;
  w2: Pick<W2Settings, 'bladeTech'>;
  /** 2P 用: 雷は 区画に 重ねる 板だけ 作る（世界を 絵に 描く 入れ物は 作らない） */
  paneOnly?: boolean;
}): LegendFx {
  return {
    thunderFx: new ThunderFx({ scene: o.scene, camera: o.camera, seed: o.seed, ...(o.paneOnly ? { paneOnly: true } : {}) }),
    rainbowFx: new RainbowFx(o.scene, o.camera, (tech) => o.w2.bladeTech[tech]),
  };
}
