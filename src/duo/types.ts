/**
 * COOP-1（docs/design/COOP-1.md）の 型の 約束。作業 1〜2 で 使う 型を ここに 1 か所で 置く。
 * これは 型だけ（実行する コードを 持たない）。実装（developer）は この 型を そのまま 使う。変えるときは テストも 直す。
 */

/** 距離メーター・ルーペの 色の 段（§9.2）。0 = ふつう・1 = 1 段目・2 = 2 段目 */
export type DuoTier = 0 | 1 | 2;

/** 画面の ようす（§2.3）。作業 1 では 'one' だけ 使う */
export type DuoView = 'one' | 'loupe' | 'split';

/** `window.__rikkun.duo.state()` の 形（§12.0） */
export interface DuoState {
  joined: boolean;
  view: DuoView;
  tier: DuoTier;
  distance: number;
  meter: number;
  loupe: { x: number; y: number; d: number } | null;
  rings: 1 | 2;
  columns: number;
  light: boolean;
  padLost: boolean;
}

export interface DuoVec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * `duo.viewports()` が 返す、いま 描いている 画面の 区画(作業 2。AC25・AC26)。CSS px(画面の 左上が 0,0)。
 * 'one' = [1P の 全面]、'loupe' = [1P の 全面, 2P の ルーペ(外接の 四角)]、'split' = [1P の 左半分, 2P の 右半分]。
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
 * 〔約束〕`__rikkun.duo` は ふつうの URL でも いつも ある(`?.` は 要らない)。`join()` と `place()` だけ `?duo=dev` の ときしか 効かない。
 * 〔約束〕2P の「コントローラーを つないでね」は data-testid="duo-pad-lost"(padLost の あいだ だけ 見える)。
 * `join()` と `place()` は `?duo=dev` の ときだけ 使える（作業 3 まで。§8）。
 */
export interface DuoHook {
  join(): boolean;
  place(who: 1 | 2, pos: DuoVec3): void;
  state(): DuoState;
  /** 2P が いないとき who=2 は null(仕様 §12.0) */
  pos(who: 1 | 2): DuoVec3 | null;
  leave(): void;
  /** Game に 渡している 時間の 倍率(AC11。2 人のとき もちもの画面でも 1) */
  timeScale(): number;
  /** いま 描いている 区画(作業 2。AC25・AC26。型は DuoViewport) */
  viewports(): DuoViewport[];
}

/** 2P の セーブ（`meta.p2`。§6）。場所・向き・ハートは 入れない */
export interface P2Save {
  /** 持ち物（`Inventory.serialize()` の 形） */
  inventory: unknown;
  /** 1P の `level` と 同じ 形 */
  level: { level: number; xp: number };
}

/** 2P が いなくなる わけ（§2.2・§2.6・§10） */
export type DuoLeaveReason = 'quit' | 'padLost' | 'newGame' | 'otherWorld' | 'reload';
