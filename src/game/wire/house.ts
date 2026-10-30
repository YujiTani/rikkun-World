// main.ts の 流れ 5.5: 建築士さん（HOUSE-1A）。話す 流れ・くら・保存の 記録・見た目・メニューの 画面を つなぐ。
import { Vector3 } from 'three';
import { playArchitect } from '../../fx/architectSounds';
import { playCraft } from '../../fx/craftSounds';
import { ArchitectRenderer } from '../../house/ArchitectRenderer';
import { KuraScreen } from '../../house/kuraScreen';
import { HouseSystem } from '../../house/system';
import { HouseUi } from '../../ui/houseUi';
import type { WiredYokai } from './creatures';

/** 建築士さんの 頭の 上（足もとから）。ふきだしの しっぽが ここに くる */
const HEAD_TOP = 1.8;

export function wireHouse(deps: WiredYokai) {
  const { shared, world, seed, island, game, fxSound, hud, lock, pointerLock, controller, inventory, lighting, combat, dig, screen } = deps;

  const house = new HouseSystem({
    seed,
    world,
    spawn: () => {
      const s = island.spawn();
      return { x: s.x, z: s.z, yawDeg: s.yawDeg };
    },
    player: () => controller.state.position,
    bag: inventory,
    // 【仮の 声】サウンド係の 3 案から yuzu が 選ぶまでの 開発の 1 案（src/fx/architectSounds.ts）
    voice: () => playArchitect(fxSound, 'architect_voice'),
    // 道具を わたした: 「拾った」ログ・知らせと 同じ 道を 通す（持ち物には もう 入れてある）
    gave: (item) => shared.onDropPicked(item, 1, false),
    // メニュー・くらが 開く: マウスが 出る。時間と 妖怪の 停止は ゲームの 窓（shared.houseFrozen）が 受けもつ。たんす・とりごやと おなじ 錠の あつかい
    onOpen: () => {
      lock.setInventoryOpen(true);
      game.input.releaseAll();
      if (lock.isSimulated()) lock.simulate(false);
      pointerLock.release();
    },
    onClose: () => {
      if (lock.isSimulated()) {
        lock.simulate(true);
        lock.setInventoryOpen(false);
      } else {
        lock.beginRelock();
        lock.setInventoryOpen(false);
        pointerLock.request();
      }
      game.input.releaseAll();
      shared.requestSave(); // あずけた・とりだした 中身を 保存に
    },
    // やられた・もちもの画面や とりごやが 開いた: 話しを やめる（メニューが 勝手に 開かない ように）
    interrupted: () => combat.dead() || screen.inventoryOpen() || shared.coopMenuIsOpen(),
  });
  shared.house = house;
  shared.houseFrozen = () => house.frozen();

  const kuraScreen = new KuraScreen({
    slots: () => inventory.slots(),
    bagCount: (item) => inventory.count(item),
    entries: () => house.state.kura.entries(),
    kuraCount: (item) => house.state.kura.count(item),
    canStack: (item) => house.state.kura.canHold(item),
    deposit: (item, n) => house.deposit(item, n),
    withdraw: (item, n) => house.withdraw(item, n),
  });

  // 話して いる 建築士さんの 頭の 上（画面の ピクセル）。うしろ・画面の 外なら null
  const head = new Vector3();
  const anchor = (): { x: number; y: number } | null => {
    const id = house.talk.current();
    const a = id === null ? undefined : house.manager.get(id);
    if (!a) return null;
    game.camera.updateMatrixWorld();
    head.set(a.x, a.y + HEAD_TOP, a.z).project(game.camera);
    if (head.z < -1 || head.z > 1) return null;
    return { x: (head.x * 0.5 + 0.5) * window.innerWidth, y: (-head.y * 0.5 + 0.5) * window.innerHeight };
  };

  const houseUi = new HouseUi({
    parent: hud,
    menu: () => house.menu(),
    press: (id) => house.press(id),
    screen: kuraScreen,
    tick: () => playCraft(fxSound, 'tab'),
    anchor,
  });
  house.setOnChange(() => houseUi.refresh());

  // 見た目: 1 人 = 1 描画。足もとの 影は にわとりの 影の 描画に まぜる（wireAnimalView が shadowSpots を 読む）ので、これより 先に 動かす
  const architectRenderer = new ArchitectRenderer((x, z) => shared.streamHost?.stream.isDrawn(Math.floor(x) >> 4, Math.floor(z) >> 4) ?? true);
  game.scene.add(architectRenderer.group);
  lighting.register(architectRenderer.bodyMaterial, 'doll');

  // 時間が すすんで いる 間だけ（メニュー・くらが 開くと ゲームの 窓が 止める）
  game.onUpdate(() => house.update());
  game.onBeforeRender(() => {
    architectRenderer.update(house.manager.all(), game.camera, dig.aimedArchitect());
    houseUi.placeBubble();
  });

  // Esc・E: 話しを やめる（うなずき・あいさつ・メニュー・くら ぜんぶ）。メニューの 間は もちもの画面は 開かない（錠が 開いて いない）
  game.input.onPress((action) => {
    if ((action === 'closeMenu' || action === 'toggleInventory') && house.talking()) house.close();
  });

  return { house, architectRenderer, houseUi };
}

export type WiredHouse = WiredYokai & ReturnType<typeof wireHouse>;
