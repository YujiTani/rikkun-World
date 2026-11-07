import { parryGlowLevel, type ParryStateView } from '../combat/parry';
import type { W2Settings } from '../contracts';
import { parryCellOf, type ParryCell } from '../char/parryCells';
import { DUO_TUNING } from './tuning';

/**
 * COOP-1 4d-1（docs/design/COOP-1.md 1.13 §3.6 (a)「見せ方」・§9.10、AC100）: パリィした 人の 半分だけの 見せ方。three・DOM を 使わない。テストは p2ParryView.test.ts。
 * ① よせ（その人の カメラが ふだんの きょり → ×0.88 → ふだん）② 青い ふち（濃さ。DOM は duoHud）③ 2P の 人形に わたす パリィの 絵と 青白い 光。
 * 数は DUO_TUNING.parryZoom（よせ）・調整表 w2 の parryGlowTicks（ふち・光）。1 人の ときは 何も しない（AC113）。
 */

/** カメラの きょりの 口（`shared.duoCamFx(who)` の 一部） */
export interface ParryZoomFx {
  setDistance(dist: number | null): void;
}

export interface ParryZoomDeps {
  fx: ParryZoomFx;
  /** その人の ふだんの きょり（読むたびに いまの 値。2 人の とき 5.0） */
  base: () => number;
  reducedMotion?: () => boolean;
}

/** 浮動小数の 誤差で 端に とどかない のを 防ぐ */
const EPS = 1e-9;

/**
 * パリィの よせ。毎ステップ `step(その人の パリィの slowLeft)`。
 * slowLeft > 0 の あいだ inSteps で base × mul へ より、そのまま。おわったら outSteps で base へ もどり、もどり きった ステップに setDistance(null)。
 * 「動きを へらす」の あいだは 数で 呼ばない。
 */
export function createParryZoom(d: ParryZoomDeps): { step(slowLeft: number): void; reset(): void } {
  const Z = DUO_TUNING.parryZoom;
  /** 0 = ふだん、1 = いちばん 近い */
  let t = 0;
  return {
    step(slowLeft) {
      if (d.reducedMotion?.()) {
        if (t > 0) {
          t = 0;
          d.fx.setDistance(null);
        }
        return;
      }
      if (slowLeft > 0) t = Math.min(1, t + 1 / Z.inSteps);
      else if (t > 0) t = Math.max(0, t - 1 / Z.outSteps);
      else return;
      if (t > 1 - EPS) t = 1;
      if (t < EPS) {
        t = 0;
        d.fx.setDistance(null);
        return;
      }
      d.fx.setDistance(d.base() * (1 - t * (1 - Z.mul)));
    },
    /** よせを やめる（2P が やめた）。きょりを ふだんに もどす */
    reset() {
      if (t > 0) d.fx.setDistance(null);
      t = 0;
    },
  };
}

/** 青い ふちの 濃さ 0〜1。青白い 光（`parryGlowLevel`）と 同じ 部品。「動きを へらす」は 0 */
export function parryEdgeLevel(glowLeft: number, reduced: boolean, S: Pick<W2Settings, 'parryGlowTicks'>): number {
  return reduced ? 0 : parryGlowLevel(glowLeft, S);
}

/** 人形に わたす パリィの 絵と 青白い 光（1P の step.ts と 同じ 部品） */
export function parryDollOf(ps: ParryStateView, S: Pick<W2Settings, 'parryGlowTicks'>): { cell: ParryCell | null; glow: number } {
  return { cell: parryCellOf(ps.phase, ps.frame, ps.jingasa), glow: parryGlowLevel(ps.glowLeft, S) };
}

export interface ParryViewsDeps {
  /** 2 人が 参加している（1 人の ときは 何も しない） */
  joined: () => boolean;
  fxFor(who: 1 | 2): ParryZoomFx;
  baseFor(who: 1 | 2): number;
  stateFor(who: 1 | 2): Pick<ParryStateView, 'slowLeft' | 'glowLeft'> | null;
  reducedMotion?: () => boolean;
  settings: Pick<W2Settings, 'parryGlowTicks'>;
}

export interface ParryViews {
  /** 毎ステップ 1 回（2 人が 参加している あいだ だけ 動く） */
  step(): void;
  /** その人の 半分の 青い ふちの 濃さ 0〜1（duoHud が 使う） */
  edgeLevel(who: 1 | 2): number;
  /** その人の 半分の 青い ふちを 出すか（glowLeft > 0・「動きを へらす」でない・参加中） */
  edgeShown(who: 1 | 2): boolean;
  /** 2P が やめた: よせの 数えを 消し、カメラの きょりを ふだんに もどす */
  reset(): void;
}

/** 1P と 2P の 両方に つなぐ 見せ方。よせは 人ごとに 1 つずつ */
export function createParryViews(d: ParryViewsDeps): ParryViews {
  const reduced = (): boolean => d.reducedMotion?.() ?? false;
  const zoom = (who: 1 | 2) =>
    createParryZoom({
      fx: { setDistance: (v) => d.fxFor(who).setDistance(v) },
      base: () => d.baseFor(who),
      ...(d.reducedMotion ? { reducedMotion: d.reducedMotion } : {}),
    });
  const zooms = { 1: zoom(1), 2: zoom(2) } as const;
  const glowOf = (who: 1 | 2): number => (d.joined() ? (d.stateFor(who)?.glowLeft ?? 0) : 0);
  return {
    step() {
      if (!d.joined()) return;
      zooms[1].step(d.stateFor(1)?.slowLeft ?? 0);
      zooms[2].step(d.stateFor(2)?.slowLeft ?? 0);
    },
    edgeLevel: (who) => parryEdgeLevel(glowOf(who), reduced(), d.settings),
    edgeShown: (who) => glowOf(who) > 0 && !reduced(),
    reset() {
      zooms[1].reset();
      zooms[2].reset();
    },
  };
}
