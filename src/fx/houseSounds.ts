import { box, hz, mar, noise, sine, xylo } from './sfxVoices';
import type { SoundFx, Tone } from './sound';

/**
 * HOUSE-1C の 音 案 A「こえ と どうぐ」（docs/design/HOUSE-1.md §2.9・§2.10・§3.1。音の 方向 B「木の おもちゃと オルゴール」）。
 * - どうづき: 建築士さんと 同じ ハミングの 声で、言葉では ない 掛け声（ほっ・よいっ・ほい・そーれ）＋ 土の「ドスン」。
 * - とんかち: 木づちで くぎを 打つ「トンッ」（木の 胴 ＋ くぎの 小さな「チ」）。
 * - みずもり: 水の「ぽちゃん」。
 * - 家が できた: 木琴・マリンバ・オルゴールの ファンファーレ ＋ 建築士さんの ハミング「ふふーん♪」（big）。
 * 乱数は 使わない（じゅんばんに まわす。ゆらぎは エンジンの シード付き）。大きさは LEVEL で まとめて 変えられる。
 */
const LEVEL = { call: 0.15, thud: 0.42, soft: 0.28, tonkachi: 0.25, water: 0.45, done: 0.72 } as const;

/** 1 つの 声（口を とじた ハミングの 声。基音 ＋ 2・3・4 倍音 ＋「ほ」の 小さな 息）。from・to ＝ はじめ・おわりの 高さの 倍率 */
function voice(note: string, delay: number, len: number, from: number, to: number, g: number): Tone[] {
  const f = hz(note);
  const k = g * LEVEL.call;
  return [
    noise(delay, 0.035, 0.06 * k, { type: 'bandpass', freq: 1500, freq1: 700, q: 0.9 }, 0.008),
    {
      type: 'sine', f0: f * from, f1: f * to, delay, dur: len, gain: k, attack: 0.014,
      partials: [
        { ratio: 2, gain: 0.6, durScale: 0.85 },
        { ratio: 3, gain: 0.38, durScale: 0.7 },
        { ratio: 4, gain: 0.18, durScale: 0.5 },
      ],
    },
  ];
}

/** 土の「ドスン」: 低い 胴（130 → 50 Hz）＋ 土が しずむ 低い ノイズ */
function thud(delay: number, k: number, f = 130): Tone[] {
  return [
    {
      type: 'sine', f0: f, f1: f * 0.38, delay, dur: 0.26, gain: k, attack: 0.004,
      partials: [
        { ratio: 2, gain: 0.45, durScale: 0.45 },
        { ratio: 3.1, gain: 0.12, durScale: 0.25 },
      ],
    },
    noise(delay, 0.16, 0.1 * k, { type: 'lowpass', freq: 800, freq1: 160, q: 0.7 }, 0.005),
  ];
}

/** 木づちの「トンッ」: 木の 胴 ＋ くぎの 小さな「チ」＋ 当たりの ごく 短い ノイズ */
function ton(delay: number, g: number, body: number, ping: number, len = 0.11): Tone[] {
  const k = g * LEVEL.tonkachi;
  return [
    { type: 'sine', f0: body * 1.12, f1: body * 0.82, delay, dur: len, gain: k, attack: 0.003, partials: [{ ratio: 2.32, gain: 0.22, durScale: 0.35 }] },
    sine(ping, ping * 0.985, delay + 0.002, 0.05, 0.14 * k, 0.002),
    noise(delay, 0.018, 0.04 * k, { type: 'bandpass', freq: 2000, q: 1.2 }, 0.002),
  ];
}

/** ハミング 1 つ（ファンファーレの さいごの「ふふーん♪」用。建築士さんの 声と 同じ 作り） */
function hum(note: string, delay: number, len: number, g: number, vib = false): Tone {
  const f = hz(note);
  return {
    type: 'sine', f0: f * 0.97, f1: f * 1.01, delay, dur: len, gain: g, attack: 0.03,
    partials: [
      { ratio: 2, gain: 0.55, durScale: 0.8 },
      { ratio: 3, gain: 0.3, durScale: 0.6 },
      ...(vib ? [{ ratio: 1 + 5 / f, gain: 0.45, durScale: 1 }] : []),
    ],
  };
}

const D = LEVEL.done;

