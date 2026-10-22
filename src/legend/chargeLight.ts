/**
 * WEAPON-8 §3.5: ため中の 手もとの 光（T1）の 区間。1 ステップに 1 回 `step`。雷神剣・風神剣 共通（色の 表だけ ちがう）。
 * 描画は `ChargeLightFx`。ここは 数だけ（窓口 `legend.chargeFx()` の 元）。
 */
export type ChargePhase = 'off' | 'gather' | 'burst' | 'full' | 'fade';
export type ChargePalette = 'fujin' | 'raijin' | 'niji';

export interface ChargeLightView {
  phase: ChargePhase;
  palette: ChargePalette | null;
  /** 芯の 段 0〜5 */
  core: number;
  alpha: number;
  /** すいこまれる つぶの 数 */
  particles: number;
  ring: number;
  sweep: number;
  sparkles: number;
  orbit: number;
  orbitAngle: number;
  /** 見た目の ためF（fade の 間は 消え始めの まま） */
  F: number;
  /** ため満タンの F（雷・風 60・虹 90） */
  full: number;
}

export const CHARGE_FULL = 60;
export const GATHER_LIFE = 18;
export const FADE_STEPS = 4;

export interface ChargeLightIn {
  /** ためF（ためて いなければ null） */
  ticks: number | null;
  kind: 'lightning' | 'spiral' | 'shining' | null;
  /** ため満タンの F（なければ 60。虹は 90） */
  full?: number;
  reduced: boolean;
}

export interface ChargeLight {
  step(input: ChargeLightIn): ChargeLightView;
  view(): ChargeLightView;
}

const paletteOf = (k: 'lightning' | 'spiral' | 'shining' | null): ChargePalette | null => (k === 'shining' ? 'niji' : k === 'spiral' ? 'fujin' : k === 'lightning' ? 'raijin' : null);

export function createChargeLight(): ChargeLight {
  const v: ChargeLightView = { phase: 'off', palette: null, core: 0, alpha: 0, particles: 0, ring: 0, sweep: 0, sparkles: 0, orbit: 0, orbitAngle: 0, F: 0, full: CHARGE_FULL };
  let lastF = 0;
  let lastPal: ChargePalette | null = null;
  let lastReduced = false;
  let lastFull = CHARGE_FULL;
  let fade = 0;
  let active = false;

  function shape(F: number, reduced: boolean, full: number): void {
    v.F = F;
    v.full = full;
    v.core = Math.round((5 * Math.min(F, full)) / full);
    v.ring = F >= full && F <= full + 11 ? (F - (full - 1)) / 12 : 0;
    v.sweep = F >= full && F <= full + 5 ? (F - (full - 1)) / 6 : 0;
    v.sparkles = F >= full + 6 ? 1 : 0;
    v.orbit = F >= full + 6 ? 2 : 0;
    v.orbitAngle = F >= full + 6 ? (F - (full + 6)) * 3 : 0;
    let n = 0;
    for (let t = Math.max(1, F - GATHER_LIFE + 1); t <= F; t++) if (!(t >= full && t % 2 === 0)) n += 1;
    v.particles = n;
    if (reduced) {
      v.ring = v.sweep = v.orbit = v.orbitAngle = v.particles = 0;
    }
  }

  return {
    step(i: ChargeLightIn): ChargeLightView {
      if (i.ticks !== null && i.ticks >= 1) {
        active = true;
        fade = 0;
        lastF = i.ticks;
        lastPal = paletteOf(i.kind) ?? lastPal;
        lastReduced = i.reduced;
        lastFull = i.full ?? CHARGE_FULL;
        v.palette = lastPal;
        v.alpha = 1;
        v.phase = i.ticks < lastFull ? 'gather' : i.ticks <= lastFull + 11 ? 'burst' : 'full';
        shape(i.ticks, i.reduced, lastFull);
        return v;
      }
      if (active) {
        // はなした・やめた ステップから 4 ステップ うすく なる
        fade += 1;
        if (fade <= FADE_STEPS) {
          v.phase = 'fade';
          v.alpha = 1 - 0.25 * fade;
          v.palette = lastPal;
          shape(lastF, lastReduced, lastFull);
          return v;
        }
        active = false;
      }
      v.phase = 'off';
      v.palette = null;
      v.alpha = 0;
      shape(0, false, CHARGE_FULL);
      return v;
    },
    view: () => v,
  };
}
