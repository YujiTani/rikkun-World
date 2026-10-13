import type { SoundFx, Tone } from './sound';

/**
 * M7（農業）の音（仕様 §3.6）。コードで作る短い音。大きい音・こわい音は使わない。
 * 段階が変わった音は無い（どこでも鳴ると うるさいため）。
 */
const chime = (freqs: readonly number[], start: number): Tone[] =>
  freqs.map((f, i) => ({ type: 'sine', f0: f, f1: f * 1.02, delay: start + i * 0.1, dur: 0.14, gain: 0.28 }));

/** 「シャーッ」: 高い 小さな 音 を ずらして ならべる（ノイズ の かわり。やさしく） */
function shower(sec: number): Tone[] {
  const out: Tone[] = [];
  const n = Math.round(sec / 0.04);
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, (n - i) / 4);
    out.push({ type: 'square', f0: 3600 + ((i * 7) % 5) * 260, f1: 3000 + ((i * 3) % 4) * 300, delay: i * 0.04, dur: 0.05, gain: 0.05 * fade });
  }
  return out;
}

export const FARM_SOUNDS = {
  /** たがやす（3 回目 / くわ）「ザクッ」（ひくめの ノイズ 0.15 秒） */
  till: [
    { type: 'square', f0: 150, f1: 60, delay: 0, dur: 0.15, gain: 0.3 },
    { type: 'triangle', f0: 90, f1: 55, delay: 0.02, dur: 0.13, gain: 0.35 },
  ],
  /** すで の 1・2 回目 小さい「ザッ」 */
  tillPress: [{ type: 'square', f0: 170, f1: 90, delay: 0, dur: 0.07, gain: 0.12 }],
  /** まく「ポコッ」（高め 1 音） */
  plant: [{ type: 'sine', f0: 520, f1: 760, delay: 0, dur: 0.09, gain: 0.5 }],
  /** しゅうかく「ポン！」＋ 小さなチャイム 2 音 */
  harvest: [{ type: 'sine', f0: 500, f1: 900, delay: 0, dur: 0.1, gain: 0.6 }, ...chime([1047, 1319], 0.12)],
  /** やせいの やさい「ポン！」＋ チャイム 3 音 */
  wild: [{ type: 'sine', f0: 500, f1: 900, delay: 0, dur: 0.1, gain: 0.6 }, ...chime([1047, 1319, 1568], 0.12)],
  /** まだ「ぷるん」（やわらかい 低め 1 音） */
  notRipe: [{ type: 'sine', f0: 240, f1: 190, delay: 0, dur: 0.16, gain: 0.4 }],
  /** たね が出た 小さな「チリン」（拾った音のあとに） */
  seedFound: [
    { type: 'sine', f0: 2349, f1: 2400, delay: 0.1, dur: 0.14, gain: 0.25 },
    { type: 'sine', f0: 3136, f1: 3200, delay: 0.16, dur: 0.12, gain: 0.15 },
  ],
  /** たべる「もぐもぐ」（2 回の 短い音） */
  eat: [
    { type: 'triangle', f0: 260, f1: 180, delay: 0, dur: 0.07, gain: 0.4 },
    { type: 'triangle', f0: 280, f1: 190, delay: 0.14, dur: 0.07, gain: 0.4 },
  ],
  // ---- M7-2（§3.6）。ノイズ は 作れない ので 高い 短い 音 を 重ねて 「シャーッ」にする
  /** くむ「ゴボゴボ」（低めの あわ 3 回、0.3 秒） */
  fill: [
    { type: 'sine', f0: 150, f1: 240, delay: 0, dur: 0.08, gain: 0.4 },
    { type: 'sine', f0: 170, f1: 270, delay: 0.1, dur: 0.08, gain: 0.4 },
    { type: 'sine', f0: 190, f1: 300, delay: 0.2, dur: 0.1, gain: 0.4 },
  ],
  /** まんたん で くむ 小さな「ちゃぷん」 */
  fullCan: [
    { type: 'sine', f0: 520, f1: 300, delay: 0, dur: 0.08, gain: 0.2 },
    { type: 'sine', f0: 380, f1: 260, delay: 0.07, dur: 0.06, gain: 0.12 },
  ],
  /** まく「シャーッ」（やさしい 0.4 秒） */
  pour: shower(0.4),
  /** からっぽ（4c）軽い「コン」 */
  empty: [{ type: 'triangle', f0: 330, f1: 250, delay: 0, dur: 0.07, gain: 0.35 }],
  /** スプリンクラー を 置く「シャーッ」（まく より 少し 長い 0.6 秒） */
  sprinklerPlace: shower(0.6),
  /** なでる（ごきげん に なった）「ふわっ♪」（やさしい 2 音、上がる） */
  pet: [
    { type: 'sine', f0: 660, f1: 700, delay: 0, dur: 0.12, gain: 0.3 },
    { type: 'sine', f0: 880, f1: 930, delay: 0.1, dur: 0.18, gain: 0.3 },
  ],
  /** なでる（ごきげん の あいだ・やせい）「ふわっ」1 音 */
  petAgain: [{ type: 'sine', f0: 660, f1: 700, delay: 0, dur: 0.14, gain: 0.25 }],
} as const satisfies Record<string, readonly Tone[]>;

export type FarmSoundName = keyof typeof FARM_SOUNDS;

export function playFarm(sound: Pick<SoundFx, 'playTones'>, name: FarmSoundName): void {
  sound.playTones(FARM_SOUNDS[name] as readonly Tone[]);
}
