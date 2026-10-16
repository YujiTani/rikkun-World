import type { Tone, TonePartial, ToneFilter } from './sound';

/**
 * 効果音の「部品」（SOUND.md §1。案 B「木のおもちゃとオルゴール」の楽器と同じ作り方）。
 * どれも Tone の並びを返す小さな関数。四角い波は使わない。
 * 高さのある音は「ド（C）を根音」として作る（鳴らすときに BGM の和音へ動かす）。
 */
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 音名（'C6'・'F#5'・'Bb3'）→ Hz（平均律、A4 = 440） */
export function hz(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`音名がへん: ${name}`);
  const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const tone = (
  type: Tone['type'],
  f0: number,
  f1: number,
  delay: number,
  dur: number,
  gain: number,
  extra: { attack?: number; filter?: ToneFilter; partials?: readonly TonePartial[] } = {},
): Tone => ({ type, f0, f1, delay, dur, gain, ...extra });

/** なめらかな sine 1 つ（そのまま使う用） */
export const sine = (f0: number, f1: number, delay: number, dur: number, gain: number, attack?: number): Tone =>
  tone('sine', f0, f1, delay, dur, gain, attack === undefined ? {} : { attack });

/** 三角波 1 つ（やわらかい低い音用） */
export const tri = (f0: number, f1: number, delay: number, dur: number, gain: number, attack?: number): Tone =>
  tone('triangle', f0, f1, delay, dur, gain, attack === undefined ? {} : { attack });

/** 角を丸めたノイズ 1 つ（freq1 を付けると、フィルターの高さが動く）。f0・f1 は使わない（20 より大きい印だけ） */
export function noise(delay: number, dur: number, gain: number, filter: ToneFilter, attack = 0.004): Tone {
  return tone('noise', 1000, 1000, delay, dur, gain, { attack, filter });
}

/** 木（マリンバ型）: sine ＋ 4 倍音の短い「コッ」 */
export function wood(f0: number, f1: number, delay: number, dur: number, gain: number): Tone[] {
  return [tone('sine', f0, f1, delay, dur, gain, { attack: 0.002, partials: [{ ratio: 4, gain: 0.18, durScale: 0.35 }] })];
}

/** マリンバ 1 音（和音用、やや長い） */
export function mar(f0: number, f1: number, delay: number, dur: number, gain: number): Tone[] {
  return [tone('sine', f0, f1, delay, dur, gain, { attack: 0.003, partials: [{ ratio: 4, gain: 0.18, durScale: 0.3 }] })];
}

/** 木琴: sine ＋ 3 倍音。明るい短い音 */
export function xylo(f0: number, f1: number, delay: number, dur: number, gain: number): Tone[] {
  return [tone('sine', f0, f1, delay, dur, gain, { attack: 0.002, partials: [{ ratio: 3, gain: 0.25, durScale: 0.5 }] })];
}

/** オルゴール: sine ＋ 2 倍音（0.15）。rich なら 5.4 倍音（0.06）も足す */
export function box(f0: number, f1: number, delay: number, dur: number, gain: number, rich = false): Tone[] {
  const partials: TonePartial[] = [{ ratio: 2, gain: 0.15, durScale: 0.6 }];
  if (rich) partials.push({ ratio: 5.4, gain: 0.06, durScale: 0.25 });
  return [tone('sine', f0, f1, delay, dur, gain, { attack: 0.002, partials })];
}

/** オルゴールの上がる（下がる）並び */
export function boxRun(freqs: readonly number[], step: number, dur: number, gain: number, start = 0, glide = 1.02): Tone[] {
  return freqs.flatMap((f, i) => box(f, f * glide, start + i * step, dur, gain));
}

/** ひゅっ（シャカ）: 角を丸めたノイズ。f0 → f1 で高さが動く（上がる・下がる） */
export function swish(f0: number, f1: number, delay: number, dur: number, gain: number, q = 1): Tone {
  return noise(delay, dur, gain, { type: 'bandpass', freq: f0, freq1: f1, q }, Math.min(0.012, dur * 0.3));
}

/** シャカ（5 kHz より上のノイズ）。小さな音用 */
export function shaka(delay: number, dur: number, gain: number, freq = 5000): Tone {
  return noise(delay, dur, gain, { type: 'highpass', freq, q: 0.7 }, Math.min(0.006, dur * 0.3));
}

/** ザク（低いノイズ＋低い木）: 2 部品 */
export function zaku(delay: number, dur: number, gain: number): Tone[] {
  return [
    noise(delay, dur, gain, { type: 'lowpass', freq: 900, freq1: 300, q: 0.7 }, 0.004),
    tone('sine', 90, 55, delay + 0.02, Math.max(0.03, dur - 0.02), gain * 1.1, { attack: 0.004 }),
  ];
}

/** ぽわん（ゆっくり入る sine） */
export function powan(f0: number, f1: number, delay: number, dur: number, gain: number, attack = 0.04): Tone {
  return tone('sine', f0, f1, delay, dur, gain, { attack });
}

/** 空ぶりの小さな「ひゅ」（DigFx の WHIFF_SOUND） */
export const WHIFF_TONES: readonly Tone[] = [shaka(0, 0.07, 0.1, 4500)];
