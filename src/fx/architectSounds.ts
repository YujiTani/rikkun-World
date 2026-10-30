import { hz, noise } from './sfxVoices';
import type { SoundFx, Tone } from './sound';

/**
 * 建築士さんの 声「ぽぽぽ」 案 C「ハミング」（HOUSE-1A。docs/design/HOUSE-1.md §3.1。音の 方向 B「木の おもちゃと オルゴール」）。
 * だいくさんが 口を とじて「ふん・ふん・ふーん♪」と ハミング。ひくめで あたたかい 声（sine の 重ね）。
 * 話しかける たびに 声を 変える（3 しゅるいを じゅんばんに ＋ 高さの ごく 小さな ずれ）。乱数は 使わない。
 * 1 回 約 0.55 秒。大きさは 下の LEVEL で ぜんぶ いっしょに 変えられる（今は 「ひろう」より 4〜5 dB ほど 小さい）。
 */
const LEVEL = 0.133;

// 1 つの「ふん」: 口を とじた 声（基音 ＋ 2・3・4 倍音）＋ 「ふ」の 小さな 息。
// note = 音名、len = 音の 長さ（秒）、from・end = はじめ・おわりの 高さの 倍率、vib = さいごの 長い 音だけ ゆらす
function hum(note: string, delay: number, gain: number, len = 0.24, from = 0.97, end = 1.02, vib = false): Tone[] {
  const f = hz(note);
  const g = gain * LEVEL;
  return [
    noise(delay, 0.04, 0.07 * g, { type: 'bandpass', freq: 1400, freq1: 600, q: 0.8 }, 0.012),
    {
      type: 'sine', f0: f * from, f1: f * end, delay, dur: len, gain: g, attack: 0.03,
      partials: [
        { ratio: 2, gain: 0.55, durScale: 0.8 },
        { ratio: 3, gain: 0.3, durScale: 0.6 },
        { ratio: 4, gain: 0.14, durScale: 0.45 },
        ...(vib ? [{ ratio: 1 + 5 / f, gain: 0.45, durScale: 1 }] : []),
      ],
    },
  ];
}

export const ARCHITECT_SOUNDS = {
  /** ふん・ふん・ふーん♪（のぼる） */
  architect_voice: [...hum('D4', 0, 0.85), ...hum('E4', 0.15, 1), ...hum('A4', 0.3, 1, 0.4, 0.97, 1.0, true)],
  /** ふーん・ふん・ふん（くだる） */
  architect_voice2: [...hum('G4', 0, 0.85), ...hum('E4', 0.15, 1), ...hum('D4', 0.3, 1, 0.4, 0.98, 0.97, true)],
  /** ふん・ふーん・ふん♪ */
  architect_voice3: [...hum('C4', 0, 0.85), ...hum('D4', 0.15, 1), ...hum('G4', 0.3, 1, 0.4, 0.97, 1.0, true)],
} as const satisfies Record<string, readonly Tone[]>;

export type ArchitectSoundName = keyof typeof ARCHITECT_SOUNDS;

const ORDER = ['architect_voice', 'architect_voice2', 'architect_voice3'] as const;
/** 毎回 ごく 少し ちがう 高さ（半音。fun.md 1）。決まった 順で まわる（乱数を 使わない） */
const PITCH = [0, 0.3, -0.3, 0.15, -0.15] as const;
let no = 0;

export function playArchitect(sound: Pick<SoundFx, 'playTones'>, name: ArchitectSoundName): void {
  const i = no++;
  const key = name === 'architect_voice' ? ORDER[i % ORDER.length] : name;
  sound.playTones(ARCHITECT_SOUNDS[key] as readonly Tone[], PITCH[i % PITCH.length]);
}
