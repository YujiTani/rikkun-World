import { box, hz, noise, shaka, sine, swish, tri } from './sfxVoices';
import type { Tone } from './sound';

/**
 * LEGEND-4 のレジェンダリー武器の効果音（オーナーの言葉 2026-11-12。`docs/audio/SOUND.md` §9。合成。出どころ: コードだけで作った（録音・生成サービスは未使用））。
 * 名前は `combat.sounds()` の名前と同じ。くり返す行動（うつ・とぶ）は短く控えめにし、ゆらぎ（sfxVary）で毎回少し変える。
 * 達成の音ではないので、どれも gain 0.45 以下・1 秒以内。
 */

/** ぱちっと はじける 油の つぶ（くり返しの 高さを ずらして フライパンらしく） */
const pop = (delay: number, freq: number, gain = 0.2): Tone => noise(delay, 0.022, gain, { type: 'bandpass', freq, q: 2.2 }, 0.002);

export const LEGEND4_SOUNDS = {
  /** 黒龍の や「じゅうううー」: 油が フライパンで はじかれる 音を 低く 短く（低い ざー ＋ ぱちぱちの つぶ ＋ 小さな どすっ） */
  kokuryuShot: [
    noise(0, 0.3, 0.2, { type: 'bandpass', freq: 1100, freq1: 600, q: 0.8 }, 0.012),
    noise(0, 0.26, 0.12, { type: 'lowpass', freq: 700, freq1: 300, q: 0.7 }, 0.01),
    pop(0.02, 1500),
    pop(0.06, 2100, 0.16),
    pop(0.095, 1300),
    pop(0.14, 1800, 0.14),
    pop(0.185, 1400, 0.12),
    pop(0.23, 1700, 0.08),
    sine(130, 80, 0, 0.1, 0.12, 0.004),
  ],
  /** 八咫烏の や「カン」: ぶきみで 高い かたい 音（ずれた 倍音 ＋ 少し ずらした 2 つ目で うなりを 出す） */
  yataShot: [
    sine(2400, 2340, 0, 0.38, 0.12, 0.002),
    sine(2437, 2380, 0, 0.3, 0.06, 0.002),
    {
      type: 'sine',
      f0: 2400,
      f1: 2340,
      delay: 0,
      dur: 0.38,
      gain: 0.04,
      attack: 0.002,
      partials: [
        { ratio: 2.76, gain: 3, durScale: 0.5 },
        { ratio: 5.4, gain: 1.2, durScale: 0.25 },
      ],
    },
    shaka(0, 0.02, 0.05, 4500),
  ],
  /** 八咫烏の ほのおが 着いた「ばしゅうー」: ものが とける 音を もっと 低く（低い ざー ＋ ぷくぷく ＋ 下の ふくらみ） */
  yataBurst: [
    noise(0, 0.75, 0.3, { type: 'lowpass', freq: 900, freq1: 180, q: 0.7 }, 0.03),
    noise(0.05, 0.6, 0.16, { type: 'bandpass', freq: 500, freq1: 200, q: 2 }, 0.04),
    sine(90, 50, 0, 0.5, 0.2, 0.05),
    sine(150, 90, 0.1, 0.08, 0.1, 0.01),
    sine(130, 80, 0.22, 0.08, 0.09, 0.01),
    sine(120, 70, 0.35, 0.09, 0.08, 0.01),
    sine(100, 60, 0.5, 0.1, 0.07, 0.01),
  ],
  /** 天使の弓 うつ「パアッ」: 光が 広がる 高い 音（ド を 根音に つくる。和音に 合わせる） */
  tenshiPaa: [
    ...box(hz('G6'), hz('G6') * 1.03, 0, 0.36, 0.2),
    ...box(hz('C7'), hz('C7') * 1.02, 0.04, 0.42, 0.14),
    shaka(0, 0.2, 0.05, 6500),
  ],
  /** 天使の弓 空中ジャンプ・羽ばたき「パァ」: 小さく 短い 上がる 高い 音 ＋ 羽の シャカ */
  airJump: [...box(hz('E6'), hz('A6'), 0, 0.24, 0.17), ...box(hz('A6'), hz('C7'), 0.05, 0.22, 0.09), swish(3000, 5200, 0, 0.12, 0.06)],
  /** 大地のハンマー たたきつけ「ゴォン」: 大きな 鉄の 玉が 高い ところから 落ちた 音（低い ふくらみ ＋ 鉄の 長い ひびき ＋ 土の どすっ） */
  hammerSlam: [
    sine(95, 42, 0, 0.95, 0.3, 0.006),
    sine(58, 38, 0.01, 1, 0.22, 0.01),
    {
      type: 'sine',
      f0: 150,
      f1: 142,
      delay: 0,
      dur: 0.9,
      gain: 0.15,
      attack: 0.004,
      partials: [
        { ratio: 2.07, gain: 0.5, durScale: 0.6 },
        { ratio: 3.2, gain: 0.3, durScale: 0.4 },
        { ratio: 4.5, gain: 0.15, durScale: 0.25 },
      ],
    },
    noise(0, 0.28, 0.1, { type: 'lowpass', freq: 800, freq1: 150, q: 0.8 }, 0.003),
    tri(180, 70, 0, 0.18, 0.12, 0.004),
  ],
  /** 大地のハンマー 急降下「ヒュゴォー」: 重い ものが 空気を さく 音（だんだん 大きく 高くなる 風 ＋ 重い ふくらみ） */
  hammerDive: [
    noise(0.03, 0.55, 0.2, { type: 'bandpass', freq: 500, freq1: 2400, q: 1.2 }, 0.16),
    noise(0, 0.6, 0.24, { type: 'lowpass', freq: 400, freq1: 1000, q: 0.8 }, 0.22),
    sine(70, 150, 0, 0.55, 0.12, 0.22),
  ],
} as const satisfies Record<string, readonly Tone[]>;
