import type { SoundFx, Tone } from './sound';

/**
 * M7（農業）の音（仕様 §3.6）。コードで作る短い音。大きい音・こわい音は使わない。
 * 段階が変わった音は無い（どこでも鳴ると うるさいため）。
 */
const chime = (freqs: readonly number[], start: number): Tone[] =>
  freqs.map((f, i) => ({ type: 'sine', f0: f, f1: f * 1.02, delay: start + i * 0.1, dur: 0.14, gain: 0.28 }));

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
} as const satisfies Record<string, readonly Tone[]>;

export type FarmSoundName = keyof typeof FARM_SOUNDS;

export function playFarm(sound: Pick<SoundFx, 'playTones'>, name: FarmSoundName): void {
  sound.playTones(FARM_SOUNDS[name] as readonly Tone[]);
}
