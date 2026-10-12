import type { SoundFx, Tone } from './sound';

/** 上がっていく音の列（step 秒ごと） */
function ascending(freqs: readonly number[], step: number, dur: number, gain: number, start = 0): Tone[] {
  return freqs.map((f, i) => ({ type: 'sine', f0: f, f1: f * 1.02, delay: start + i * step, dur, gain }));
}

/** めずらしさの チャイム: ★ の数だけ（n 音）。「トントン ぽん！」のあと 0.4 秒から */
function chimeTones(n: number): Tone[] {
  return ascending([1047, 1319, 1568, 2093].slice(0, n), 0.1, 0.16, 0.3, 0.4);
}

/**
 * M4 の音（M4 §3）。コードで作る短い音。大きい音・こわい音は使わない。
 * 武器の振りの音（シュッ・ブォン・ギギ・ビュン）は、道具の担当（B）の出来事から鳴らす。
 */
export const CRAFT_SOUNDS = {
  /** つくった「トントン ぽん！」 */
  craft: [
    { type: 'triangle', f0: 220, f1: 150, delay: 0, dur: 0.05, gain: 0.5 },
    { type: 'triangle', f0: 230, f1: 160, delay: 0.09, dur: 0.05, gain: 0.5 },
    { type: 'sine', f0: 600, f1: 1100, delay: 0.19, dur: 0.14, gain: 0.6 },
    { type: 'sine', f0: 1500, f1: 1800, delay: 0.24, dur: 0.12, gain: 0.25 },
  ],
  /** つくれない「ぷぷ」 */
  craftFail: [
    { type: 'sine', f0: 300, f1: 240, delay: 0, dur: 0.07, gain: 0.4 },
    { type: 'sine', f0: 300, f1: 240, delay: 0.1, dur: 0.07, gain: 0.4 },
  ],
  /** やく を押した「ボッ」 */
  bakeStart: [
    { type: 'sine', f0: 110, f1: 260, delay: 0, dur: 0.14, gain: 0.55 },
    { type: 'triangle', f0: 400, f1: 700, delay: 0.02, dur: 0.08, gain: 0.15 },
  ],
  /** 焼いているあいだ「パチパチ」（小さく） */
  crackle: [
    { type: 'square', f0: 2200, f1: 900, delay: 0, dur: 0.02, gain: 0.07 },
    { type: 'square', f0: 1700, f1: 700, delay: 0.035, dur: 0.02, gain: 0.05 },
  ],
  /** 焼けた「ぽん」 */
  bakeDone: [
    { type: 'sine', f0: 500, f1: 900, delay: 0, dur: 0.1, gain: 0.6 },
    { type: 'sine', f0: 1200, f1: 1400, delay: 0.06, dur: 0.1, gain: 0.25 },
  ],
  /** かたな類「シュッ」 */
  slash: [{ type: 'triangle', f0: 1400, f1: 500, delay: 0, dur: 0.08, gain: 0.22 }],
  /** なぎなた「ブォン」 */
  naginata: [{ type: 'triangle', f0: 320, f1: 150, delay: 0, dur: 0.16, gain: 0.35 }],
  /** ゆみ を引く「ギギ」 */
  bowDraw: [
    { type: 'square', f0: 180, f1: 240, delay: 0, dur: 0.06, gain: 0.1 },
    { type: 'square', f0: 200, f1: 270, delay: 0.08, dur: 0.06, gain: 0.1 },
  ],
  /** ゆみ をはなす「ビュン」 */
  bowRelease: [{ type: 'sine', f0: 900, f1: 260, delay: 0, dur: 0.12, gain: 0.4 }],
  /** や がブロックに当たる「コツン」 */
  arrowThud: [{ type: 'triangle', f0: 360, f1: 220, delay: 0, dur: 0.05, gain: 0.4 }],
  /** や が無い「カチン」 */
  noArrow: [
    { type: 'square', f0: 1300, f1: 1200, delay: 0, dur: 0.04, gain: 0.2 },
    { type: 'triangle', f0: 1800, f1: 1700, delay: 0, dur: 0.05, gain: 0.15 },
  ],
  /** きらきらの かたな「キラン」 */
  sparkle: [
    { type: 'sine', f0: 1760, f1: 1900, delay: 0, dur: 0.1, gain: 0.3 },
    { type: 'sine', f0: 2349, f1: 2500, delay: 0.07, dur: 0.16, gain: 0.3 },
  ],
  /** 着た「カシャ」 */
  equip: [
    { type: 'square', f0: 1200, f1: 700, delay: 0, dur: 0.04, gain: 0.18 },
    { type: 'triangle', f0: 800, f1: 500, delay: 0.05, dur: 0.07, gain: 0.3 },
  ],
  /** ふせいだ「カキン！」 */
  guard: [
    { type: 'square', f0: 2000, f1: 1900, delay: 0, dur: 0.05, gain: 0.25 },
    { type: 'triangle', f0: 3000, f1: 2800, delay: 0, dur: 0.12, gain: 0.22 },
    { type: 'sine', f0: 1500, f1: 1450, delay: 0.02, dur: 0.18, gain: 0.2 },
  ],
  /** ばんざい「わーい」風の明るい音 */
  banzai: [
    { type: 'sine', f0: 523, f1: 587, delay: 0, dur: 0.1, gain: 0.35 },
    { type: 'sine', f0: 659, f1: 740, delay: 0.1, dur: 0.1, gain: 0.35 },
    { type: 'sine', f0: 784, f1: 880, delay: 0.2, dur: 0.2, gain: 0.35 },
  ],
  /** 案内画面のタブ「ポン」 */
  tab: [{ type: 'sine', f0: 520, f1: 700, delay: 0, dur: 0.08, gain: 0.45 }],
  // ---- M6（仕様 §2.4・§3）。音の大きさは M4 のレベルアップの音いか ----
  /** めずらしさの チャイム（★ の数だけ 上がっていく。1〜4 音。「トントン ぽん！」のあとに鳴らす） */
  chime1: chimeTones(1),
  chime2: chimeTones(2),
  chime3: chimeTones(3),
  chime4: chimeTones(4),
  /** 横断幕で 回っているあいだ「シャララ」（上がっていく） */
  bannerSpin: ascending([784, 988, 1175, 1319, 1568, 1760, 1976, 2349], 0.045, 0.1, 0.16),
  /** 横断幕「パ パ パ パーン！」（4 音、さいごが長い。1.2 秒） */
  fanfare: [
    { type: 'triangle', f0: 523, f1: 523, delay: 0, dur: 0.14, gain: 0.4 },
    { type: 'triangle', f0: 659, f1: 659, delay: 0.2, dur: 0.14, gain: 0.4 },
    { type: 'triangle', f0: 784, f1: 784, delay: 0.4, dur: 0.14, gain: 0.4 },
    { type: 'triangle', f0: 1047, f1: 1047, delay: 0.6, dur: 0.6, gain: 0.45 },
    { type: 'sine', f0: 2093, f1: 2093, delay: 0.6, dur: 0.5, gain: 0.12 },
  ],
  /** おめでとう画面「タタタ ターン♪」（横断幕とは べつのふし。1.5 秒） */
  modal: [
    { type: 'triangle', f0: 392, f1: 392, delay: 0, dur: 0.1, gain: 0.4 },
    { type: 'triangle', f0: 392, f1: 392, delay: 0.14, dur: 0.1, gain: 0.4 },
    { type: 'triangle', f0: 392, f1: 392, delay: 0.28, dur: 0.1, gain: 0.4 },
    { type: 'triangle', f0: 523, f1: 523, delay: 0.5, dur: 0.9, gain: 0.45 },
    { type: 'triangle', f0: 659, f1: 659, delay: 0.5, dur: 0.9, gain: 0.3 },
    { type: 'triangle', f0: 784, f1: 784, delay: 0.5, dur: 0.9, gain: 0.25 },
  ],
  /** きん・にじ の主役のとき さいごに「キラキラ」 */
  modalSparkle: ascending([2093, 2637, 3136, 2637, 3136, 4186], 0.08, 0.12, 0.14, 1.0),
  /** メダルの印「ポン」 */
  badge: [
    { type: 'sine', f0: 600, f1: 900, delay: 0, dur: 0.09, gain: 0.4 },
    { type: 'sine', f0: 1200, f1: 1300, delay: 0.05, dur: 0.08, gain: 0.15 },
  ],
  /** とじる が押せるようになった「ピコ」 */
  closeReady: [
    { type: 'sine', f0: 880, f1: 880, delay: 0, dur: 0.06, gain: 0.4 },
    { type: 'sine', f0: 1320, f1: 1320, delay: 0.07, dur: 0.1, gain: 0.4 },
  ],
} as const satisfies Record<string, readonly Tone[]>;

export type CraftSoundName = keyof typeof CRAFT_SOUNDS;

export function playCraft(sound: Pick<SoundFx, 'playTones'>, name: CraftSoundName, semitones = 0): void {
  sound.playTones(CRAFT_SOUNDS[name] as readonly Tone[], semitones);
}

/** 作る画面の音の名前（`craft.sounds()` 用） */
export const CRAFT_M6_SOUND_NAMES = ['craft', 'chime1', 'chime2', 'chime3', 'chime4', 'bannerSpin', 'fanfare'] as const;
