// HOUSE-1B 試作（?proto=editor。本実装ではない）: エディターの 数と 表を 1 か所に まとめる。
// 仕様 docs/design/HOUSE-1.md の §4.1（大きさ・材料）・§4.2（窓と 戸）・§4.3（家具）・§4.9（エディターの 数）。

export type Wall = 'front' | 'right' | 'back' | 'left';
export type Size = 5 | 7 | 9;
export type Rot = 0 | 1 | 2 | 3;
export type Step = 'soto' | 'naka' | 'namae';
export type FurnKind = 'futon' | 'chair' | 'table' | 'andon' | 'shelf' | 'ofuro' | 'kotatsu' | 'tansu' | 'furnace';

/** 中の 床の よこ・たて（マス）。奇数だけ（戸と 天井の ちょうちんを まん中に 置く ため） */
export const SIZES: readonly Size[] = [5, 7, 9];
/** 戸の 壁の ならび（画面の 順ではなく 内部の 順） */
export const WALLS: readonly Wall[] = ['front', 'right', 'back', 'left'];
export const WALL_LABEL: Readonly<Record<Wall, string>> = { front: 'まえ', right: 'みぎ', back: 'うしろ', left: 'ひだり' };
export const OPPOSITE: Readonly<Record<Wall, Wall>> = { front: 'back', back: 'front', right: 'left', left: 'right' };

/** 家の 高さ（ブロックの 段）。床 1 ＋ 中 3 ＋ 屋根 1 ＝ 5（新 3）。窓は 中の 2 段目、戸は 中の 1〜2 段目 */
export const HEIGHT = { floor: 1, inner: 3, roof: 1, windowLevel: 2, doorLevels: 2 } as const;
/** やねの 段（y）。かべは y 1〜3、やねは y=4（上の 面 y=5）。窓の 段・戸の いちばん 上の 段も ここから 出す */
export const ROOF_Y = HEIGHT.floor + HEIGHT.inner;
export const WINDOW_Y = HEIGHT.floor + HEIGHT.windowLevel - 1;
export const DOOR_TOP_Y = HEIGHT.floor + HEIGHT.doorLevels - 1;

/** 家具の 種類の 名前（コードで 比べる ときは 文字を 直書きせず ここから 読む。#304） */
export const K_FUTON = 'futon' satisfies FurnKind;
export const K_KOTATSU = 'kotatsu' satisfies FurnKind;
export const K_LANTERN = 'lantern';

/** 家具 9 種（一覧の 並び = 画面の ボタンの 並び 5＋4）。大きさは まわす 前の よこ×たて（マス）。材料は 1 こ ぶん（item id, 数） */
export const FURN_ORDER: readonly FurnKind[] = ['futon', 'chair', 'table', 'andon', 'shelf', 'ofuro', 'kotatsu', 'tansu', 'furnace'];
export interface FurnDef {
  name: string;
  cells: readonly [number, number];
  mats: ReadonlyArray<readonly [string, number]>;
}
export const FURNITURE: Readonly<Record<FurnKind, FurnDef>> = {
  futon: { name: 'ふとん', cells: [1, 2], mats: [['cloth', 3], ['string', 1]] },
  chair: { name: 'いす', cells: [1, 1], mats: [['log', 2]] },
  table: { name: 'テーブル', cells: [2, 1], mats: [['log', 4]] },
  andon: { name: 'あんどん', cells: [1, 1], mats: [['paper', 2], ['log', 1], ['oil', 1]] },
  shelf: { name: 'ほんだな', cells: [1, 1], mats: [['log', 6], ['paper', 3]] },
  ofuro: { name: 'おふろ', cells: [2, 1], mats: [['stone', 6], ['log', 4]] },
  kotatsu: { name: 'こたつ', cells: [2, 2], mats: [['grass', 3], ['log', 2], ['torch', 1]] },
  tansu: { name: 'たんす', cells: [1, 1], mats: [['log', 8], ['iron_ingot', 2]] },
  furnace: { name: 'かまど', cells: [1, 1], mats: [['stone', 5]] },
};

