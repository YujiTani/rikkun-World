// HOUSE-1B エディターの 数と 表を 1 か所に まとめる（ルール #304）。DOM・three なし。
// 仕様 docs/design/HOUSE-1.md の §4.1（大きさ）・§4.2（窓と 戸）・§2.6（名前）・§4.9（エディターの 数）。
// 家具の 大きさ・材料は furniture.ts、見本（3D）の 数は house/preview/tuning.ts、画面の 数は ui/houseEditor/tuning.ts。

export type Wall = 'front' | 'right' | 'back' | 'left';
export type Size = 5 | 7 | 9;
export type Rot = 0 | 1 | 2 | 3;
export type Step = 'soto' | 'naka' | 'namae';
/** すすみの 順（① そと → ② なか → ③ なまえ） */
export const STEPS: readonly Step[] = ['soto', 'naka', 'namae'];

/** 中の 床の よこ・たて（マス）。奇数だけ（戸と 天井の ちょうちんを まん中に 置く ため）。はじめは よこ 5・たて 5 */
export const SIZES: readonly Size[] = [5, 7, 9];
export const SIZE_DEFAULT: Size = 5;

/**
 * 窓の しゅるい・屋根の しゅるい（ボタンの ならび）。いまは 1 つずつ（しょうじ・たいら）。2 版で レシピで ふえる ので、
 * 足す ときは ここと 下の 名前の 表（Record なので 足し忘れると 型で 落ちる）だけ。ボタンは ふえても ならんで 折りかえす。
 */
export type WindowKind = 'shoji';
export type RoofKind = 'flat';
export const WINDOW_KINDS: readonly WindowKind[] = ['shoji'];
export const ROOF_KINDS: readonly RoofKind[] = ['flat'];
export const WINDOW_KIND_LABEL: Readonly<Record<WindowKind, string>> = { shoji: 'しょうじ' };
export const ROOF_LABEL: Readonly<Record<RoofKind, string>> = { flat: 'たいら' };
export const WINDOW_KIND_DEFAULT: WindowKind = 'shoji';
export const ROOF_DEFAULT: RoofKind = 'flat';
/** あかり（家に 1 つ。いまは ちょうちん だけ。はずせない） */
export type LightKind = 'lantern';
export const LIGHT_DEFAULT: LightKind = 'lantern';

/** かべの ならび（内部の 順） */
export const WALLS: readonly Wall[] = ['front', 'right', 'back', 'left'];
/** 戸の 壁（まえ 固定。yuzu 2026-10-30 17:02）。戸の 向きを えらぶ 画面は ない */
export const DOOR_WALL: Wall = 'front';
export const OPPOSITE: Readonly<Record<Wall, Wall>> = { front: 'back', back: 'front', right: 'left', left: 'right' };

/** 家の 高さ（ブロックの 段）。床 1 ＋ 中 3 ＋ 屋根 1 ＝ 5（新 3）。窓は 中の 2 段目、戸は 中の 1〜2 段目 */
export const HEIGHT = { floor: 1, inner: 3, roof: 1, windowLevel: 2, doorLevels: 2 } as const;
/** やねの 段（y）。かべは y 1〜3、やねは y=4（上の 面 y=5）。窓の 段・戸の いちばん 上の 段も ここから 出す */
export const ROOF_Y = HEIGHT.floor + HEIGHT.inner;
export const WINDOW_Y = HEIGHT.floor + HEIGHT.windowLevel - 1;
export const DOOR_TOP_Y = HEIGHT.floor + HEIGHT.doorLevels - 1;

/**
 * 建築の 長さ（仕様 §4.1。1 ステップ ＝ 1/60 秒）＝ base ＋ perCell × (よこ ＋ たて − baseSum)。5×5 で 9,000（2 分 30 秒）、9×9 で 16,200（4 分 30 秒）。
 * 式は model.ts の houseBuildTicks 1 か所
 */
export const BUILD_TICKS = { base: 9000, perCell: 900, baseSum: 10 } as const;

/** 窓 1 こに かみ 1 まい（しょうじ。§4.1） */
export const PAPER_PER_WINDOW = 1;

/** 名前（§2.6）: 前の 文字は 8 字まで。後ろの 文字は 5 つから 1 つ（はじめは「のいえ」） */
export const NAME_FRONT_MAX = 8;
export const SUFFIXES: readonly string[] = ['のいえ', 'ハウス', 'のおうち', 'ひみつきち', 'のやしき'];
export const SUFFIX_DEFAULT = 'のいえ';

/**
 * エディターの ふきだしが 出ている 長さ（コマ ＝ 1/60 秒）＝ baseFrames ＋ 1 字ごとに perCharFrames（字は 空白を のぞいて 数える）。
 * つぎに 何か 押したら（ボタン・キー・方眼）すぐ 消える。3 秒 ＋ 1 字 0.2 秒（いちばん 長い 35 字で 600 コマ ＝ 10 秒。§4.9）
 */
export const BUBBLE = { baseFrames: 180, perCharFrames: 12 } as const;

/** 「ひつような もの」の 材料の 並び（§3.2。き・いし・かみ・ぬの・いと・てつの かたまり・くさ・たいまつ・あぶら・ねんど〔2.4: はにわ〕。10 しゅるい） */
export const MATERIAL_ORDER = ['log', 'stone', 'paper', 'cloth', 'string', 'iron_ingot', 'grass', 'torch', 'oil', 'clay'] as const;

/** ふきだしの 文（ぜんぶ ひらがな・カタカナ。仕様 §3 の 表） */
export const MSG = {
  futon: 'ふとんが ないと ねられないよ',
  name: 'なまえを つけてね',
  paper: 'かみが ないと かけないよ。かみは からかさや ちょうちんの ようかいが おとすよ',
  fude: 'ふでが ないと かけないよ。ふでは すみ と たけ で つくれるよ',
  full: 'もちものが いっぱい だよ',
  light: 'あかりは ひとつ ひつようだよ',
  tidy: 'はいらない かぐを かたづけたよ',
  /** 赤い 家具が ある まま つぎへ（② → ③）・できた！を 押した（1E。仕様 §2.5・AC13f） */
  fixRed: 'あかい かぐを なおしてね',
  /** 名前に よくない ことばが ある（§2.6。新 21。yuzu 17:07 の 文） */
  ngWord: 'その ことばは おなまえに いれたら だめだよ',
} as const;

/** 確かめの まどの ことば（2 行）。キーは editor().confirm と 同じ */
export const CONFIRM_TEXT = {
  futonOnly: ['ふとん だけ で いい？', 'ほかの かぐも おけるよ'],
  reset: ['いまの かたちを', 'ぜんぶ けす？'],
} as const;
