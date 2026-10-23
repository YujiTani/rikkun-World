import type { Game, RenderStats } from '../game/Game';
import type { createCameraHook } from '../camera/hook';
import type { createSettingsHook } from '../game/settings';
import type { createInputHook, createLockHook } from '../input';
import type { createDigHook } from '../dig';
import type { createInventoryHook } from '../inventory';
import type { createSaveHook } from '../save';
import type { createTimeHook } from '../time';
import type { createCombatHook } from '../combat';
import type { createArmorHook, createCraftHook, createFurnaceHook } from '../craft';
import type { createCraftUiHook } from '../ui/craftUi';
import type { createToolHook } from '../tools';
import type { createBladeHook } from '../tools/blade/hook';
import type { createLevelHook } from '../level';
import type { createAchievementsHook } from '../achievements';
import type { createLogHook } from '../ui/log';
import type { UiAlpha, AnimalEvent, AnimalHintKind, AnimalInfo, AnimalSpawnOpts, AnimalWindowHint, AnimalSaveV2, AnimalSaveV3, AnimalSaveV4, CoopInfo, CoopPlaceResult, KitInfo, ThrowSpot } from '../contracts';
import type { createRarityHook } from '../drops/rarityHook';
import type { createStorageHook } from '../storage/hook';
import type { createYokaiHook } from '../yokai';
import type { createFarmHook } from '../farm';
import type { WorldHook } from '../world/hook';
import type { BiomeHook } from '../world/gen/biomeHook';
import type { createRenderHook } from '../world/render/renderHook';
import type { AudioHook } from '../fx/bgm/hook';
import type { ShadowHook } from '../world/render/shadow/shadowHook';
import type { FrameClock } from '../world/frameClock';
import type { PerfOverlay } from './perfOverlay';
import type { ThunderHook } from '../fx/thunderFx';
import type { CharSprite, SpriteInfo } from '../char';
import type { SpriteMotion } from '../char';
import type { StartHook } from '../start/startBoot';
import type { WorkHook } from './workHook';

type CameraHook = ReturnType<typeof createCameraHook>;
type PlayerHook = {
  get(): unknown;
  set(v: { position?: object; velocity?: object; yaw?: number; pitch?: number }): void;
  doll: CameraHook['doll'];
  /** WEAPON-5: 青白い光（visible・のこりステップ・強さ 0〜1） */
  glow(): { visible: boolean; ticksLeft: number; level: number };
};

/**
 * 自動テスト（テストチーム・性能チーム）からゲームを操作するための窓口。
 * window.__rikkun でアクセスする。遊ぶ人には見えない。
 * 名前の一覧と決まりは docs/design/M1-02-movement.md §6.1。
 */
