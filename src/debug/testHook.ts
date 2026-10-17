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
import type { UiAlpha } from '../contracts';
import type { createRarityHook } from '../drops/rarityHook';
import type { createStorageHook } from '../storage/hook';
import type { createYokaiHook } from '../yokai';
import type { createFarmHook } from '../farm';
import type { WorldHook } from '../world/hook';
import type { createRenderHook } from '../world/render/renderHook';
import type { AudioHook } from '../fx/bgm/hook';
import type { ShadowHook } from '../world/render/shadow/shadowHook';
import type { FrameClock } from '../world/frameClock';
import type { PerfOverlay } from './perfOverlay';
import type { CharSprite, SpriteInfo } from '../char';
import type { SpriteMotion } from '../char';

type CameraHook = ReturnType<typeof createCameraHook>;
type PlayerHook = {
  get(): unknown;
  set(v: { position?: object; velocity?: object; yaw?: number; pitch?: number }): void;
  doll: CameraHook['doll'];
};

/**
 * 自動テスト（テストチーム・性能チーム）からゲームを操作するための窓口。
 * window.__rikkun でアクセスする。遊ぶ人には見えない。
 * 名前の一覧と決まりは docs/design/M1-02-movement.md §6.1。
 */
export interface TestHook {
  ready: boolean;
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
  world: WorldHook;
  /** SHADOW-1: 光の位置から計算する影（docs/design/SHADOW.md §8.1） */
  shadow: ShadowHook;
  /** M5: 距離で描くチャンクの数 */
  render: ReturnType<typeof createRenderHook>;
  player: PlayerHook;
  camera: CameraHook['camera'];
  /** CHAR-1 第 5.2 版 §4.9: ねらいの点 X・ねらい補助で えらんだ妖怪の id */
  aim: { point(): { x: number; y: number; z: number }; assist(): number | null };
  input: ReturnType<typeof createInputHook>;
  lock: ReturnType<typeof createLockHook> & { tab(name: string): void };
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
  /** M4 追加: 経験値とレベル */
  level: ReturnType<typeof createLevelHook>;
  yokai: ReturnType<typeof createYokaiHook>['yokai'];
  /** M6 §6.1: 実績・おめでとう画面 */
  achievements: ReturnType<typeof createAchievementsHook> & { modal(): unknown; close(): unknown; sounds(): string[]; mute(on: boolean): void };
  /** FIX-action-hint: 照準の下に出している 絵（アイテム名）と 1 語 */
  hud: { /** あう道具のヒント（BAL-D）: 光っているホットバーのマス（0 はじまり）と のこりステップ。出ていなければ null */ toolHint(): { slot: number; ticksLeft: number } | null; /** ふちどりを付けている妖怪の id（なければ null） */ yokaiFocus(): number | null; /** ふちどりの複製の数 */ yokaiFocusHulls(): number; /** 妖怪の体力のバー（BALANCE.md §4.7）。いない id は null */ hpBar(yokaiId: number): { visible: boolean; bars: number; left: number; color: 'white' | 'yellow' | 'red'; icon: 'oyabun' | 'taisho' | 'nushi' | null } | null; /** 登場のおしらせ（たいしょう・ヌシ。180 ステップ）。出ていなければ null */ announce(): { text: string; icon: 'taisho' | 'nushi'; ticksLeft: number } | null; /** 頭の上の名前（二つ名の妖怪。16 ブロック以内で visible）。いない id は null */ nameplate(yokaiId: number): { visible: boolean; text: string } | null; actionHint(): { right?: { icon: string; word: string }; left?: { icon: string; word: string } } };
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
  /** CRAFT-2 §6.1: 画面の不透明度 */
  ui: { alpha(): UiAlpha };
}

declare global {
  interface Window {
    __rikkun?: TestHook;
  }
}

export type TestHookGroups = Pick<TestHook, 'shadow' | 'world' | 'render' | 'player' | 'camera' | 'aim' | 'input' | 'lock' | 'settings' | 'target' | 'dig' | 'inventory' | 'save' | 'time' | 'combat' | 'yokai' | 'craft' | 'furnace' | 'armor' | 'tool' | 'blade' | 'attack' | 'bow' | 'level' | 'achievements' | 'storage' | 'hud' | 'farm' | 'log' | 'ui' | 'audio' | 'rarity'>;

export function installTestHook(game: Game, overlay: PerfOverlay, groups: TestHookGroups, clock: FrameClock = 'time'): void {
  window.__rikkun = {
    ready: true,
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
          scene: 'stand', want: { motion: 'idle', frame: 0 }, status: {}, cpuBytes: 0, bladeColors: null,
        }),
        visible: !!info && info.visible && group.visible,
        restartMotion: () => sprite?.restartMotion(),
        readCell: (motion: SpriteMotion, tier: 0 | 1 | 2, dir: number, frame: number) =>
          sprite ? sprite.readCell(motion, tier, dir, frame) : new Uint8ClampedArray(256 * 256 * 4),
      },
    };
  };
}
