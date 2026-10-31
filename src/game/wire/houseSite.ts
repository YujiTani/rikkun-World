// main.ts の 流れ 5.6: 家を 建てる 画面まわり（HOUSE-1C PR-2 #340）。上空の 視点（カメラ・緑の 場所・わく・マウス・キー）・みずもりの 色・道具を 持った 形・音・
// 建築中の 場所の 守り（歩いて 入れない・妖怪が 湧かない）を ゲームに つなぐ。論理は src/house/build/*（DOM・three なし）、絵は skyScene.ts・heldTool.ts。
import { playDozuki, playHouseDone, playMizumori, playTonkachi, playTonkachiStart } from '../../fx/houseSounds';
import { HeldTool, type HeldToolKind } from '../../house/build/heldTool';
import { SkyScene } from '../../house/build/skyScene';
import { SKY, toolKindOf } from '../../house/build/tuning';
import type { HouseSfx } from '../../house/build/glue';
import type { HouseSystem } from '../../house/system';
import type { WiredYokai } from './creatures';

/** 上空の 視点で 矢印に する 動き（moveForward ＝ 北〔−z〕が 画面の 上） */
const STEPS = [
  ['moveForward', 0, -1],
  ['moveBack', 0, 1],
  ['moveLeft', -1, 0],
  ['moveRight', 1, 0],
] as const;

export function wireHouseSite(deps: WiredYokai) {
  const { game, controller, inventory, lighting, rig, fxSound } = deps;
  const sky = new SkyScene(game.camera);
  game.scene.add(sky.group);
  const tool = new HeldTool(() => rig.doll.group.getObjectByName('charSprite'));
  rig.doll.group.add(tool.root);
  lighting.registerTree(tool.root, 'doll');

  /** 「なにを しているか」を HouseSystem へ わたす 前に 作る ので、house は あとから つなぐ */
  let house: HouseSystem | null = null;
  /** プレイヤーの 足もと（set で 入れかわっても いい ように 毎回 読む） */
  const P = (): { x: number; y: number; z: number } => controller.state.position;
  const tmp = { x: 0, y: 0, z: 0 };
  const pt = { x: 0, y: 0 };

  /** 上空の 視点の 世界の 描き（毎コマ 呼ぶので 関数を 作りなおさない） */
  const renderWorld = (): void => game.renderWorldFrame();

  /** 上空の カメラで f を 実行（カメラは かならず もとへ もどす） */
  const inSky = <T>(f: () => T): T => {
    sky.enter(P().x, P().y, P().z);
    try {
      return f();
    } finally {
      sky.leave();
    }
  };

  // ------------------------------------------------------------ マウス
  const planeY = (): number => (house?.build.flow.sites()[0]?.y ?? Math.floor(P().y) - 1) + 1;
  const pointerTo = (cx: number, cy: number): boolean => {
    const h = house;
    const o = h?.build.flow.outer();
    if (!h || !o || !h.skying()) return false;
    inSky(() => sky.ground(cx, cy, planeY(), tmp));
    h.skyMoveTo(Math.round(tmp.x - o.w / 2), Math.round(tmp.z - o.d / 2));
    return true;
  };
  const pointer = {
    move: (x: number, y: number): void => void pointerTo(x, y),
    click: (x: number, y: number): void => {
      if (pointerTo(x, y)) house?.skyDecide();
    },
  };

  // ------------------------------------------------------------ キー
  let rep = 0;
  const attach = (h: HouseSystem): void => {
    house = h;
    // 矢印・WASD: 押した ときに 1 マス（押しっぱなしは tick で くり返す）
    game.input.onPress((action) => {
      if (!h.skying()) return;
      for (const [a, dx, dz] of STEPS) if (a === action) h.skyMove(dx, dz);
    });
    // Enter（決定）は keyGuard の 道（house/keyGuard.ts。wire/house.ts で つなぐ）
    // 上空の 視点の 窓口: 世界の 点が 画面の どこか（時間が 止まって いても 上空の カメラで 数える）
    h.sky = { project: (x, y, z) => inSky(() => ({ ...sky.project(x, y, z, pt) })) };
  };

  /** 画面の 状態が かわった（menu() が かわる たび）。上空の 視点が おわったら 緑の 絵を かくして 世界を ふつうの カメラで 描きなおす */
  let wasSky = false;
  /** 上空の 絵（置ける 場所・わく）を 最後に 作った 画面の 版 */
  let skyVer = -1;
  const changed = (): void => {
    const now = house?.skying() ?? false;
    if (!now) skyVer = -1; // 次に 上空に 入ったら 緑の 絵を 作りなおす
    if (wasSky && !now) {
      sky.hide();
      game.renderWorldFrame();
    }
    wasSky = now;
  };

  /** メニューが 開いて いる 間の 1 ステップ: 押しっぱなしの 矢印を くり返す */
  const tick = (): void => {
    const h = house;
    if (!h || !h.skying()) {
      rep = 0;
      return;
    }
    for (const [a, dx, dz] of STEPS) {
      if (!game.input.isHeld(a)) continue;
      rep++;
      if (rep > SKY.delayTicks && (rep - SKY.delayTicks) % SKY.repeatTicks === 0) h.skyMove(dx, dz);
      return;
    }
    rep = 0;
  };

  /** 上空の 視点を 描く（世界が 止まって いる 間も 毎コマ） */
  const drawSky = (): void => {
    const f = house?.build.flow;
    if (!f) return;
    // 画面の 版が かわった ときだけ 絵を 作りなおす（毎コマ cursor()・outer() の 物を 作らない）
    if (f.version !== skyVer) {
      const o = f.outer();
      if (!o) return;
      skyVer = f.version;
      sky.show(f.sites(), o.w, o.d, f.cursor());
    }
    inSky(renderWorld);
  };

  // ------------------------------------------------------------ 道具・みずもりの 色
  let levelShown = false;
  /** みずもりの 色を 最後に 書いた ときの 配列・版（変わって いなければ 169 この 行列を 書きなおさない） */
  let lastCells: unknown = null;
  let lastRev = -1;
  game.onUpdate(() => tool.tick());
  game.onBeforeRender(() => {
    const kind: HeldToolKind | null = toolKindOf(inventory.held()?.item);
    tool.hold(kind);
    tool.apply();
    const h = house;
    if (!h) return;
    const cells = h.build.level.cells(kind === 'level', P().x, P().z);
    const rev = h.build.level.revision();
    if ((cells.length > 0 || levelShown) && (cells !== lastCells || rev !== lastRev)) {
      lastCells = cells;
      lastRev = rev;
      sky.showLevel(cells, h.build.level.baseY());
      levelShown = cells.length > 0;
    }
  });

  /** 音・演出（HouseSfx → 鳴らす・道具を ふる） */
  const play = (e: HouseSfx): void => {
    switch (e.k) {
      case 'level':
        playMizumori(fxSound);
        tool.kick();
        break;
      case 'dozuki':
        playDozuki(fxSound, e.hard);
        tool.kick();
        break;
      case 'start':
        playTonkachiStart(fxSound);
        break;
      case 'hammer':
        playTonkachi(fxSound);
        break;
      case 'done':
        playHouseDone(fxSound);
        break;
      default: {
        const never: never = e;
        throw new Error(`知らない 音: ${JSON.stringify(never)}`);
      }
    }
  };

  return { siteView: { sky, tool, pointer, attach, changed, tick, drawSky, play } };
}
