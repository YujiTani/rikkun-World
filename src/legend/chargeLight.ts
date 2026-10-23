/**
 * WEAPON-9 PR-1（§5.8・AC40）: ため中の 光。雷神剣・風神剣・虹 共通（色の 表だけ ちがう）。1 ステップに 1 回 `step`。
 * - ため中（gather）: 光の つぶが 体の 中心（むね）へ まわりから あつまる。手には あつまらない・手に 玉は 出さない。
 *   つぶの 数 `particles` は ため中 ずっと 同じ（ふえない・点滅しない）。
 * - いっぱい（full）: あつまる つぶは 0。右手が 光る（`hand`: 光りはじめの 1 ステップだけ 2、あとは 1 で 一定）。
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
  /** 右手の 光: 0 なし・2 光りはじめの 1 ステップ（明るい）・1 そのあと（一定） */
  hand: number;
  /** ためF（はなすと 0） */
  F: number;
}

export const CHARGE_FULL = 60;
/** あつまる つぶの 数（ため中 ずっと 一定） */
export const GATHER_COUNT = 14;
/** つぶが 出てから 体の 中心に つくまでの ステップ（はやさも 一定） */
export const GATHER_LIFE = 20;

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
  const v: ChargeLightView = { phase: 'off', palette: null, alpha: 0, particles: 0, hand: 0, F: 0 };
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
        } else {
          v.phase = 'full';
          v.particles = 0;
          v.hand = i.ticks === full ? 2 : 1;
        }
        return v;
      }
      v.phase = 'off';
      v.palette = null;
      v.alpha = 0;
      v.particles = 0;
      v.hand = 0;
      v.F = 0;
      return v;
    },
    view: () => v,
  };
}
