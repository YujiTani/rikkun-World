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
}

export const CHARGE_FULL = 60;
export const GATHER_LIFE = 18;
export const FADE_STEPS = 4;

export interface ChargeLightIn {
  /** ためF（ためて いなければ null） */
  ticks: number | null;
  kind: 'lightning' | 'spiral' | 'shining' | null;
  reduced: boolean;
  /** いっぱいに なる ためF（武器の chargeTicks。省くと 60） */
  full?: number;
}

export interface ChargeLight {
  step(input: ChargeLightIn): ChargeLightView;
  view(): ChargeLightView;
}

const paletteOf = (k: 'lightning' | 'spiral' | 'shining' | null): ChargePalette | null => (k === 'spiral' ? 'fujin' : k === 'lightning' ? 'raijin' : k === 'shining' ? 'niji' : null);

export function createChargeLight(): ChargeLight {
  const v: ChargeLightView = { phase: 'off', palette: null, core: 0, alpha: 0, particles: 0, ring: 0, sweep: 0, sparkles: 0, orbit: 0, orbitAngle: 0, F: 0 };
  let lastF = 0;
  let lastPal: ChargePalette | null = null;
  let lastReduced = false;
  let fade = 0;
  let active = false;

  let lastFull = CHARGE_FULL;
  function shape(F: number, reduced: boolean, full = CHARGE_FULL): void {
    v.F = F;
    const d = full - CHARGE_FULL; // いっぱいの ステップが 60 より おくれる ぶん（虹 150 → 90）
    v.core = Math.round((5 * Math.min(F, full)) / full);
    v.ring = F >= 60 + d && F <= 71 + d ? (F - 59 - d) / 12 : 0;
    v.sweep = F >= 60 + d && F <= 65 + d ? (F - 59 - d) / 6 : 0;
    v.sparkles = F >= 66 + d ? 1 : 0;
    v.orbit = F >= 66 + d ? 2 : 0;
    v.orbitAngle = F >= 66 + d ? (F - 66 - d) * 3 : 0;
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
        v.phase = i.ticks <= lastFull - 1 ? 'gather' : i.ticks <= lastFull + 11 ? 'burst' : 'full';
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
      shape(0, false);
      return v;
    },
    view: () => v,
  };
}
