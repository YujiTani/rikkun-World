import { noise, powan, sine, swish } from './sfxVoices';
import type { SoundFx, Tone } from './sound';
import type { LiquidSoundKind } from '../world/water/waterSystem';

/**
 * WAKIDOKORO §11: 液体の 音（コードで 作る 短い音。外の 音ファイルは 使わない）。
 * - placeWater: 水の わきどころを 置いた「ちゃぽん」
 * - placeMagma: マグマの わきどころを 置いた「ジュッ」
 * - erode: 液体が ブロックを かえた（こくようせき・こげた・流れこみ）「じゅわっ」
 * 鳴りすぎ どめ: 同じ 種類は `gapTicks` に 1 回。遠いほど 小さく、`maxDist` より 遠いと 鳴らさない。
 */
export const LIQUID_SOUND_TUNING = {
  /** 同じ 種類を 次に 鳴らせる まで（ティック。60 = 1 秒） */
  gapTicks: { placeWater: 6, placeMagma: 6, erode: 15 },
  /** これより 遠い（マス）と 鳴らさない。fullDist まで 大きさ そのまま、あとは 直線で 0 へ */
  fullDist: 4,
  maxDist: 24,
  /** 大きさの 段（段ごとに 音の 表を 1 回だけ 作る。毎回 配列を 作らない） */
  steps: 4,
} as const;

const BASE: Record<LiquidSoundKind, readonly Tone[]> = {
  placeWater: [sine(900, 420, 0, 0.12, 0.22, 0.004), powan(500, 300, 0.05, 0.16, 0.1), noise(0, 0.08, 0.06, { type: 'bandpass', freq: 2500, q: 1.2 })],
  placeMagma: [noise(0, 0.28, 0.16, { type: 'highpass', freq: 3000, q: 0.7 }), powan(140, 90, 0, 0.22, 0.12)],
  erode: [noise(0, 0.45, 0.14, { type: 'bandpass', freq: 1800, freq1: 5000, q: 0.9 }, 0.02), swish(1200, 3500, 0.05, 0.35, 0.06, 0.8)],
};

const scaled = (tones: readonly Tone[], k: number): readonly Tone[] => tones.map((t) => ({ ...t, gain: t.gain * k }));
/** TABLE[kind][段]（段 0 = いちばん 大きい） */
const steps = (k: LiquidSoundKind): readonly (readonly Tone[])[] => Array.from({ length: LIQUID_SOUND_TUNING.steps }, (_, i) => scaled(BASE[k], 1 - i / LIQUID_SOUND_TUNING.steps));
const TABLE: Record<LiquidSoundKind, readonly (readonly Tone[])[]> = { placeWater: steps('placeWater'), placeMagma: steps('placeMagma'), erode: steps('erode') };

/** 距離 → 段（鳴らさない ときは -1） */
export function liquidVolumeStep(dist: number): number {
  const T = LIQUID_SOUND_TUNING;
  if (dist > T.maxDist) return -1;
  if (dist <= T.fullDist) return 0;
  const f = (dist - T.fullDist) / (T.maxDist - T.fullDist); // 0〜1
  return Math.min(T.steps - 1, Math.floor(f * T.steps));
}

/** 鳴らす 係（同じ 種類の 間引き と 距離）。鳴らした ときは 段を、鳴らさない ときは -1 を 返す */
export function createLiquidSounds(sound: Pick<SoundFx, 'playTones'>, tick: () => number, listener: () => { x: number; y: number; z: number }) {
  const last: Record<LiquidSoundKind, number> = { placeWater: -1e9, placeMagma: -1e9, erode: -1e9 };
  return (kind: LiquidSoundKind, x: number, y: number, z: number): number => {
    const t = tick();
    if (t - last[kind] < LIQUID_SOUND_TUNING.gapTicks[kind]) return -1;
    const p = listener();
    const step = liquidVolumeStep(Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y, z + 0.5 - p.z));
    if (step < 0) return -1;
    last[kind] = t;
    sound.playTones(TABLE[kind][step]!);
    return step;
  };
}
