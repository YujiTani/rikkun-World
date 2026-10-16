import { box, hz, noise, powan, sine, wood, zaku } from './sfxVoices';
import type { SoundFx, Tone } from './sound';

/**
 * M7（農業）の音（仕様 §3.6）。コードで作る短い音（案 B）。大きい音・こわい音は使わない。
 * 段階が変わった音は無い（どこでも鳴ると うるさいため）。
 */
const chime = (notes: readonly string[], start: number): Tone[] =>
  notes.flatMap((n, i) => box(hz(n), hz(n) * 1.02, start + i * 0.1, 0.14, 0.28));

/** 「シャーッ」: 角を丸めたノイズ（やさしく。sec 秒） */
function shower(sec: number): Tone[] {
  return [
    noise(0, sec, 0.14, { type: 'bandpass', freq: 3600, freq1: 2400, q: 0.5 }, 0.06),
    noise(0, sec, 0.06, { type: 'highpass', freq: 5500, q: 0.5 }, 0.08),
  ];
}

export const FARM_SOUNDS = {
  /** たがやす（3 回目 / くわ）「ザクッ」: 低いノイズ ＋ 低い木 */
  till: zaku(0, 0.15, 0.3),
  /** すで の 1・2 回目 小さい「ザッ」 */
  tillPress: zaku(0, 0.07, 0.1),
  /** まく「ポコッ」: 木 */
  plant: wood(520, 760, 0, 0.09, 0.5),
  /** しゅうかく「ポン！」＋ オルゴール 2 音 */
  harvest: [...wood(500, 900, 0, 0.1, 0.6), ...chime(['C6', 'E6'], 0.12)],
  /** やせいの やさい「ポン！」＋ オルゴール 3 音 */
  wild: [...wood(500, 900, 0, 0.1, 0.6), ...chime(['C6', 'E6', 'G6'], 0.12)],
  /** まだ「ぷるん」: やわらかい低め 1 音（少しゆれる） */
  notRipe: [powan(240, 190, 0, 0.16, 0.25, 0.02), powan(246, 195, 0, 0.16, 0.2, 0.02)],
  /** たね が出た 小さな「チリン」（拾った音のあとに）: オルゴール 2 音 */
  seedFound: [...box(hz('G6'), hz('G6') * 1.02, 0.1, 0.14, 0.25), ...box(hz('C7'), hz('C7') * 1.02, 0.16, 0.12, 0.15)],
  /** たべる「もぐもぐ」: 木の 2 打 */
  eat: [...wood(260, 180, 0, 0.07, 0.4), ...wood(280, 190, 0.14, 0.07, 0.4)],
  /** くむ「ゴボゴボ」: あわ 3 つ ＋ 水のノイズ */
  fill: [
    sine(200, 520, 0, 0.08, 0.4),
    sine(230, 600, 0.1, 0.08, 0.4),
    sine(260, 700, 0.2, 0.1, 0.4),
    noise(0, 0.3, 0.08, { type: 'lowpass', freq: 1500 }, 0.01),
  ],
  /** まんたん で くむ 小さな「ちゃぷん」 */
  fullCan: [sine(520, 300, 0, 0.08, 0.2), sine(380, 260, 0.07, 0.06, 0.12)],
  /** まく「シャーッ」（やさしい 0.4 秒） */
  pour: shower(0.4),
  /** からっぽ 軽い「コン」: 木 */
  empty: wood(330, 250, 0, 0.07, 0.35),
  /** スプリンクラー を 置く「シャーッ」（まく より 少し 長い 0.6 秒） */
  sprinklerPlace: shower(0.6),
  /** なでる（ごきげん に なった）「ふわっ♪」: オルゴール 2 音、上がる */
  pet: [...box(hz('G5'), hz('G5') * 1.05, 0, 0.12, 0.3), ...box(hz('C6'), hz('C6') * 1.05, 0.1, 0.18, 0.3)],
  /** なでる（ごきげん の あいだ・やせい）「ふわっ」1 音 */
  petAgain: [...box(hz('G5'), hz('G5') * 1.05, 0, 0.14, 0.25)],
} as const satisfies Record<string, readonly Tone[]>;

export type FarmSoundName = keyof typeof FARM_SOUNDS;

export function playFarm(sound: Pick<SoundFx, 'playTones'>, name: FarmSoundName): void {
  sound.playTones(FARM_SOUNDS[name] as readonly Tone[]);
}
