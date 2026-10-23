/**
 * WEAPON-9 PR-1（§5.8・AC40）: ため中の 光。雷神剣・風神剣・虹 共通（色の 表だけ ちがう）。1 ステップに 1 回 `step`。
 * - ため中（gather）: 光の つぶが 体の 中心（むね）へ まわりから あつまる。手には あつまらない・手に 玉は 出さない。
 *   つぶの 数 `particles` は ため中 ずっと 同じ（ふえない・点滅しない）。
 * - いっぱい（full）: あつまる つぶは そのまま ずっと つづく（オーナー 2026-10-23: 完了後も ためのアニメは つづける）。
 *   右手が ピカピカ またたく（`hand`: 光りはじめの 1 ステップだけ 2、あとは 1。絵は `handCore`・`handRing` が ドットアニメで 変わる。
 *   「動きを減らす」は ゆっくり おだやかに またたく（消さない・止めない）。
 * - はなした・やめた ステップに すぐ 消える（うすくは ならない）。
 * 描画は `ChargeLightFx`。ここは 数だけ（窓口 `legend.chargeFx()` の 元）。
 */
export type ChargePhase = 'off' | 'gather' | 'full';
export type ChargePalette = 'fujin' | 'raijin' | 'niji';

export interface ChargeLightView {
  phase: ChargePhase;
  palette: ChargePalette | null;
  /** 1 = 光る。見た目の 不透明度（はなすと すぐ 0） */
  alpha: number;
  /** 体の 中心へ あつまる つぶの 数（ため中は 一定。いっぱいで 0） */
  particles: number;
  /** 右手の 光: 0 なし・2 光りはじめの 1 ステップ（明るい）・1 そのあと（またたく） */
  hand: number;
  /** 右手の 光の 芯の 絵（0〜5。大きい ほど 明るい）。hand 0 の とき 0 */
  handCore: number;
  /** 右手の 光の 輪の 絵（0〜11）。なし = -1 */
  handRing: number;
  /** ためF（はなすと 0） */
  F: number;
}

export const CHARGE_FULL = 60;
/** あつまる つぶの 数（ため中 ずっと 一定） */
export const GATHER_COUNT = 14;
/** つぶが 出てから 体の 中心に つくまでの ステップ（はやさも 一定） */
export const GATHER_LIFE = 20;

/** 手の またたき（ふつう）: 3 ステップごとに 次の 絵。6 コマで 1 周（18 ステップ） */
export const HAND_STEP = 3;
export const HAND_CORES = [5, 3, 4, 5, 2, 4] as const;
export const HAND_RINGS = [1, -1, -1, 0, -1, -1] as const;
/** 手の またたき（動きを 減らす）: 15 ステップごとに 次の 絵。4 コマで 1 周（60 ステップ）。となりの 明るさへ 少しずつ。輪なし */
export const HAND_STEP_CALM = 15;
export const HAND_CORES_CALM = [5, 4, 3, 4] as const;
/** 光りはじめの 1 ステップ（輪が ひろがって 明るい） */
export const HAND_BURST = { core: 5, ring: 7 } as const;

export interface ChargeLightIn {
  /** ためF（ためて いなければ null） */
  ticks: number | null;
  kind: 'lightning' | 'spiral' | 'shining' | null;
  reduced: boolean;
  /** いっぱいに なる ためF（武器の chargeTicks。省くと 60） */
  full?: number;
  /** 使わない（はなしたら いつでも すぐ 消える）。呼び出しの 互換 */
  cut?: boolean;
}

export interface ChargeLight {
  step(input: ChargeLightIn): ChargeLightView;
  view(): ChargeLightView;
}

const paletteOf = (k: 'lightning' | 'spiral' | 'shining' | null): ChargePalette | null => (k === 'spiral' ? 'fujin' : k === 'lightning' ? 'raijin' : k === 'shining' ? 'niji' : null);

export function createChargeLight(): ChargeLight {
  const v: ChargeLightView = { phase: 'off', palette: null, alpha: 0, particles: 0, hand: 0, handCore: 0, handRing: -1, F: 0 };
  let lastPal: ChargePalette | null = null;
  return {
    step(i: ChargeLightIn): ChargeLightView {
      if (i.ticks !== null && i.ticks >= 1) {
        const full = i.full ?? CHARGE_FULL;
        lastPal = paletteOf(i.kind) ?? lastPal;
        v.palette = lastPal;
        v.alpha = 1;
        v.F = i.ticks;
        if (i.ticks < full) {
          v.phase = 'gather';
          v.particles = i.reduced ? 0 : GATHER_COUNT;
          v.hand = 0;
          v.handCore = 0;
          v.handRing = -1;
        } else {
          v.phase = 'full';
          // 完了後も あつまる つぶは つづく（動きを 減らす では 0）
          v.particles = i.reduced ? 0 : GATHER_COUNT;
          const age = i.ticks - full;
          v.hand = age === 0 ? 2 : 1;
          if (age === 0) {
            v.handCore = HAND_BURST.core;
            v.handRing = HAND_BURST.ring;
          } else if (i.reduced) {
            v.handCore = HAND_CORES_CALM[Math.floor((age - 1) / HAND_STEP_CALM) % HAND_CORES_CALM.length]!;
            v.handRing = -1;
          } else {
            const k = Math.floor((age - 1) / HAND_STEP) % HAND_CORES.length;
            v.handCore = HAND_CORES[k]!;
            v.handRing = HAND_RINGS[k]!;
          }
        }
        return v;
      }
      v.phase = 'off';
      v.palette = null;
      v.alpha = 0;
      v.particles = 0;
      v.hand = 0;
      v.handCore = 0;
      v.handRing = -1;
      v.F = 0;
      return v;
    },
    view: () => v,
  };
}
