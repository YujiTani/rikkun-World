import type { ItemId } from '../contracts';
import type { ArmorSnapshot } from '../craft/ArmorSystem';
/**
 * COOP-1（docs/design/COOP-1.md）の 型の 約束。作業 1〜2 で 使う 型を ここに 1 か所で 置く。
 * これは 型だけ（実行する コードを 持たない）。実装（developer）は この 型を そのまま 使う。変えるときは テストも 直す。
 */

import type { PadChoice } from '../input/gamepad/padChoice';

/** 画面の ようす（§2.3。1.8）。2P が いなければ 'one'（1 人の 全面）、いれば いつも 'split'（左右） */
export type DuoView = 'one' | 'split';

/** `window.__rikkun.duo.state()` の 形（§12.0） */
export interface DuoState {
  joined: boolean;
  view: DuoView;
  distance: number;
  meter: number;
  rings: 1 | 2;
  columns: number;
  light: boolean;
  padLost: boolean;
}

/**
 * `duo.arrow(who)` が 返す、相手の 向きの 矢印（§2.4・§9.3。1.8）。
 * x・y = 矢印の 先の 画面の 位置（CSS px。左上が 0,0）、angle = 度（画面の 上 0°・時計回り。0 以上 360 未満）、color = 相手の 色（#rrggbb）。
 */
export interface DuoArrow {
  x: number;
  y: number;
  angle: number;
  color: string;
}

export interface DuoVec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * `duo.viewports()` が 返す、いま 描いている 画面の 区画(作業 2。AC25・AC26)。CSS px(画面の 左上が 0,0)。
 * 2P が いなければ [1P の 全面]、いれば いつも [1P の 左半分, 2P の 右半分]（1.8）。
 * camera = その 区画を 描く カメラの 位置(世界)、yawDeg = 向き(`player.get().yawDeg` と 同じ 決まり)。
 */
export interface DuoViewport {
  who: 1 | 2;
  x: number;
  y: number;
  w: number;
  h: number;
  camera: DuoVec3;
  yawDeg: number;
}

/** 作業 2 で `DuoHook` に 足す 口(〔tester が 足した 口〕仕様 §12.0 の 表に 足してほしい)。developer は DuoHook に `viewports` を 足して 使う */
export interface DuoViewportsHook {
  viewports(): DuoViewport[];
}

/**
 * `window.__rikkun.duo`（§12.0）。
 * 〔tester が 足した 口〕`pos(who)` = 1P・2P の 足もとの 位置。E2E で「だれが 動いたか」を 聞くのに 要る。
 * 〔tester が 足した 口〕`leave()` = 2P を「やめる」と 同じに いなくする（理由 'quit'。持ち物は 保存される）。AC14 の「参加して やめたあと」で 使う。
 * `timeScale()` も tester が 足した 口(AC11)。どれも 仕様 §12.0 の 表に 足してほしい（designer へ）。
 * 〔約束〕`__rikkun.duo` は ふつうの URL でも いつも ある(`?.` は 要らない)。`place()` だけ `?duo=dev` の ときしか 効かない（作業 3d から `join()`・`setPadChoice()` は ふつうの URL でも 効く）。
 * 〔約束〕2P の「コントローラーを つないでね」は data-testid="duo-pad-lost"(padLost の あいだ だけ 見える)。
 * `place()` は `?duo=dev` の ときだけ 使える（§12.0）。
 */
