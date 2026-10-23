import type { BladeStep, BladeTech, YokaiTitle } from '../contracts';

/**
 * #276（試作）手ごたえ: 当たりの 強さの 3 段と、ヒットストップ・画面の ゆれの 数。
 * 数は ここ 1 か所。ゲームの 更新は 1/60 秒の 固定ステップなので、ヒットストップは 「ステップの 数」。
 */
/** echo = ためわざの くり返しの 当たり（止めなし・ゆれは 中の 量） */
export type ImpactLevel = 'small' | 'mid' | 'large' | 'echo';

export const IMPACT: Record<ImpactLevel, { /** 止める ステップの 数（1/60） */ stop: number; /** trauma に 足す 量（0〜1） */ trauma: number }> = {
  small: { stop: 0, trauma: 0.15 }, // ブロックを ほる・こわす（DigFx の いまの ゆれが やっている。ここでは 使わない）
  mid: { stop: 3, trauma: 0.3 },
  large: { stop: 7, trauma: 0.75 },
  echo: { stop: 0, trauma: 0.3 }, // シャイニングの ドームの 2 回目から・真空波・らせん（PO の 判断: 止まりが 何度も 入ると がたがたに なる）
};

/** 画面の ゆれ（カメラの 向きだけ）。ずれ = 最大角 × trauma² × なめらかな 波 */
export const SHAKE = {
  /** trauma が 1 秒に へる 量 */
  decayPerSecond: 1.4,
  /** 最大角（度）。子どもが 酔わない 小さな 角 */
  maxYawDeg: 1.2,
  maxPitchDeg: 0.8,
  maxRollDeg: 0.4,
  /** 波の 周波数（Hz）と 位相（ラジアン）。毎コマ ばらばらの 乱数に しない。決まった 値 */
  yaw: [
    [4.1, 0.7, 0.8],
    [6.7, 2.1, 0.2],
  ],
  pitch: [
    [4.3, 4.0, 0.8],
    [6.1, 1.3, 0.2],
  ],
  roll: [
    [3.7, 5.2, 1],
    [0, 0, 0],
  ],
} as const;

export type ImpactSource =
  | { kind: 'tech'; tech: BladeTech; step?: BladeStep; title?: YokaiTitle }
  | { kind: 'arrow' | 'punch'; title?: YokaiTitle }
  /** ためわざ（雷・シャイニングの ドームの 最初の 当たり）が 当たった */
  | { kind: 'charged' }
  /** ためわざの くり返しの 当たり（ドームの 2 回目から・真空波・らせん） */
  | { kind: 'repeat' }
  /** 妖怪を たおした */
  | { kind: 'defeat' };

/** できごとの 強さの 段を 決める。二つ名への ヒットは どれでも 大 */
export function impactOf(s: ImpactSource): ImpactLevel {
  switch (s.kind) {
    case 'charged':
    case 'defeat':
      return 'large';
    case 'repeat':
      return 'echo';
    case 'tech':
      if (s.title && s.title !== 'none') return 'large';
      return s.tech === 'kesa' || s.step === 3 ? 'large' : 'mid';
    case 'arrow':
    case 'punch':
      return s.title && s.title !== 'none' ? 'large' : 'mid';
  }
}

const RANK: Record<ImpactLevel, number> = { small: 0, echo: 1, mid: 2, large: 3 };

function wave(parts: readonly (readonly number[])[], t: number): number {
  let v = 0;
  for (const [hz, ph, w] of parts) if (w > 0) v += w * Math.sin(2 * Math.PI * hz * t + ph);
  return v;
}

/** trauma（0〜1）と 時間 t（秒）から カメラの ずれ（ラジアン）を out に 入れる */
export function shakeAngles(trauma: number, t: number, out: { yaw: number; pitch: number; roll: number }): void {
  const k = trauma * trauma;
  const D = Math.PI / 180;
  out.yaw = k > 0 ? SHAKE.maxYawDeg * D * k * wave(SHAKE.yaw, t) : 0;
  out.pitch = k > 0 ? SHAKE.maxPitchDeg * D * k * wave(SHAKE.pitch, t) : 0;
  out.roll = k > 0 ? SHAKE.maxRollDeg * D * k * wave(SHAKE.roll, t) : 0;
}

export interface ImpactLogEntry {
  tick: number;
  level: ImpactLevel;
}

/**
 * 1 ステップの 間に 起きた 当たりを ためて、最後に 1 回 だけ 出す。
 * 同じ ステップに 何回 当たっても 一番 強い 段の 1 回 分（ヒットストップも ゆれも）。
 */
export class ImpactBus {
  private best: ImpactLevel | null = null;
  readonly log: ImpactLogEntry[] = [];

  constructor(
    private readonly out: { stop(ticks: number): void; shake(amount: number): void; tick(): number },
  ) {}

  hit(level: ImpactLevel): void {
    if (level === 'small') return;
    if (this.best === null || RANK[level] > RANK[this.best]) this.best = level;
  }

  /** ステップの おわりに 1 回 */
  flush(): void {
    const b = this.best;
    if (b === null) return;
    this.best = null;
    this.out.stop(IMPACT[b].stop);
    this.out.shake(IMPACT[b].trauma);
    this.log.push({ tick: this.out.tick(), level: b });
    if (this.log.length > 64) this.log.shift();
  }
}
