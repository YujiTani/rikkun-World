// main.ts の 流れ 5.5: 建築士さん（HOUSE-1A）。話す 流れ・材料〔もちもの ＋ 近くの たんす。1E〕・保存の 記録・見た目・メニューの 画面を つなぐ。
import { playArchitect } from '../../fx/architectSounds';
import { playCraft } from '../../fx/craftSounds';
import { ArchitectRenderer } from '../../house/ArchitectRenderer';
import { watchBlocks } from '../../house/blockWatch';
import { houseKeyGuard } from '../../house/keyGuard';
import { Preview3D } from '../../house/preview/preview';
import { HouseSystem } from '../../house/system';
import { setPlanNameSource } from '../../inventory/planName';
import { EditorView } from '../../ui/houseEditor';
import { HouseUi } from '../../ui/houseUi';
import { HouseDoneUi } from '../../ui/houseSite/celebrate';
import type { WiredYokai } from './creatures';
import { wireHouseSite } from './houseSite';
import { createHouseGate, type Who } from './modalOwner';
import { insetPane, projectToPane, projectUnclipped } from '../../ui/houseBubble';

/** 持ち物に 入らなかった かみを 落とす 高さ・散らばり（宝箱の 落とし物と 同じ。game/wire/mine.ts） */
const RECIPE_DROP_RISE = 0.5;
const RECIPE_SCATTER = { speedMin: 0.3, speedMax: 0.8, upMin: 3, upMax: 3.5 } as const;

/** 建築士さんの 頭の 上（足もとから）。ふきだしの しっぽが ここに くる */
const HEAD_TOP = 1.8;