/** 作業 3a（#416。§12.0）: 2P の あそびの 口。aimAt・give・hurt は `?duo=dev` の ときだけ 効く */
export interface DuoPlayHook {
  aimAt(who: 1 | 2, cell: DuoVec3): void;
  target(who: 1 | 2): { block: DuoVec3; place: DuoVec3; id: string } | null;
  frame(who: 1 | 2): { visible: boolean; color: string };
  give(who: 1 | 2, item: ItemId, count: number): void;
  /** COOP-1 4a（§12.0・1.10）: その人の もちもの 9×3 と ホットバー 9 を 見本で いっぱいに する（`?duo=dev` の ときだけ。2P が いなければ who 2 は 何も しない） */
  sample(who: 1 | 2): void;
  count(who: 1 | 2, item: ItemId): number;
  /** COOP-1 4b（§12.0）: その人の そうび（`armor.snapshot()` と 同じ 形）。2P が いなければ who 2 は null。ふつうの URL でも 効く（見るだけ） */
  armor(who: 1 | 2): ArmorSnapshot | null;
  /** COOP-1 4b（§12.0）: その人に そうびを 着せる（`armor.set` と 同じ）。`?duo=dev` の ときだけ */
  equip(who: 1 | 2, head: ItemId | null, body: ItemId | null, arms?: ItemId | null, legs?: ItemId | null): void;
  hearts(who: 1 | 2): { hp: number; maxHp: number; down: boolean };
  hurt(who: 1 | 2, amount: number): void;
  /** 作業 3a の 足し: レベルと けいけんち（1P は `level.get()` と 同じ。2P が いないとき who=2 は null） */
  level(who: 1 | 2): { level: number; xp: number; next: number } | null;
  /** レベルを 決める（`?duo=dev` の ときだけ。UI 検査と テスト用。演出・回復は 出さない） */
  setLevel(who: 1 | 2, level: number, xp?: number): void;
  /** けいけんちを 足す（`?duo=dev` の ときだけ。上がれば 演出・ハート回復も ふつうに 出る） */
  addXp(who: 1 | 2, amount: number): void;
}

export interface DuoHook extends DuoPlayHook {
  join(): boolean;
  place(who: 1 | 2, pos: DuoVec3): void;
  state(): DuoState;
  /** 2P が いないとき who=2 は null(仕様 §12.0) */
  pos(who: 1 | 2): DuoVec3 | null;
  leave(): void;
  /** Game に 渡している 時間の 倍率(AC11・AC84。2 人のとき 1P の 全面の もちもの画面は 0 = 世界が 止まる。2P の パネルだけ なら 1) */
  timeScale(): number;
  /** いま 描いている 区画(作業 2。AC25・AC26。型は DuoViewport) */
  viewports(): DuoViewport[];
  /** 1.8（§12.0）: その 人の 半分に 出ている 相手の 向きの 矢印。出ていない・2P が いない → null */
  arrow(who: 1 | 2): DuoArrow | null;
  /** 作業 2.5（#401。§12.0）: 決めて 保存してある えらび。なし・こわれた・つかえない → null(はじめの動き) */
  padChoice(): PadChoice | null;
  /** 作業 2.5: タブで 決めたのと 同じ(＋ の 確認は とばす)。変な 値 → false で 何もかえない（作業 3d から ふつうの URL でも 効く） */
  setPadChoice(c: PadChoice): boolean;
  /** 作業 2.5: 1P・2P が 今 読んでいる パッドの 番号(1 本のときの かわりも 出る)。なし → null */
  padIndex(who: 1 | 2): number | null;
  /** COOP-1 4a（§12.0）: その 人の 2 人用 もちもの画面。開いているか・今の ページ・えらんでいる 物（1P は DOM の フォーカス、2P は 2P の えらび）。1 人の ときの 全面は who 1 でも open false */
  inv(who: 1 | 2): { open: boolean; page: 'items' | 'craft' | 'furnace' | 'tansu' | null; focus: string | null };
  /** 作業 3c（#417。§3.4・§12.0）: その 所で 鳴った 場所の ある 音の 大きさを 決める プレイヤー（近い方）と その 距離（マス）。2P が いない ときは いつも who 1。同じ 距離なら 1 */
  hearFrom(pos: DuoVec3): { who: 1 | 2; distance: number };
}

/** 2P の セーブ（`meta.p2`。§6）。場所・向き・ハートは 入れない */
export interface P2Save {
  /** 持ち物（`Inventory.serialize()` の 形） */
  inventory: unknown;
  /** 1P の `level` と 同じ 形 */
  level: { level: number; xp: number };
  /** 2P の そうび（COOP-1 4b。1P の `armor` と 同じ 形。ない 保存〔前の 版〕は はだか） */
  armor?: unknown;
}

/**
 * 2P が いなくなる わけ（§2.2・§2.6・§10）。
 * 'import'（作業 3d・AC72。おとなの「よみこむ」）だけは **保存しない**（今の 2P の 持ち物を 書かない）。ほかは 保存してから いなくなる。
 */
export type DuoLeaveReason = 'quit' | 'padLost' | 'newGame' | 'otherWorld' | 'reload' | 'import';
