// main.ts の 流れ 7 の 一部: 影（ShadowSystem）の 立ち上げと「かげ」の せってい
import type { Mesh, Object3D } from 'three';
import type { Game } from '../Game';
import { ShadowSystem, type ShadowDeps } from '../../world/render/shadow/ShadowSystem';
import { type KeyValueStore, type ShadowStart, saveShadowPref } from '../../world/render/shadow/shadowPref';
import { createShadowSetting } from '../../ui/shadowSetting';

export function wireShadow(d: {
  game: Game;
  start: ShadowStart;
  store: KeyValueStore | null;
  /** せっていの 部品を 入れる 所 */
  parent: HTMLElement;
  /** ShadowSystem に 渡す もの（影を 作る ときだけ 呼ぶ） */
  deps: () => ShadowDeps;
  /** キャラの 板の 絵（あれば 影を つなぐ） */
  sprite: () => Object3D | undefined;
}): { system: ShadowSystem | null; setShadow: (on: boolean) => void } {
  const { game, start } = d;
  const host = document.createElement('div');
  host.className = 'ss-root';
  d.parent.appendChild(host);
  const ui = createShadowSetting(host);
  let system: ShadowSystem | null = null;
  if (start.build) {
    ShadowSystem.activate();
    const sys = new ShadowSystem(d.deps());
    sys.enabled = start.on;
    const sprite = d.sprite();
    if (sprite) sys.attachSprite(sprite as Mesh);
    game.onBeforeRender(() => sys.preRender());
    window.addEventListener('pagehide', () => sys.dispose());
    system = sys;
  }
  const setShadow = (on: boolean): void => {
    if (!system) return;
    system.enabled = on;
    saveShadowPref(d.store, on);
    ui.refresh(on);
    game.step(0); // 次のコマで画面を合わせる
  };
  ui.bind(system !== null, start.on, setShadow);
  return { system, setShadow };
}
