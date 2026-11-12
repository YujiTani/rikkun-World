// main.ts の 流れ 7 の 一部: 影（ShadowSystem）の 立ち上げと「かげ」の せってい
import type { Mesh, Object3D } from 'three';
import type { Game } from '../Game';
import { ShadowSystem, type ShadowDeps } from '../../world/render/shadow/ShadowSystem';
import { type KeyValueStore, type ShadowStart, saveShadowPref } from '../../world/render/shadow/shadowPref';
import { createShadowSetting } from '../../ui/shadowSetting';

export function wireShadow(d: {
  game: Game;
  start: ShadowStart;
  /** かげを あとから 作って よいか（?shadow=0 は 作らない。GFX-1） */
  allowed: boolean;
  /** 環境変数 VITE_SHADOW_DEFAULT=off（E2E）。まだ作っていない あいだは 案内画面の「かげ」の 行を 隠す */
  envOff: boolean;
  store: KeyValueStore | null;
  /** せっていの 部品を 入れる 所 */
  parent: HTMLElement;
  /** ShadowSystem に 渡す もの（影を 作る ときだけ 呼ぶ） */
  deps: () => ShadowDeps;
  /** キャラの 板の 絵（あれば 影を つなぐ） */
  sprite: () => Object3D | undefined;
  /** 影の しくみを 作った とき（起動の ときも あとからも）1 回 */
  onBuilt: (s: ShadowSystem) => void;
}): { setShadow: (on: boolean, persist?: boolean) => void; isOn: () => boolean } {
  const { game, start } = d;
  const host = document.createElement('div');
  host.className = 'ss-root';
  d.parent.appendChild(host);
  const ui = createShadowSetting(host);
  let system: ShadowSystem | null = null;
  /** 作る。材料の 影つきの プログラムは 作りなおし（ShadowSystem の constructor が 見る） */
  const build = (on: boolean): ShadowSystem => {
    ShadowSystem.activate();
    const sys = new ShadowSystem(d.deps());
    sys.enabled = on;
    const sprite = d.sprite();
    if (sprite) sys.attachSprite(sprite as Mesh);
    game.onBeforeRender(() => sys.preRender());
    window.addEventListener('pagehide', () => sys.dispose());
    system = sys;
    d.onBuilt(sys);
    return sys;
  };
  if (start.build) build(start.on);
  let wantOn = start.on;
  // persist = false: おもさを 押して そろえる とき（保存は おもさの ほうで 消す）
  const setShadow = (on: boolean, persist = true): void => {
    if (!d.allowed) return;
    if (on && !system) build(true); // かるいで 始めても その場で 作る（GFX-1 G5）
    ui.el.hidden = !system && d.envOff;
    if (system) system.enabled = on;
    wantOn = on;
    if (persist) saveShadowPref(d.store, on);
    ui.refresh(on);
    game.step(0); // 次のコマで画面を合わせる
  };
  ui.bind(d.allowed && !(d.envOff && !system), wantOn, setShadow);
  // 影の しくみは あとから 作られる ことが ある ので、ここでは 返さない（onBuilt で 受ける）
  return { setShadow, isOn: () => wantOn };
}
