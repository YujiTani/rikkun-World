// main.ts の 流れ 5.5: 建築士さん（HOUSE-1A）。話す 流れ・くら・保存の 記録・見た目・メニューの 画面を つなぐ。
import { Vector3 } from 'three';
import { playArchitect } from '../../fx/architectSounds';
import { playCraft } from '../../fx/craftSounds';
import { ArchitectRenderer } from '../../house/ArchitectRenderer';
import { watchBlocks } from '../../house/blockWatch';
import { KuraScreen } from '../../house/kuraScreen';
import { Preview3D } from '../../house/preview/preview';
import { HouseSystem } from '../../house/system';
import { setPlanNameSource } from '../../inventory/planName';
import { EditorView } from '../../ui/houseEditor';
import { HouseUi } from '../../ui/houseUi';
import type { WiredYokai } from './creatures';

/** 建築士さんの 頭の 上（足もとから）。ふきだしの しっぽが ここに くる */
const HEAD_TOP = 1.8;

export function wireHouse(deps: WiredYokai) {
  const { shared, world, seed, island, game, fxSound, hud, lock, pointerLock, controller, inventory, lighting, combat, dig, screen, blobShadow, storage } = deps;

  const house = new HouseSystem({
    seed,
    world,
    spawn: () => {
      const s = island.spawn();
      return { x: s.x, z: s.z, yawDeg: s.yawDeg };
    },
    player: () => controller.state.position,
    bag: inventory,
    // 建築士さんの 声: yuzu が 決めた 案 C「ハミング」（話すたびに 3 しゅるいを じゅんばんに。src/fx/architectSounds.ts）
    voice: () => playArchitect(fxSound, 'architect_voice'),
    // 道具を わたした: 「拾った」ログ・知らせと 同じ 道を 通す（持ち物には もう 入れてある）
    gave: (item) => shared.onDropPicked(item, 1, false),
    // たんすの 中の 道具も「持って いる」（なくした ときだけ「どうぐを もらう」）
    owned: (item) => storage.list().reduce((n, p) => n + storage.countItem(p.x, p.y, p.z, item), 0),
    // メニュー・くらが 開く: マウスが 出る。時間と 妖怪の 停止は ゲームの 窓（shared.houseFrozen）が 受けもつ。たんす・とりごやと おなじ 錠の あつかい
    onOpen: () => {
      lock.setInventoryOpen(true);
      game.input.releaseAll();
      if (lock.isSimulated()) lock.simulate(false);
      pointerLock.release();
    },
    onClose: () => {
      game.redrawWorld(); // エディターの 見本が キャンバスぜんぶを ぬって いる ので、世界を 描きなおす
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
  setPlanNameSource((plan) => house.planName(plan));
  // 見本（3D）は エディターを はじめて 開く とき 作る（ふだんの 遊びには 何も 足さない）
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let preview: Preview3D | null = null;
  const getPreview = (): Preview3D => (preview ??= new Preview3D(game.renderer, () => reduced?.matches === true));
  // エディターを とじたら 見本を すてる（絵の 表・材料を 持ちっぱなしに しない。次に ひらくと 作りなおす）
  const releasePreview = (): void => {
    preview?.dispose();
    preview = null;
  };
  // 窓口（previewDrag・previewWheel・hover）と editor().preview は 見本が あれば その 見本へ（なければ 何も しない）
  house.preview = {
    info: (mode) => preview?.info(mode) ?? null,
    drag: (dx, dy) => preview?.drag(dx, dy) ?? false,
    wheel: (dx, dy) => preview?.wheel(dx, dy) ?? false,
    hover: (on) => preview?.hover(on),
  };
  // ブロックを 置く・ほる → 足もとに かかる 建築士さんが 高さを あわせる（立って いる 間は 毎ステップ 世界を 読まない ため。farm.onBlockChanged と 同じ 流れ）
  watchBlocks(world, house.manager);

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
    makeEditor: (parent) =>
      new EditorView({ parent, ctl: house.editor, preview: getPreview, release: releasePreview, canvas: game.renderer.domElement, press: (id) => house.press(id), sound: fxSound }),
    screen: kuraScreen,
    tick: () => playCraft(fxSound, 'tab'),
    anchor,
  });
  house.setOnChange(() => houseUi.refresh());
  // エディターが 開いて いる 間は ゲームの 時間が 止まる ので、見本の 向き・ふきだしの 時間・見本の 描画は ゲームの 窓（player.ts）が 呼ぶ
  shared.houseModal = {
    tick: () => {
      house.tickEditor();
      houseUi.stepEditor();
    },
    render: () => houseUi.drawEditor(),
  };

  // 見た目: 1 人 = 1 描画。足もとの 影は プレイヤーの 影（blobShadow）の 描画に まぜる（描画回数 +0）
  const architectRenderer = new ArchitectRenderer((x, z) => shared.streamHost?.stream.isDrawn(Math.floor(x) >> 4, Math.floor(z) >> 4) ?? true);
  game.scene.add(architectRenderer.group);
  lighting.register(architectRenderer.bodyMaterial, 'doll');

  // 時間が すすんで いる 間だけ（メニュー・くらが 開くと ゲームの 窓が 止める）
  game.onUpdate(() => house.update());
  game.onBeforeRender(() => {
    architectRenderer.update(house.manager.all(), game.camera, dig.aimedArchitect());
    blobShadow.setExtras(architectRenderer.shadowSpots());
    houseUi.placeBubble();
  });

  // Esc・E: 話しを やめる（うなずき・あいさつ・メニュー・くら ぜんぶ）。メニューの 間は もちもの画面は 開かない（錠が 開いて いない）。
  // エディターの Esc は 確かめの まど → ひつような もの → 家具の えらび → とじる の 順（house.escape）
  game.input.onPress((action) => {
    if (action === 'closeMenu' && house.talking()) house.escape();
    else if (action === 'toggleInventory' && house.talking() && !house.editing()) house.close();
  });
  // エディターの 中は Esc いがいの キーを ゲームの 操作に しない（W・E・Q・数字キー。AC14）。Esc は エディターの 順で、Backspace は 1 もじ けす。
  // 止めるのは 押した とき（keydown）だけ。はなした とき（keyup）は ゲームに とどける（キーを 押した まま ひらいて、中で はなしても、
  // とじた あとに ゲームの 側で 押しっぱなしの まま 残らない ように）
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent): void => {
      if (!house.editing() || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
      e.stopImmediatePropagation();
      if (!e.repeat) {
        if (e.key === 'Escape') house.escape();
        else if (e.key === 'Backspace') house.press('erase');
      }
      e.preventDefault();
    },
    true,
  );

  return { house, architectRenderer, houseUi };
}

export type WiredHouse = WiredYokai & ReturnType<typeof wireHouse>;