export const HOUSE_SOUNDS = {
  /** どうづきの 掛け声 1「ほっ」（下がる） */
  dozukiCall1: voice('G4', 0, 0.2, 1.05, 0.88, 1),
  /** 掛け声 2「よいっ」（ひくい → たかい） */
  dozukiCall2: [...voice('E4', 0, 0.16, 0.97, 1.02, 0.85), ...voice('A4', 0.08, 0.2, 1.04, 0.92, 1)],
  /** 掛け声 3「ほい」 */
  dozukiCall3: [...voice('D4', 0, 0.16, 0.98, 1.0, 0.85), ...voice('G4', 0.08, 0.2, 1.02, 0.95, 1)],
  /** 掛け声 4「そーれ」（「そ」の 小さな 息 ＋ のびて 下がる） */
  dozukiCall4: [
    noise(0, 0.045, 0.025 * LEVEL.call, { type: 'highpass', freq: 3800, q: 0.7 }, 0.006),
    ...voice('A4', 0.03, 0.24, 0.96, 1.03, 1),
    ...voice('G4', 0.15, 0.2, 1.0, 0.9, 0.8),
  ],
  /** ドスン（掛け声の 0.06 秒 あと。どうづきが 下りる コマに 合わせる） */
  dozukiThud: thud(0.06, LEVEL.thud),
  /** かためた つちを たたいた（何も かわらない）: 小さい「トッ」だけ。掛け声 なし */
  dozukiSoft: thud(0, LEVEL.soft, 170),
  /** とんかち（建築中、1 秒に 1 回）: 3 しゅるい */
  tonkachi: ton(0, 1, 520, 2090),
  tonkachi2: ton(0, 0.85, 470, 1960),
  tonkachi3: ton(0, 0.7, 580, 2240),
  /** けんちくを はじめた 合図「トン・トン・トーン」 */
  tonkachiStart: [...ton(0, 1.25, 520, 2090), ...ton(0.24, 1.25, 470, 1960), ...ton(0.48, 1.45, 590, 2350, 0.24)],
  /** みずもり: 水の「ぽちゃん」（下から すっと 上がる 水の しずく 2 つ ＋ 小さな「ちゃぷ」） */
  mizumori: [
    { type: 'sine', f0: 620, f1: 1500, delay: 0, dur: 0.11, gain: LEVEL.water, attack: 0.004, partials: [{ ratio: 2, gain: 0.08, durScale: 0.6 }] },
    sine(900, 1900, 0.1, 0.08, 0.45 * LEVEL.water, 0.003),
    noise(0, 0.05, 0.05 * LEVEL.water, { type: 'lowpass', freq: 1200, freq1: 400, q: 0.7 }, 0.004),
  ],
  /** 家が できた（big）: ソドミソ と のぼって ドの 和音 ＋ 建築士さんの「ふふーん♪」。約 2 秒 */
  houseDone: [
    ...xylo(hz('G4'), hz('G4'), 0, 0.14, 0.4 * D),
    ...xylo(hz('C5'), hz('C5'), 0.14, 0.14, 0.42 * D),
    ...xylo(hz('E5'), hz('E5'), 0.28, 0.14, 0.42 * D),
    ...xylo(hz('G5'), hz('G5'), 0.42, 0.16, 0.44 * D),
    ...box(hz('C6'), hz('C6'), 0.6, 0.9, 0.42 * D, true),
    ...mar(hz('C5'), hz('C5'), 0.6, 0.8, 0.32 * D),
    ...mar(hz('E5'), hz('E5'), 0.6, 0.7, 0.22 * D),
    sine(hz('C7'), hz('C7'), 0.6, 0.6, 0.07 * D),
    hum('G4', 1.05, 0.24, 0.2 * D),
    hum('A4', 1.2, 0.24, 0.22 * D),
    hum('C5', 1.35, 0.55, 0.24 * D, true),
  ],
} as const satisfies Record<string, readonly Tone[]>;

type Sfx = Pick<SoundFx, 'playTones'>;

/** 掛け声は 4 しゅるいを じゅんばんに（となりは いつも ちがう） */
const CALLS = ['dozukiCall1', 'dozukiCall2', 'dozukiCall3', 'dozukiCall4'] as const;
/** とんかちの ならび（トン・トン・トン・とん）と 高さの ずれ（半音。4 と 5 で 20 回ごとに 1 周） */
const HAMMER = ['tonkachi', 'tonkachi2', 'tonkachi', 'tonkachi3'] as const;
const HAMMER_PITCH = [0, 0.4, -0.3, 0.2, -0.5] as const;
let call = 0;
let hammer = 0;

/** どうづきで たたいた（20 ステップに 1 回）。hard ＝ もう かためた つち（小さい 音だけ） */
export function playDozuki(sound: Sfx, hard = false): void {
  if (hard) {
    sound.playTones(HOUSE_SOUNDS.dozukiSoft);
    return;
  }
  sound.playTones(HOUSE_SOUNDS[CALLS[call++ % CALLS.length]!]);
  sound.playTones(HOUSE_SOUNDS.dozukiThud);
}

/** 建築士さんの とんかち（打つ コマで 1 回。近くに いる ときだけ 鳴らす） */
export function playTonkachi(sound: Sfx): void {
  const i = hammer++;
  sound.playTones(HOUSE_SOUNDS[HAMMER[i % HAMMER.length]!], HAMMER_PITCH[i % HAMMER_PITCH.length]);
}

/** ［ここに たてる］の 合図 */
export function playTonkachiStart(sound: Sfx): void {
  sound.playTones(HOUSE_SOUNDS.tonkachiStart);
}

/** みずもりで 地面を しらべた（色が 出た） */
export function playMizumori(sound: Sfx): void {
  sound.playTones(HOUSE_SOUNDS.mizumori);
}

/** 家が できた（big。BGM が すこし 下がって もどる） */
export function playHouseDone(sound: Pick<SoundFx, 'play' | 'playTones'>): void {
  sound.playTones(HOUSE_SOUNDS.houseDone);
}
