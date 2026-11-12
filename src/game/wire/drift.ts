// ゆきやまの 雪・もみじやまの 紅葉の 舞い（試作。URL `?drift=1` の ときだけ。既定は 出さない）のつなぎ。
// プレイヤー（2 人なら 2P の 足もとも）の まわりに 出す。2P は shared.duoMate() が 返す 間だけ。
import type { Game } from '../Game';
import { DriftFx, type DriftFocus } from '../../fx/driftFx';

interface DriftDeps {
  game: Pick<Game, 'scene' | 'onUpdate' | 'camera'>;
  time: { brightness: () => number };
  world: { isSolid: (x: number, y: number, z: number) => boolean };
  controller: { state: { position: DriftFocus } };
  seed: number;
  shared: { duoMate: () => { position: DriftFocus } | null };
}

export function wantsDrift(search: string): boolean {
  return new URLSearchParams(search).get('drift') === '1';
}

export function installDrift(d: DriftDeps): DriftFx {
  const foci: DriftFocus[] = [];
  const fx = new DriftFx(d.game.scene, {
    seed: d.seed,
    isSolid: (x, y, z) => d.world.isSolid(x, y, z),
    camera: () => d.game.camera.position,
    brightness: () => d.time.brightness(),
    foci: () => {
      foci.length = 0;
      foci.push(d.controller.state.position);
      const mate = d.shared.duoMate();
      if (mate) foci.push(mate.position);
      return foci;
    },
  });
  d.game.onUpdate((dt) => fx.update(dt));
  return fx;
}
