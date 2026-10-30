// HOUSE-1B エディターの 画面の 数を 1 か所に（ルール #304）。仕様 docs/design/HOUSE-1.md §3.2。
// 見本（3D）の 数は house/preview/tuning.ts、エディターの 決まり（名前の 長さ・ふきだしの 時間）は house/editor/tuning.ts。

/**
 * 画面の 帯の 高さ（px）: 上 ＝ タイトルと すすみ（96）、見出しの 行（40）、下 ＝ ボタン（64 ＋ 上下 8 ＝ 80）。
 * まん中の 高さ ＝ 画面の 高さ − 216（§3.2）
 */
export const BAR = { top: 96, lead: 40, bottom: 80 } as const;
/** 方眼の かべの 帯の はば（px） */
export const BAND_PX = 16;
/** 方眼の マスの いちばん 小さい 大きさ（px。UI 検査の きまり） */
export const CELL_MIN_PX = 48;

/**
 * 家具の そばに 出る ボタン（［とる］［↻］［↺］）の 大きさ（px）。ボタンの あいだ 8・ふち 2・内がわの あき 4。
 * gap ＝ 家具との すきま（4。しっぽの 先が 家具に すこし かかる）。
 * ［とる］88×56、まわす 2 つは 56×56（アイコン だけ）。よこ ＝ 4＋88＋8＋56＋8＋56＋4 ＋ ふち 4 ＝ 228、たて ＝ 56 ＋ 8 ＋ ふち 4 ＝ 68
 */
export const CLUSTER = { w: 228, h: 68, gap: 4 } as const;

/**
 * ボタンを 押した ときの 小さな 木の 音（ゲームの SoundFx。`wood(はじめの Hz, おわりの Hz, 0, 長さ 秒, 音の 大きさ)`）。
 * 続けても 大きく しない（大きさは 同じ。高さだけ pitch の 半音 ずつ 順に ずらす）。ぴょこんは CSS の .is-boing。
 */
export const PRESS_SOUND = {
  /** えらぶ・ふやす・つぎへ など ふつうの ボタン・方眼の マス */
  press: { f0: 600, f1: 480, sec: 0.06, gain: 0.1 },
  /** とる（少し 低く 長め） */
  take: { f0: 420, f1: 300, sec: 0.08, gain: 0.1 },
  /** まわす（少し 高く 短め） */
  turn: { f0: 760, f1: 600, sec: 0.05, gain: 0.09 },
} as const;
/** 毎回 ずらす 高さ（半音。決まった 順で まわる） */
export const PRESS_PITCH: readonly number[] = [0, 2, -2, 1, -1];