export interface TestHook {
  ready: boolean;
  /** START-1 §4.7: スタートメニュー（メニューの あいだも 出さない ときも ある） */
  start: StartHook;
  tick(): number;
  pause(): void;
  /** 描画を止める／再開（再開すると次の 1 回を描く） */
  suspendRender(on: boolean): void;
  resume(): void;
  step(count?: number): void;
  renderStats(): RenderStats;
  /** #179: 1 コマの仕事を 時間（ms）で決めるか 数で決めるか（E2E のサーバーは 'count'） */
  clock(): FrameClock;
  perfOverlayVisible(): boolean;
  /** #255: 重さを 仕事の数で 見る（start → step → read → stop。docs/tickets/PERF-255.md） */
  work: WorkHook;
  world: WorldHook;
  /** VOX-I-1 §8.1: 12 の国（at・here・find・take.path） */
  biome: BiomeHook;
  /** SHADOW-1: 光の位置から計算する影（docs/design/SHADOW.md §8.1） */
  shadow: ShadowHook;
  /** CHAR-5 §4.6: キャラ（girl|boy|block）を 聞く・切りかえる */
  char: { get(): { kind: 'girl' | 'boy' | 'block' }; set(kind: 'girl' | 'boy'): void };
  /** M5: 距離で描くチャンクの数 */
  render: ReturnType<typeof createRenderHook>;
  player: PlayerHook & { /** WEAPON-8 §7: 剣を 持つ 手の 位置 */ handPos(): unknown };
  camera: CameraHook['camera'];
  /** CHAR-1 第 5.2 版 §4.9: ねらいの点 X・ねらい補助で えらんだ妖怪の id */
  aim: { point(): { x: number; y: number; z: number }; assist(): number | null };
  input: ReturnType<typeof createInputHook>;
  lock: ReturnType<typeof createLockHook> & { tab(name: string): void; book(target: string): void; bookStats(): { calls: number; triangles: number } };
  settings: ReturnType<typeof createSettingsHook>;
  target: ReturnType<typeof createDigHook>['target'];
  dig: ReturnType<typeof createDigHook>['dig'];
  inventory: ReturnType<typeof createInventoryHook>;
  save: ReturnType<typeof createSaveHook>;
  time: ReturnType<typeof createTimeHook>;
  combat: ReturnType<typeof createCombatHook> & { arrows(): unknown[]; sounds(): string[] };
  /** M4 §6.1 */
  craft: Omit<ReturnType<typeof createCraftHook>, 'click'> & ReturnType<typeof createCraftUiHook>['craft'];
  furnace: ReturnType<typeof createFurnaceHook>;
  armor: ReturnType<typeof createArmorHook>;
  tool: ReturnType<typeof createToolHook>['tool'];
  /** WEAPON-2 §6.1: 刀・弓 */
  blade: ReturnType<typeof createBladeHook>['blade'];
  bow: ReturnType<typeof createToolHook>['bow'];
  /** WEAPON-3 §4.8: 近接の 攻撃の 向き */
  attack: { preview(): unknown; last(): unknown };
  /** WEAPON-5 §4.8: 刀のパリィ（状態・出来事。events は 読んでも 空にならない） */
  parry: { state(): unknown; events(): unknown[] };
  /** M4 追加: 経験値とレベル */
  level: ReturnType<typeof createLevelHook>;
  yokai: ReturnType<typeof createYokaiHook>['yokai'];
  /** M6 §6.1: 実績・おめでとう画面 */
  achievements: ReturnType<typeof createAchievementsHook> & { modal(): unknown; sounds(): string[]; mute(on: boolean): void };
  /** FIX-action-hint: 照準の下に出している 絵（アイテム名）と 1 語 */
  hud: { /** あう道具のヒント（BAL-D）: 光っているホットバーのマス（0 はじまり）と のこりステップ。出ていなければ null */ toolHint(): { slot: number; ticksLeft: number } | null; /** ふちどりを付けている妖怪の id（なければ null） */ yokaiFocus(): number | null; /** ふちどりの複製の数 */ yokaiFocusHulls(): number; /** 妖怪の体力のバー（BALANCE.md §4.7）。いない id は null */ hpBar(yokaiId: number): { visible: boolean; bars: number; left: number; big: number; icon: 'oyabun' | 'taisho' | 'nushi' | null } | null; /** 登場のおしらせ（たいしょう・ヌシ。180 ステップ）。出ていなければ null */ announce(): { text: string; icon: 'taisho' | 'nushi'; ticksLeft: number } | null; /** 頭の上の名前（二つ名の妖怪。16 ブロック以内で visible）。いない id は null */ nameplate(yokaiId: number): { visible: boolean; text: string } | null; actionHint(): { right?: { icon: string; word: string }; left?: { icon: string; word: string } }; /** WEAPON-5: よろけアイコン（2 倍が のこっている あいだ visible）。いない id は null */ staggerIcon(yokaiId: number): { visible: boolean } | null };
  /** M6 §6.1: たんす */
  storage: ReturnType<typeof createStorageHook>;
  /** M7 §6.1: 農業 */
  farm: ReturnType<typeof createFarmHook>;
  /** CRAFT-2 §6.1: ログとできごと */
  log: ReturnType<typeof createLogHook>['log'];
  /** SOUND-1: 何を鳴らすと決めたか（docs/audio/SOUND.md §8） */
  audio: AudioHook;
  /** RARITY-7 §4.4: めずらしさの表と当てはめ */
  rarity: ReturnType<typeof createRarityHook>;
  /** LIVE-1 §6.1: にわとり */
  animals: {
    spawn(x: number, y: number, z: number, opts?: AnimalSpawnOpts): number | null;
    list(): AnimalInfo[];
    clear(): void;
    trySpawn(): number | null;
    target(): number | null;
    events(): AnimalEvent[];
    fx(): unknown; // 実体 は AnimalFxRecord（contracts）
    fxReset(): void;
    lastHint(): AnimalHintKind | AnimalWindowHint | null;
    /** 版 3.2: だっこ している id か null */
    carrying(): number | null;
    // ---- LIVE-2.1（§6.2）
    /** だっこ 中 の 着地点 `{ x, y, z, ok, home, toss, why }`（照準 の ねらい で きめる。だっこ して いなければ null） */
    throwSpot(): ThrowSpot | null;
    /** テスト 用: だっこ 中 の 子 を その 足もと の 点 へ なげる（ゲーム と 同じ とびかた・きまり）。なげ はじめたら true */
    throwTo(x: number, y: number, z: number): boolean;
    /** LIVE-4 試作: マッチョ が 妖怪 へ はしる → パンチ → 3 回目 きりあげ → ふんっ！（null で やめる）。くわしくは `animals/live4Proto.ts` */
    live4Proto(opts: { yokai?: 'karakasa' | 'chochin' | 'nurikabe' | 'rokurokubi'; hits?: number; markScale?: number; noMark?: boolean } | null): unknown;
    live4ProtoInfo(): unknown;
    // ---- LIVE-2（§6.1）
    /** 小屋 を 置く（ゲーム の 置く と 同じ 判定）。x・z は 5×5 の まん中、y は いちばん 下 の 空気 の 高さ。小屋 id か 理由 */
    placeCoop(x: number, y: number, z: number, dir?: 0 | 1 | 2 | 3): CoopPlaceResult;
    coops(): CoopInfo[];
    kits(): KitInfo[];
    /** かえす くじ の はずれ 数（`n` を 渡す と 設定） */
    machoMiss(n?: number): number;
    /** LIVE-3（§6.1）: その 小屋 の えらべる 子 の id */
    meatList(coopId: number): number[];
    /** LIVE-3（§6.1）: いただきます を 押した の と 同じ（準備 用） */
    meat(coopId: number, id: number): { ok: boolean; reason: null | 'notEligible' | 'busy' };
    /** 保存 v 3 の 形 を 取り出す・流しこむ */
    serialize(): AnimalSaveV4 | AnimalSaveV3 | AnimalSaveV2;
    deserialize(data: unknown): void;
  };
  /** CRAFT-2 §6.1: 画面の不透明度 */
  ui: { /** LIVE-3: とりごや の メニュー の ようす */ coopMenu(): { open: boolean; coop: number | null; page: 'top' | 'pick' | 'confirm'; kids: number[]; selected: number | null; eggs: number; meatDisabled: boolean }; /** LIVE-3: メニュー の ボタン を 押す（'collect'｜'meat'｜'back'｜'cancel'｜'ok'｜'close'｜'card'｜'hover'） */ coopMenuPress(button: string, id?: number): void; /** LIVE-3: いただきます の 一言（出て いなければ 空） */ meatText(): string; alpha(): UiAlpha; /** WEAPON-7 §9: 画面の 上の 帯 */ topBand(): { kind: 'achieve' | 'telop' | 'appear' | null; item: string | null; age: number; leftSteps: number; queue: string[] }; /** WEAPON-8 §7: 速さバフの アイコン */ buffs(): unknown[] };
  /** WEAPON-7 §9: レジェンダリー武器（ため・ためわざ） */
  legend: {
    state(): unknown;
    events(): unknown[];
    waves(): unknown[];
    /** WEAPON-8 §7 */
    debris(): unknown;
    chargeFx(): unknown;
    chargeSound(): unknown;
    spiralSound(): unknown;
  };
  /** ART-PIPE-1: 雷 B の 見た目（コマ・板の 向き・輪・つぶ・まわりの 明るさ・絵の 読み方）。型は e2e/helpers/thunder.ts */
  thunder: ThunderHook;
}

