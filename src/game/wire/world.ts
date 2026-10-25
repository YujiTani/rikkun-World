// main.ts の 流れ 1: 起動・音・世界・保存の 読みこみ・描画と 時刻。作る順は そのまま（上から 順に 呼ぶ）。
import { preloadLegendSounds } from '../../fx/legendSounds';
import { preloadGetaSounds } from '../../fx/getaSounds';
import { playCraft } from '../../fx/craftSounds';
import { WORLD_HEIGHT, SEA_Y } from '../../contracts';
import { Lighting, Sky } from '../../sky';
import { TimeOfDayImpl } from '../../time';
import { FX_SETTINGS } from '../../fx/config';
import { createBrowserTitleSound } from '../../fx/titleSound';
import { SoundFx } from '../../fx/sound';
import { createAudioSettings } from '../../fx/audioConfig';
import { AudioMixer } from '../../fx/audioMixer';
import { BgmPlayer } from '../../fx/bgm/BgmPlayer';
import { BgmSceneTracker } from '../../fx/bgm/scene';
import { createAudioPersistence } from '../../ui/soundSettingsModel';
import { parseSaveOptions, compressionAvailable, openIdb, SAVE_ID, requestPersist, shouldReset } from '../../save';
import { openStoredKeys, emptyStreamRestore } from '../../save/streamRestore';
import { setRing } from '../../world/stream/ring';
import { createWorldInfo } from '../../world/gen/worldInfo';
import { Game } from '../../game/Game';
import { buildScenery } from '../../game/scenery';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { GEN_CONFIG } from '../../world/gen/config';
import { installMicroCountries } from '../../world/gen/microCountry';
import { WorldRenderer } from '../../world/render/WorldRenderer';
import { decideFrameClock } from '../../world/frameClock';
import { setKataTable } from '../../world/render/looks';
import { decideKata } from '../../world/render/looks/kata';
import { createStartBoot } from '../../start/startBoot';
import { SAVE_BOOT_TIMEOUT_MS } from '../../start/lastWorld';
import { decideWeightedStart } from '../../start/weightPref';
import { decideStrength, strengthToSave } from '../../yokai/strengthPref';
import { playWeapon } from '../../fx/weaponSounds';
import { createShared } from './shared';

export async function wireBoot() {
  const shared = createShared();

  const container = document.getElementById('game')!;
  const hud = document.getElementById('hud')!;

  /** URL の ?seed=数 で世界を変えられる（なければふだんのシード） */
  function readSeed(): number {
    const raw = new URLSearchParams(location.search).get('seed');
    const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
    return Number.isInteger(n) ? n : GEN_CONFIG.defaultSeed;
  }

  const game = new Game(container);

  // SOUND-1: 音（ミキサー → BGM → 効果音の順に作る。AudioContext は ミキサーだけが作る）
  const audioSettings = createAudioSettings();
  const audioPersist = createAudioPersistence(window.localStorage, audioSettings, FX_SETTINGS); // ?nosave=1 でも音の設定は保存する
  audioPersist.load();
  const mixer = new AudioMixer(audioSettings);
  const bgm = new BgmPlayer(mixer);
  const bgmScene = new BgmSceneTracker(audioSettings);
  const fxSound = new SoundFx({ output: () => mixer.output(), chord: () => bgm.chord(), onBig: () => mixer.duck() });
  // 二つ名の出現音（音ファイル）。効果音と同じミキサーの sfx バスに流す。プレイヤーの 最初の 操作のあとで 読みこむ（それまで AudioContext を 作らない）
  const titleSound = createBrowserTitleSound(
    () => FX_SETTINGS.fxVolume,
    () => mixer.output()?.ctx ?? null,
    () => mixer.output()?.destination ?? null,
  );
  {
    const warm = (): void => {
      window.removeEventListener('pointerdown', warm, true);
      window.removeEventListener('keydown', warm, true);
      mixer.unlock(); // 先に AudioContext を作ってから読む（下の unlock と同じ。何度呼んでもよい）
      void titleSound.preload();
      void preloadLegendSounds(fxSound);
      void preloadGetaSounds(fxSound); // 明珍下駄の 足音（最初の 操作の あとに 1 回）
    };
    window.addEventListener('pointerdown', warm, true);
    window.addEventListener('keydown', warm, true);
  }
  // START-1: 世界を 作る 前に スタートメニュー（URL に 指定が あるときは 出さない。仕様 §4.1）
  const saveOptions = parseSaveOptions(location.search);
  let store: Storage | null = null;
  try {
    store = saveOptions.nosave ? null : window.localStorage;
  } catch {
    store = null;
  }
  // IndexedDB が 開かない・返事がないときも ゲームは始める（3 秒でやめて 保存なしで遊ぶ）
  const sleepNull = () => new Promise<null>((ok) => setTimeout(() => ok(null), SAVE_BOOT_TIMEOUT_MS));
  const idbOpening = store && compressionAvailable() ? Promise.race([openIdb(), sleepNull()]) : Promise.resolve(null);
  const startBoot = createStartBoot();
  window.__rikkun = { start: startBoot.hook } as unknown as NonNullable<typeof window.__rikkun>; // メニューの あいだは 窓口 start だけ
  const startPlan = await startBoot.run({
    search: location.search,
    store,
    db: idbOpening,
    envStartMenu: import.meta.env.VITE_START_MENU as string | undefined,
    nSections: Math.ceil(WORLD_HEIGHT / 16),
    sound: (name) => (name === 'dry' ? playWeapon(fxSound, 'dry') : playCraft(fxSound, name)), // tab・sparkle = 作る音、dry = ゆみの ぽよん
    readSeed,
  });

  // 世界: 入れ物（空）→ 列は ChunkStream が プレイヤーのまわりから 近い順に 読みこむ・捨てる（VOX-D）
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  world.edgeClosedBelow = SEA_Y - 8; // 読みこんでいない列の横は、海ゆかより下は ふさがっているとみなす（地下の「見えない」印）
  const seed = startPlan.seed;
  installMicroCountries(world, seed);
  const island = createWorldInfo(seed, world);
  // 保存（VOX-F）: IndexedDB から さわった列を 世界に入れる。描画の前に（光が 最初から 正しくなるように）
  // 前の世界（'main'・'seed-N'）とは別の名前。前の世界は読まず、消さない（VOX-B）
  const saveId = seed === GEN_CONFIG.defaultSeed ? SAVE_ID : `vox-seed-${seed}`;
  let idb = await idbOpening;
  if (idb) requestPersist();
  const bootSignal = { aborted: false };
  // 公開したゲームの ?reset=1 は 何もしない（いたずらのリンクで 世界が消えないように。#169）
  const doReset = shouldReset(saveOptions.reset, import.meta.env.DEV);
  // 起動で読むのは meta と 列のキーの一覧だけ（列の中身は いるときに 1 列ずつ。VOX-D D1）
  let restored = await Promise.race([openStoredKeys({ db: idb, store, seed, saveId, reset: doReset, signal: bootSignal }), sleepNull()]);
  if (restored === null) {
    bootSignal.aborted = true;
    idb = null;
    restored = emptyStreamRestore();
  }
  return {
    shared, hud, game, audioSettings, audioPersist, mixer, bgm, bgmScene, fxSound, titleSound, saveOptions,
    store, startBoot, startPlan, world, seed, island, saveId, idb, restored,
  };
}

