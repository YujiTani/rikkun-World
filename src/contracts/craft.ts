/**
 * 作る・ログの型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { ItemId, ItemStack } from './items';
import type { MaterialSources, MaterialUse, TansuPos } from './storage';
import type { BlockId, Vec3 } from './world';

// ================================================================ M4（作る・やく・道具・武器・防具）
// 担当の割り振り: docs/tickets/M4-dev-split.md。仕様: docs/design/M4-craft.md

export interface Recipe {
  id: string;
  output: ItemStack;
  inputs: ItemStack[];
  /** M4 で働きまで作るか（false は作れるだけ） */
  works: boolean;
  /** つくる（どこでも）か、やく（かまど）か */
  station: 'craft' | 'furnace';
}

export type CraftEvent =
  | { type: 'craft'; tick: number; recipe: string; item: ItemId; count: number; /** CRAFT-2: たんす から使った分（空 = 使っていない。省くと 空と同じ） */ fromTansu?: (TansuPos & { item: ItemId; count: number })[] }
  | { type: 'craftFail'; tick: number; recipe: string; reason: 'missing' | 'full' | 'unknown' | 'haveOne' }
  | { type: 'bakeStart'; tick: number; recipe: string; fuel: ItemId; position: Vec3 }
  | { type: 'bakeDone'; tick: number; recipe: string; item: ItemId; count: number; position: Vec3 }
  /** 拾った・焼けて入った（ログ用。つくったもの・テスト用の add は出さない） */
  | { type: 'pickup'; tick: number; item: ItemId; count: number };

/** つくる・やく。担当 A が `src/craft/` で実装する */
export interface CraftSystem {
  recipes(): Recipe[];
  /** 今の持ち物で作れるか・足りないもの */
  status(recipeId: string): { craftable: boolean; missing: ItemStack[]; /** ITEM-FX-1: 持ち物 全体で 1 つだけの 物（おまもり）を もう 持っている */ limit?: 'haveOne' };
  make(recipeId: string): { ok: boolean; reason: null | 'missing' | 'full' | 'unknown' | 'noFuel' | 'queueFull' | 'haveOne'; /** CRAFT-2: ok のときだけ（ねんりょう もふくむ） */ used?: MaterialUse | null };
  /** CRAFT-2: 今 つくったら どこから何こ取るかの 予定（何も変えない） */
  sources(recipeId: string): MaterialSources;
  /** CRAFT-2: 今の位置で `fogFar` 以内に しぼった 使える たんす（取る順。§2.4 (3)） */
  tansuInRange(): (TansuPos & { dist: number })[];
  /** CRAFT-2: テスト用の数（AC9b） */
  debugCounts(): { tansuFilterCount: number };
  /** いま えらんでいる ねんりょう（0 こなら 自動の順の次。なければ null） */
  fuel?(): ItemId | null;
  /** ねんりょう を えらぶ（せきたん・あぶら・き のどれか。持っていなくてもよい） */
  setFuel?(id: ItemId): boolean;
  /** かまど のブロックか */
  isFurnace(x: number, y: number, z: number): boolean;
  /** かまど を開く（画面は担当 C） */
  openFurnace(x: number, y: number, z: number): void;
  /** 開いている かまど（なければ null） */
  openedFurnace(): Vec3 | null;
  /** かまど をこわした（中身を返す） */
  furnaceBroken(x: number, y: number, z: number): void;
  /** こわしたときの数が決まっているブロック（なければ null で M2 のランダム） */
  fixedDrop(id: BlockId): number | null;
  /** 画面と音用（呼ぶと空）。テスト用の列は別に持つ */
  drainEvents(): CraftEvent[];
}

/** A → B: 作った・焼いた（演出と横断幕の出来事。`CraftEvent` の craft / bakeDone から A が作る） */
export interface CraftMadeEvent {
  kind: 'craft' | 'bake';
  tick: number;
  recipe: string;
  item: ItemId;
  count: number;
  /** はじめて（横断幕を出す）か */
  first: boolean;
  /** コンボ（1 から。§2.4 (1) の 5） */
  combo: number;
}

export type CraftMadeListener = (e: CraftMadeEvent) => void;

/** §2.7 のカテゴリー 6 つ */
export type LogCategory = 'pickup' | 'craft' | 'fight' | 'achieve' | 'info' | 'warn';

/** §6.1 `log.history()` の kind 12 種 */
export type LogKind =
  | 'pickup'
  | 'fromTansu'
  | 'craft'
  | 'bakeStart'
  | 'signal'
  | 'farmHint'
  | 'wearLow'
  | 'wearBroken'
  | 'defeat'
  | 'home'
  | 'achievement'
  | 'level';

export interface LogEntry {
  tick: number;
  kind: LogKind;
  category: LogCategory;
  item: ItemId | null;
  count: number | null;
  text: string;
  /** kind が fromTansu のとき */
  positions?: (TansuPos & { count: number })[];
}

/** 画面の不透明度（§2.8。下限・0〜1 を通したあとの 今の値） */
export interface UiAlpha {
  panel: number;
  hud: number;
  scrim: number;
  min: number;
}

/** §4 の設定（`settings.get/set` の名前そのまま）。初期値は `CRAFT2_SETTING_DEFAULTS`。`craftTansuRange` は 使える たんす の きょり（かすみ `fogFar` とは つなげない） */
export interface Craft2Settings {
  logHistoryMax: number;
  logMergeTicks: number;
  logScrollRows: number;
  uiPanelAlpha: number;
  uiHudAlpha: number;
  uiScrimAlpha: number;
  uiAlphaMin: number;
  craftTansuRange: number;
}
