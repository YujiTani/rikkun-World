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
 * `window.__rikkun.duo`（§12.0）。
 * 〔tester が 足した 口〕`pos(who)` = 1P・2P の 足もとの 位置。E2E で「だれが 動いたか」を 聞くのに 要る。
 * 〔tester が 足した 口〕`leave()` = 2P を「やめる」と 同じに いなくする（理由 'quit'。持ち物は 保存される）。AC14 の「参加して やめたあと」で 使う。
 * どちらも 仕様 §12.0 の 表に 足してほしい（designer へ）。
 * `join()` と `place()` は `?duo=dev` の ときだけ 使える（作業 3 まで。§8）。
 */
export interface DuoHook {
  join(): boolean;
  place(who: 1 | 2, pos: DuoVec3): void;
  state(): DuoState;
  pos(who: 1 | 2): DuoVec3;
  leave(): void;
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