export function wireHouse(deps: WiredYokai) {
  const { shared, world, seed, island, drops, game, fxSound, hud, controller, inventory, lighting, combat, dig, screen, blobShadow, storage, craft, w2, yokaiM, animals } = deps;
  // 家を 建てる 画面まわり（上空の 視点・みずもりの 色・道具を 持った 形・音）。house は あとから つなぐ（attach）
  const { siteView } = wireHouseSite(deps);

  // 本・建築士さんの 錠の あつかいは 1 つを 共有（かけなおし待ちの 状態が 1 つに なる ように。combat.ts の wireSeat が 作る）
  const modal = deps.modalLock;
  // 開いた 人の 取り合い: 先に 開いた 人が 勝つ。取れなければ 建築士さんを とじる（錠には さわらない）
  let mine = false;
  let opener: Who = 1;
  const gate = createHouseGate({ claim: (who) => (mine = shared.modalOwner.claim(who)), release: () => shared.modalOwner.release() }, () => house.close());
  const house: HouseSystem = new HouseSystem({
    seed,
    world,
    spawn: () => {
      const s = island.spawn();
      return { x: s.x, z: s.z, yawDeg: s.yawDeg };
    },
    player: () => controller.state.position,
    bag: inventory,
    // COOP-1 5d: 2P が 話した ときは 2P の 足もと・もちもの・たんすで 動く（話した 人の 物。docs/design/COOP-1.md 1.16 §3.7 (e)）
    playerOf: (who) => (who === 1 ? controller.state.position : (shared.duoMate()?.position ?? null)),
    bagOf: (who) => (who === 1 ? inventory : shared.p2.inventory),
    craftOf: (who) => (who === 1 ? craft : shared.p2House.craft()),
    // 材料（建てる・せっけいずの かみ・ふで）は もちもの ＋ 近くの たんす: 「つくる」と 同じ 数え方・同じ きょり（設定 craftTansuRange）。数えるのは 画面を 開いた・押した とき だけ
    craft,
    tansu: storage,
    durability: () => w2.toolDurability,
    // 建築士さんの 声: yuzu が 決めた 案 C「ハミング」（話すたびに 3 しゅるいを じゅんばんに。src/fx/architectSounds.ts）
    voice: () => playArchitect(fxSound, 'architect_voice'),
    // 道具を わたした: 「拾った」ログ・知らせと 同じ 道を 通す（持ち物には もう 入れてある）
    gave: (item, who) => (who === 2 ? shared.p2DropPicked(item, 1, false) : shared.onDropPicked(item, 1, false)),
    // 戸を 外から 通って 中に 入った: 名前の 帯を 上の 帯の 列〔実績・テロップと ならぶ〕に 入れる（HOUSE-1 §3.3）
    nameBand: (text) => shared.celebrate.enqueueHouseName(text),
    // HOUSE-2A: レシピを おぼえた テロップ（上の 帯の 列。「<名前>の レシピを おぼえた！…」）・ぜんぶ おぼえた あとの かみが 持ち物に 入らない 分は 足もとへ
    recipeBand: (text) => shared.celebrate.enqueueHouseDone(text, 'recipe-band'),
    drop: (item, count) => {
      const p = controller.state.position;
      drops.scatter({ x: p.x, y: p.y + RECIPE_DROP_RISE, z: p.z }, [{ item, count }], RECIPE_SCATTER);
    },
    // たんすの 中の 道具も「持って いる」（なくした ときだけ「どうぐを もらう」）
    owned: (item) => storage.list().reduce((n, p) => n + storage.countItem(p.x, p.y, p.z, item), 0),
    // メニューが 開く: マウスが 出る。時間と 妖怪の 停止は ゲームの 窓（shared.houseFrozen）が 受けもつ。たんす・とりごやと おなじ 錠の あつかい
    onOpen: () => {
      opener = house.talker() ?? 1;
      gate.onOpen(opener);
      if (mine) modal.open();
    },
    onClose: () => {
      game.redrawWorld(); // エディターの 見本が キャンバスぜんぶを ぬって いる ので、世界を 描きなおす
      const had = mine;
      mine = false;
      gate.onClose();
      if (had) modal.close(opener); // 2P が パッドの B で とじたら 1P の 錠は かけなおし待ち（AC171）
      shared.requestSave(); // かえした くらの 物・作った せっけいずを 保存に
    },
    // やられた・もちもの画面や とりごやが 開いた: 話しを やめる（メニューが 勝手に 開かない ように）
    interrupted: (who) => (who === 1 ? combat.dead() || screen.inventoryOpen() || shared.coopMenuIsOpen() : shared.p2Down() || shared.p2House.panelOpen()),
    // HOUSE-1C PR-2: 手に 持って いる 物（みずもりの 色）・音と 演出・場所の 中の 人と 動物・妖怪を 外へ
    held: () => inventory.held()?.item ?? null,
    play: (e) => siteView.play(e),
    teleport: (who, x, y, z) => (who === 1 ? controller.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 } }) : shared.p2House.teleport(x, y, z)),
    evict: (box, spots) => {
      yokaiM.evictFrom(box, spots);
      animals.evictFrom(box, spots);
    },
  });
  shared.house = house;
  siteView.attach(house);
  // 建築中の 場所の 中（床の 上）は 歩いて 入れない。足場の ブロックと あわせて 外へ とめる（建築中でなければ すぐ false）
  const solidBase = world.isSolidForPlayer.bind(world);
  world.isSolidForPlayer = (x, y, z) => solidBase(x, y, z) || house.build.builder.keepOut(x, y, z);
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
    hover: (on, part) => preview?.hover(on, part),
  };
  // ブロックを 置く・ほる → 足もとに かかる 建築士さんが 高さを あわせる・家の 戸の 記録が あけしめ・こわれを おぼえる（立って いる 間は 毎ステップ 世界を 読まない ため。farm.onBlockChanged と 同じ 流れ）
  watchBlocks(world, house.watcher);

  // 話して いる 建築士さんの 頭の 上（画面の ピクセル）。うしろ・画面の 外なら null。2P が 話した ときは 2P の カメラで 2P の 半分の 中（COOP-1 5d・AC164）
  const head = { x: 0, y: 0, z: 0 };
  const fullPane = { x: 0, y: 0, w: 0, h: 0 };
  const bubblePane = { x: 0, y: 0, w: 0, h: 0 };
  const clockBox = { l: 0, t: 0, r: 0, b: 0 };
  const paneNow = (): { camera: typeof game.camera; pane: { x: number; y: number; w: number; h: number } } => {
    const p2 = house.talker() === 2 ? shared.p2House.bubble() : null;
    if (p2) return p2;
    fullPane.w = window.innerWidth;
    fullPane.h = window.innerHeight;
    return { camera: game.camera, pane: fullPane };
  };
  const anchor = (): { x: number; y: number } | null => {
    const id = house.talk.speaker();
    const a = id === null ? undefined : house.manager.get(id);
    if (!a) return null;
    const v = paneNow();
    v.camera.updateMatrixWorld();
    head.x = a.x;
    head.y = a.y + HEAD_TOP;
    head.z = a.z;
    // 1 人の ときは 今までどおり（カメラの うしろ だけ null。よこに はみ出しても はしに おさめる）。2P の 半分は 区画の 外も null
    return house.talker() === 2 ? projectToPane(head, v.camera, v.pane) : projectUnclipped(head, v.camera, v.pane);
  };

  const houseUi = new HouseUi({
    parent: hud,
    menu: () => house.menu(),
    press: (id) => house.press(id),
    rename: () => house.renameView(),
    makeEditor: (parent) =>
      new EditorView({ parent, ctl: house.editor, preview: getPreview, release: releasePreview, canvas: game.renderer.domElement, press: (id) => house.press(id), sound: fxSound, hover: (id) => house.hover(id), tip: () => house.hoverTip() }),
    tick: () => playCraft(fxSound, 'tab'),
    anchor,
    // 2P が 話した ときは 半分の まん中の 線から 5% あけた 区画に おさめ、時計に かからない ように する（UI 検査 'duo-house-bubble-p2'）
    pane: () => {
      const v = paneNow().pane;
      return house.talker() === 2 ? insetPane(v, bubblePane) : v;
    },
    avoid: () => {
      const c = house.talker() === 2 ? document.getElementById('clock') : null;
      if (!c || c.hidden) return null;
      const r = c.getBoundingClientRect();
      clockBox.l = r.left;
      clockBox.t = r.top;
      clockBox.r = r.right;
      clockBox.b = r.bottom;
      return clockBox;
    },
    confirming: () => house.cursor()?.confirm === true,
    site: { pickList: () => house.pickList(), needRows: () => house.buildNeedRows(), buildName: () => house.buildName(), pointer: siteView.pointer },
  });
  // 完成の 帯と 紙ふぶき（毎フレーム。変わった ときだけ DOM を 書く）
  const doneUi = new HouseDoneUi(hud, () => reduced?.matches === true, (text) => shared.celebrate.enqueueHouseDone(text));
  house.setOnChange(() => {
    houseUi.refresh();
    siteView.changed();
  });
  // エディターが 開いて いる 間は ゲームの 時間が 止まる ので、見本の 向き・ふきだしの 時間・見本の 描画は ゲームの 窓（player.ts）が 呼ぶ
  shared.houseModal = {
    tick: () => {
      house.tickEditor();
      houseUi.stepEditor();
      siteView.tick();
    },
    render: () => (house.skying() ? siteView.drawSky() : houseUi.drawEditor()),
  };

  // 見た目: 1 人 = 1 描画。足もとの 影は プレイヤーの 影（blobShadow）の 描画に まぜる（描画回数 +0）
  const architectRenderer = new ArchitectRenderer((x, z) => shared.streamHost?.stream.isDrawn(Math.floor(x) >> 4, Math.floor(z) >> 4) ?? true);
  game.scene.add(architectRenderer.group);
  lighting.register(architectRenderer.bodyMaterial, 'doll');

  // 時間が すすんで いる 間だけ（メニューが 開くと ゲームの 窓が 止める）
  game.onUpdate(() => house.update());
  game.onBeforeRender(() => {
    architectRenderer.update(house.manager.all(), game.camera, dig.aimedArchitect());
    blobShadow.setExtras(architectRenderer.shadowSpots());
    houseUi.placeBubble();
    doneUi.update(house.build.celebrate.view());
  });

  // Esc・E: 話しを やめる（うなずき・あいさつ・メニュー ぜんぶ）。メニューの 間は もちもの画面は 開かない（錠が 開いて いない）。
  // エディターの Esc は 確かめの まど → ひつような もの → 家具の えらび → とじる の 順（house.escape）
  // 2P が 話して いる あいだは 1P の Esc・E は 2P の 話を やめさせない（動かせるのは 開いた 人だけ）。2P の パッドの B は 2P の 話を やめる
  game.input.onPress((action) => {
    if (house.talker() === 2) return;
    if (action === 'closeMenu' && house.talking()) house.escape();
    else if (action === 'toggleInventory' && house.talking() && !house.editing()) house.close();
  });
  deps.gamepadApi.slots.get(1).onPress((action) => {
    if (action === 'closeMenu' && house.talker() === 2) house.escape();
  });
  // エディター・なまえを かえる の 名前の 画面の 中は Esc いがいの キーを ゲームの 操作に しない（W・E・Q・数字キー。AC14・§2.6）。くわしくは house/keyGuard.ts
  window.addEventListener('keydown', houseKeyGuard(house), true);

  return { house, architectRenderer, houseUi };
}

export type WiredHouse = WiredYokai & ReturnType<typeof wireHouse>;