/** 「ひつような もの」の 並び（§3.2）と、窓 1 こに かみ 1 */
export const MATERIAL_ORDER: readonly string[] = ['log', 'stone', 'paper', 'cloth', 'string', 'iron_ingot', 'grass', 'torch', 'oil'];
export const PAPER_PER_WINDOW = 1;
/** くらの 中身（試作の 仮の 数。AC9 の 例: き 10・いし 25） */
export const KURA_DEMO: Readonly<Record<string, number>> = { log: 10, stone: 25, paper: 3, cloth: 0, string: 1, iron_ingot: 0, grass: 20, torch: 2, oil: 0 };

/** 名前（§2.6）: 前の 文字は 8 字まで。後ろの 文字は 5 つから 1 つ（はじめは「のいえ」） */
export const NAME_FRONT_MAX = 8;
export const SUFFIXES: readonly string[] = ['のいえ', 'ハウス', 'のおうち', 'ひみつきち', 'のやしき'];
export const SUFFIX_DEFAULT = 'のいえ';

/** エディターの ふきだしが 出ている 時間（ミリ秒。3 秒 ＝ 180 コマ） */
export const BUBBLE_MS = 3000;

/** 見本（§4.9。アートが 試作で 決めて よい 数） */
export const PREVIEW = {
  /** 回る 速さ: 1 周 20 秒 ＝ 描く コマ（60/秒）で 1,200 コマ */
  lapFrames: 1200,
  /** 見下ろす 角度（度）。そと ＝ 低め（戸と 窓が 見える）、なか ＝ ななめ 50° */
  outsideElevDeg: 26,
  insideElevDeg: 50,
  /** カメラの 視野角（度）。小さめ ＝ ゆがみが 少ない */
  fovDeg: 30,
  /** 地面の 板が 家の 外まわりより 広い マス（そと ＝ 広め、なか ＝ へりだけ） */
  groundMargin: { outside: 2, inside: 0 },
  /** 大きさが まだ 決まって いない ときの 地面の 広さ（中の 床の マス。9×9 の 家と 同じ） */
  groundOnlyCells: 9,
  /** 動きを へらす 設定の とき 止める 向き（度。戸の 壁から 見て ななめ 前） */
  stillYawDeg: 28,
  /** 画面に 入れる 余白（1 ＝ ぴったり） */
  fitMargin: 1.06,
  /** なかの 見本で、カメラに 近い かべが さがりはじめる・きえる 向き（かべの 外向きと カメラの 向きの 内積） */
  wallDropFrom: 0.1,
  wallDropTo: 0.45,
} as const;

/** 画面の 帯（§3.2）: 上 ＝ 64＋上下 16、下 ＝ 120。まん中の 高さ ＝ 画面の 高さ − 216 */
export const BAR = { top: 96, bottom: 120 } as const;
/** 方眼の かべの 帯の はば（px） */
export const BAND_PX = 16;

/** 家具の 絵（ボタン・方眼の 家具・置く 前の ゴースト）の 数 */
export const FURN_ART = {
  /** 上から 見た 絵: 1 マスあたり px（方眼の マスは 48〜70 px なので 縮めて 使う） */
  topPxPerCell: 64,
  /** ボタン用の ななめ絵の 大きさ（px の 正方形） */
  isoPx: 128,
  /** ゴースト（置く 前の 家具）: 置ける ＝ 白、置けない ＝ 赤。色は RGB、まぜる 量は 0〜1。ふちの 太さは px */
  ghostOk: [255, 255, 255],
  ghostOkMix: 0.78,
  ghostNg: [255, 77, 85],
  ghostNgMix: 0.7,
  ghostRimPx: 3,
} as const;

/** しょうじ・戸の 板（案 C しあげ）。ブロックの 外がわの 面から 内がわへの きょり（1 ＝ ブロック 1 つ ぶん） */
export const OPENING = {
  /** 戸: 外がわの 面に そろえた あつさ 4/16 の 板 1 まい */
  doorThick: 0.25,
  /** しょうじ: あつみの まん中（外がわの 面から 0.5）に ある うすい 紙の 板 */
  shojiAt: 0.5,
  shojiThick: 1 / 16,
} as const;
