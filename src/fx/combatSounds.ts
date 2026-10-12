import type { SoundFx, Tone } from './sound';

/**
 * M3 の音（M3 §3.7）。コードで作る短い音。大きい音・こわい音は使わない。
 * 妖怪の合図の音（ぐぐっ・どしん など）は妖怪の担当。
 */
export const COMBAT_SOUNDS = {
  /** パンチ「ぶんっ」 */
  punch: [{ type: 'triangle', f0: 260, f1: 140, delay: 0, dur: 0.09, gain: 0.35 }],
  /** 当たった「ぽこっ」 */
  hit: [
    { type: 'sine', f0: 420, f1: 200, delay: 0, dur: 0.1, gain: 0.7 },
    { type: 'triangle', f0: 800, f1: 500, delay: 0, dur: 0.05, gain: 0.25 },
  ],
  /** からぶり「スカッ」 */
  miss: [{ type: 'triangle', f0: 900, f1: 450, delay: 0, dur: 0.07, gain: 0.18 }],
  /** たおした「ポン！」 */
  defeat: [
    { type: 'sine', f0: 300, f1: 900, delay: 0, dur: 0.14, gain: 0.7 },
    { type: 'triangle', f0: 1200, f1: 1800, delay: 0.05, dur: 0.1, gain: 0.3 },
  ],
  /** ようかいだまが入った「ピッ」 */
  orb: [{ type: 'sine', f0: 1400, f1: 1500, delay: 0.05, dur: 0.08, gain: 0.4 }],
  /** ダメージ「ぼふっ」（やわらかい音） */
  hurt: [
    { type: 'sine', f0: 180, f1: 90, delay: 0, dur: 0.16, gain: 0.7 },
    { type: 'triangle', f0: 120, f1: 70, delay: 0, dur: 0.12, gain: 0.3 },
  ],
  /** やられた「ぽわわん」（下がる やさしい音） */
  faint: [
    { type: 'sine', f0: 660, f1: 520, delay: 0, dur: 0.22, gain: 0.5 },
    { type: 'sine', f0: 520, f1: 390, delay: 0.2, dur: 0.22, gain: 0.5 },
    { type: 'sine', f0: 390, f1: 260, delay: 0.4, dur: 0.3, gain: 0.45 },
  ],
  /** 復活「ぴろん」 */
  respawn: [
    { type: 'sine', f0: 880, f1: 940, delay: 0, dur: 0.1, gain: 0.45 },
    { type: 'sine', f0: 1320, f1: 1400, delay: 0.1, dur: 0.18, gain: 0.45 },
  ],
  /** 出現「ぽわん」 */
  spawn: [{ type: 'sine', f0: 240, f1: 480, delay: 0, dur: 0.22, gain: 0.35 }],
  /** ゆうがたの始め「ゴーン」（小さい鐘 1 回） */
  bell: [
    { type: 'sine', f0: 392, f1: 388, delay: 0, dur: 0.9, gain: 0.35 },
    { type: 'sine', f0: 784, f1: 780, delay: 0, dur: 0.6, gain: 0.15 },
  ],
  /** あさの始め「チュンチュン」 */
  birds: [
    { type: 'sine', f0: 2600, f1: 3200, delay: 0, dur: 0.07, gain: 0.2 },
    { type: 'sine', f0: 2800, f1: 3400, delay: 0.12, dur: 0.07, gain: 0.2 },
    { type: 'sine', f0: 2600, f1: 3200, delay: 0.4, dur: 0.07, gain: 0.2 },
    { type: 'sine', f0: 2800, f1: 3400, delay: 0.52, dur: 0.07, gain: 0.2 },
  ],
  /** 落とし物の着地「ポン」（ふつう） */
  dropCommon: [{ type: 'sine', f0: 520, f1: 380, delay: 0, dur: 0.1, gain: 0.35 }],
  /** すこし めずらしい「ポロン」 */
  dropUncommon: [
    { type: 'sine', f0: 660, f1: 640, delay: 0, dur: 0.1, gain: 0.35 },
    { type: 'sine', f0: 880, f1: 870, delay: 0.07, dur: 0.14, gain: 0.3 },
  ],
  /** めずらしい「キラリン」 */
  dropRare: [
    { type: 'sine', f0: 1175, f1: 1200, delay: 0, dur: 0.08, gain: 0.3 },
    { type: 'sine', f0: 1568, f1: 1590, delay: 0.07, dur: 0.1, gain: 0.3 },
    { type: 'sine', f0: 2093, f1: 2100, delay: 0.14, dur: 0.2, gain: 0.25 },
  ],
  /** とても めずらしい「シャララーン」（のぼる音を たくさん） */
  dropSuperRare: [
    { type: 'sine', f0: 784, f1: 800, delay: 0, dur: 0.12, gain: 0.28 },
    { type: 'sine', f0: 988, f1: 1000, delay: 0.07, dur: 0.12, gain: 0.28 },
    { type: 'sine', f0: 1175, f1: 1190, delay: 0.14, dur: 0.12, gain: 0.28 },
    { type: 'sine', f0: 1568, f1: 1580, delay: 0.21, dur: 0.14, gain: 0.26 },
    { type: 'sine', f0: 1976, f1: 1990, delay: 0.28, dur: 0.16, gain: 0.24 },
    { type: 'triangle', f0: 2637, f1: 2650, delay: 0.35, dur: 0.5, gain: 0.2 },
  ],
} as const satisfies Record<string, readonly Tone[]>;

export type CombatSoundName = keyof typeof COMBAT_SOUNDS;

export function playCombat(sound: Pick<SoundFx, 'playTones'>, name: CombatSoundName, semitones = 0): void {
  sound.playTones(COMBAT_SOUNDS[name] as readonly Tone[], semitones);
}