type WiredBoot = Awaited<ReturnType<typeof wireBoot>>;

export function wireRender(deps: WiredBoot) {
  const { shared, startPlan, store, restored, world, island, game } = deps;
  // 小ブロックの半径（?microR=0|16|24|28。F3 を出して F4 でも切りかえる。VOX-E）。
  // E2E のサーバー（VITE_MICRO_DEFAULT=off）は 0 = 小ブロックなし。最初の列の段から効くよう 作るときに渡す（#180）
  // 1 コマの仕事を 時間で決めるか 数で決めるか（E2E のサーバー VITE_FRAME_CLOCK=count は数。#179）
  // 輪の大きさ（?ring=full|small。E2E のサーバーは VITE_RING_DEFAULT=small。#203）。WorldRenderer を作る前に 1 回だけ決める
  // ブロックの型（?kata=off|4|8|16 と &kataUnder=K。#202）。メッシュを作る前に決める
  setKataTable(decideKata(location.search));
  // START-1 §4.4: おもさ（かるい・ふつう・きれい）→ 小ブロックの半径・輪・かげ。URL ＞ E2E の 環境変数 ＞ おもさ ＞ 今の きまり
  const weighted = decideWeightedStart({
    search: location.search,
    weight: startPlan.weight,
    env: {
      shadow: import.meta.env.VITE_SHADOW_DEFAULT as string | undefined,
      micro: import.meta.env.VITE_MICRO_DEFAULT as string | undefined,
      ring: import.meta.env.VITE_RING_DEFAULT as string | undefined,
    },
    shadowStore: store,
  });
  setRing(weighted.ring);
  // START-1 §4.3: つよさ（URL ＞ 保存 ＞ メニューで えらんだ 物 ＞ ふつう）。保存に 書く 値は 保存の 値（URL では 書きかえない）
  const strengthLevel = decideStrength(location.search, restored.meta, startPlan.strength);
  const strengthToWrite = strengthToSave(location.search, restored.meta, startPlan.strength);
  const frameClock = decideFrameClock(location.search, import.meta.env.VITE_FRAME_CLOCK as string | undefined);
  const renderer = new WorldRenderer(world, weighted.microR, frameClock);
  if (new URLSearchParams(location.search).get('meshSlice') === 'off') renderer.config.meshSlice = false; // 小ブロックを 分けずに 1 回で作る（見くらべ・perf 用）
  renderer.enableStreaming();
  renderer.setViewer(island.spawn().x, island.spawn().z);
  renderer.attach(game.scene);
  const lighting = new Lighting();
  const sceneBefore = new Set(game.scene.children);
  buildScenery(game.scene);
  for (const child of game.scene.children) if (!sceneBefore.has(child)) lighting.registerTree(child, 'block');
  for (const m of renderer.materials()) lighting.register(m, 'block');
  const time = new TimeOfDayImpl();
  const timeSettings = time.settings;
  const sky = new Sky({ scene: game.scene, time, timeSettings, lighting, light: renderer.light, focus: () => shared.controller.state.position });
  return {
    weighted, strengthLevel, strengthToWrite, frameClock, renderer, lighting, time, timeSettings, sky,
  };
}

export type WiredRender = WiredBoot & ReturnType<typeof wireRender>;