declare global {
  interface Window {
    __rikkun?: TestHook;
  }
}

export type TestHookGroups = Pick<TestHook, 'start' | 'work' | 'shadow' | 'char' | 'world' | 'biome' | 'render' | 'player' | 'camera' | 'aim' | 'input' | 'lock' | 'settings' | 'target' | 'dig' | 'inventory' | 'save' | 'time' | 'combat' | 'yokai' | 'craft' | 'furnace' | 'armor' | 'tool' | 'blade' | 'attack' | 'bow' | 'level' | 'achievements' | 'storage' | 'hud' | 'farm' | 'log' | 'ui' | 'audio' | 'rarity' | 'animals' | 'parry' | 'legend' | 'thunder'>;

export function installTestHook(game: Game, overlay: PerfOverlay, isReady: () => boolean, groups: TestHookGroups, clock: FrameClock = 'time'): void {
  window.__rikkun = {
    // 起動の ChunkStream が そろってから true（一度 true になったら そのまま。VOX-D）
    get ready(): boolean {
      return isReady();
    },
    tick: () => game.tick,
    pause: () => {
      game.paused = true;
    },
    suspendRender: (on: boolean) => {
      game.renderSuspended = on;
      if (!on) game.renderNow();
    },
    resume: () => {
      game.paused = false;
    },
    step: (count = 1) => game.step(count),
    renderStats: () => game.getRenderStats(),
    clock: () => clock,
    perfOverlayVisible: () => overlay.visible,
    ...groups,
  };
}

/**
 * `player.doll()` に キャラの板の窓口 `sprite` を足す（CHAR-1 §4.9）。
 * 板が箱人形の入れ物ごと かくれているとき（見下ろしカメラなど）は visible を false にする。
 * ?char=block のときは 板がないので loaded false・visible false。
 */
export function withSpriteDoll(base: () => object, sprite: CharSprite | null, group: { visible: boolean }) {
  return () => {
    const info: SpriteInfo | null = sprite ? sprite.info() : null;
    return {
      ...base(),
      sprite: {
        ...(info ?? {
          visible: false, motion: 'idle', frame: 0, dir: 0, tier: 0, elevDeg: 0, tiltDeg: 0, upDeg: 0,
          tint: { r: 1, g: 1, b: 1 }, loaded: false, gpuBytes: 0,
          scene: 'stand', want: { motion: 'idle', frame: 0 }, status: {}, cpuBytes: 0, bladeColors: null, kind: 'girl', palette: [],
        }),
        visible: !!info && info.visible && group.visible,
        restartMotion: () => sprite?.restartMotion(),
        readCell: (motion: SpriteMotion, tier: 0 | 1 | 2, dir: number, frame: number) =>
          sprite ? sprite.readCell(motion, tier, dir, frame) : new Uint8ClampedArray(256 * 256 * 4),
      },
    };
  };
}
