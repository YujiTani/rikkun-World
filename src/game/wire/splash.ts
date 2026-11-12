// 滝の しぶき（試作。URL `?water=v2` の ときだけ。既定は 出さない）のつなぎ。プレイヤーの まわりの 滝に 出す。
import type { Game } from '../Game';
import { SplashFx, type SplashFocus } from '../../fx/splashFx';

interface SplashDeps {
  game: Pick<Game, 'scene' | 'onUpdate'>;
  time: { brightness: () => number };
  controller: { state: { position: SplashFocus } };
  seed: number;
}

export function wantsSplash(search: string): boolean {
  return new URLSearchParams(search).get('water') === 'v2';
}

export function installSplash(d: SplashDeps): SplashFx {
  const fx = new SplashFx(d.game.scene, {
    seed: d.seed,
    focus: () => d.controller.state.position,
    brightness: () => d.time.brightness(),
  });
  d.game.onUpdate((dt) => fx.update(dt));
  return fx;
}
