import { box, boxRun, hz, mar, noise, powan, shaka, sine, swish, tri, wood, xylo } from './sfxVoices';
import type { SoundFx, Tone } from './sound';

/** めずらしさの チャイム: ★ の数だけ（n 音）。「トントン ぽん！」のあと 0.4 秒から */
function chimeTones(n: number): Tone[] {
  return boxRun([hz('C6'), hz('E6'), hz('G6'), hz('C7')].slice(0, n), 0.1, 0.16, 0.3, 0.4);
}

/**
 * M4 の音（M4 §3）。コードで作る短い音（案 B: 木・オルゴール・木琴・シャカ）。大きい音・こわい音は使わない。
 * 武器の振りの音（シュッ・ブォン・ギギ・ビュン）は、道具の担当（B）の出来事から鳴らす。
 */
export const CRAFT_SOUNDS = {
  /** つくった「トントン ぽん！」: 木の 2 打 ＋ 木琴の ぽん */
  craft: [
    ...wood(220, 150, 0, 0.05, 0.5),
    ...wood(230, 160, 0.09, 0.05, 0.5),
    ...xylo(hz('G5'), hz('C6'), 0.19, 0.16, 0.55),
  ],
  /** つくれない「おしい」: 下がって はずむ（明るい） */
  craftFail: [sine(300, 200, 0, 0.09, 0.35), sine(260, 520, 0.1, 0.14, 0.35), tri(520, 780, 0.1, 0.1, 0.1)],
  /** やく を押した「ボッ」: ノイズ ＋ 低い sine */
  bakeStart: [
    noise(0, 0.14, 0.4, { type: 'lowpass', freq: 400, freq1: 1000, q: 0.7 }, 0.02),
    sine(110, 260, 0, 0.14, 0.45, 0.02),
  ],
  /** 焼いているあいだ「パチパチ」（小さく）: 小さいシャカ */
  crackle: [shaka(0, 0.02, 0.07, 3500), shaka(0.035, 0.02, 0.05, 3000)],
  /** 焼けた「ぽん」: 木琴 */
  bakeDone: [...xylo(hz('C5'), hz('G5'), 0, 0.12, 0.55), ...xylo(hz('C6'), hz('D6'), 0.06, 0.12, 0.22)],
  /** かたな類「シュッ」 */
  slash: [swish(2200, 700, 0, 0.08, 0.22)],
  /** なぎなた「ブォン」 */
  naginata: [swish(800, 280, 0, 0.16, 0.35, 0.8)],
  /** ゆみ を引く「トン・コツ」: 木 */
  bowDraw: [...wood(260, 300, 0, 0.05, 0.18), ...wood(280, 330, 0.08, 0.05, 0.18)],
  /** ゆみ をはなす「ビュン」 */
  bowRelease: [swish(2000, 550, 0, 0.12, 0.35)],
  /** や がブロックに当たる「コツン」 */
  arrowThud: wood(360, 220, 0, 0.05, 0.4),
  /** や が無い「カチ」: 高い木 */
  noArrow: [...wood(1100, 950, 0, 0.045, 0.28), ...wood(1500, 1300, 0, 0.05, 0.12)],
  /** きらめく カタナ「キラン」: オルゴール 2 音 */
  sparkle: [...box(hz('G6'), hz('A6'), 0, 0.1, 0.3, true), ...box(hz('C7'), hz('D7'), 0.07, 0.16, 0.3)],
  /** 着た「カシャ」: 木 ＋ ぽわん */
  equip: [...wood(1000, 650, 0, 0.04, 0.22), powan(500, 800, 0.05, 0.09, 0.3, 0.02)],
  /** ふせいだ「コーン」: 木琴の高い 1 音 ＋ オルゴールの余韻 */
  guard: [...xylo(hz('G6'), hz('G6') * 0.98, 0, 0.1, 0.4), ...box(hz('C7'), hz('C7') * 0.98, 0.02, 0.25, 0.2)],
  /** ばんざい「わーい」: 木琴 3 音（上がる） */
  banzai: [
    ...xylo(hz('C5'), hz('D5'), 0, 0.1, 0.35),
    ...xylo(hz('E5'), hz('F#5'), 0.1, 0.1, 0.35),
    ...xylo(hz('G5'), hz('A5'), 0.2, 0.2, 0.35),
  ],
  /** 案内画面のタブ「ポン」: 小さい木 */
  tab: wood(520, 640, 0, 0.07, 0.4),
  // ---- M6（仕様 §2.4・§3）。音の大きさは M4 のレベルアップの音いか ----
  /** めずらしさの チャイム（★ の数だけ 上がっていく。1〜4 音。「トントン ぽん！」のあとに鳴らす） */
  chime1: chimeTones(1),
  chime2: chimeTones(2),
  chime3: chimeTones(3),
  chime4: chimeTones(4),
  /** 横断幕で 回っているあいだ「シャララ」（上がっていく） */
  bannerSpin: boxRun([hz('G5'), hz('B5'), hz('D6'), hz('E6'), hz('G6'), hz('A6'), hz('B6'), hz('D7')], 0.045, 0.1, 0.16),
  /** 横断幕「パ パ パ パーン！」（4 音、さいごが長い。1.2 秒）: オルゴール ＋ マリンバの和音 */
  fanfare: [
    ...box(hz('C5'), hz('C5'), 0, 0.14, 0.4),
    ...box(hz('E5'), hz('E5'), 0.2, 0.14, 0.4),
    ...box(hz('G5'), hz('G5'), 0.4, 0.14, 0.4),
    ...box(hz('C6'), hz('C6'), 0.6, 0.6, 0.42, true),
    ...mar(hz('C5'), hz('C5'), 0.6, 0.6, 0.35),
    ...mar(hz('E5'), hz('E5'), 0.6, 0.5, 0.2),
    sine(hz('C7'), hz('C7'), 0.6, 0.5, 0.08),
  ],
  /** おめでとう画面「タタタ ターン♪」（横断幕とは べつのふし。1.5 秒） */
  modal: [
    ...xylo(hz('G4'), hz('G4'), 0, 0.1, 0.4),
    ...xylo(hz('G4'), hz('G4'), 0.14, 0.1, 0.4),
    ...xylo(hz('G4'), hz('G4'), 0.28, 0.1, 0.4),
    ...box(hz('C5'), hz('C5'), 0.5, 0.9, 0.4, true),
    ...mar(hz('E5'), hz('E5'), 0.5, 0.8, 0.25),
    ...mar(hz('G5'), hz('G5'), 0.5, 0.7, 0.2),
  ],
  /** きん・にじ の主役のとき さいごに「キラキラ」 */
  modalSparkle: boxRun([hz('C7'), hz('E7'), hz('G7'), hz('E7'), hz('G7'), hz('C8')], 0.08, 0.12, 0.14, 1.0),
  /** メダルの印「ポン」: 木 ＋ オルゴール */
  badge: [...wood(600, 900, 0, 0.09, 0.4), ...box(hz('D6'), hz('E6'), 0.05, 0.1, 0.15)],
  /** とじる が押せるようになった「ピコ」: オルゴール 2 音 */
  closeReady: [...box(hz('G5'), hz('G5'), 0, 0.07, 0.4), ...box(hz('D6'), hz('D6'), 0.07, 0.12, 0.4)],
} as const satisfies Record<string, readonly Tone[]>;

export type CraftSoundName = keyof typeof CRAFT_SOUNDS;

export function playCraft(sound: Pick<SoundFx, 'playTones'>, name: CraftSoundName, semitones = 0): void {
  sound.playTones(CRAFT_SOUNDS[name] as readonly Tone[], semitones);
}

/** 作る画面の音の名前（`craft.sounds()` 用） */
export const CRAFT_M6_SOUND_NAMES = ['craft', 'chime1', 'chime2', 'chime3', 'chime4', 'bannerSpin', 'fanfare'] as const;
