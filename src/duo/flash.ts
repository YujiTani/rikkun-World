import { DUO_TUNING } from './tuning';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)「まぶしい 光」・§9.10、AC106）: 2 人の とき、わざを 出した 人の 半分だけ うすく 光る。
 * 2 人の ときは 全面の 光の 道（worldPass）を 通らない（4d-0）ので、かわりに その人の 半分に HTML の 重ね（`duo-flash-p1`／`-p2`）を 出す。
 * この ファイルは 透明度の 数えだけ（DOM・three を 使わない）。数は DUO_TUNING.flash。1 人の ときの 全面の 光は このファイルの 外（AC113）。
 */

/** その人の 絵が 出て いるか（1P の `thunderFx.active()`・`rainbowFx.active()` と 同じ 見方。2P の 絵は 2P の ほうの 絵） */
export interface FlashSrc {
  thunder: boolean;
  rainbow: boolean;
}

export interface DuoFlash {
  /** 毎ステップ 1 回（2P が いる あいだ）。引数は 使いまわせる */
  step(src: { 1: FlashSrc; 2: FlashSrc }): void;
  /** その人の 半分の 光の 今の 透明度 0〜DUO_TUNING.flash.alpha（`duo-flash-p1`／`-p2` の opacity に そのまま）。動きを へらす ときは 上限が 半分 */
  alpha(who: 1 | 2): number;
  /** 2P が やめた・参加した とき ぜんぶ 0 */
  reset(): void;
}

/** 動きを へらす ときの 光の 割合（1 人の ときの 光を 半分に する 考え方と 同じ） */
const REDUCED_MUL = 0.5;

export function createDuoFlash(o: { reducedMotion: () => boolean }): DuoFlash {
  /** 0〜1 の 出方（1 = いちばん 強い）。[1P, 2P] */
  const level = [0, 0];
  const bump = (i: 0 | 1, on: boolean): void => {
    const t = DUO_TUNING.flash;
    level[i] = on ? Math.min(1, level[i]! + 1 / t.inSteps) : Math.max(0, level[i]! - 1 / t.outSteps);
  };
  return {
    step(src) {
      bump(0, src[1].thunder || src[1].rainbow);
      bump(1, src[2].thunder || src[2].rainbow);
    },
    alpha(who) {
      return level[who - 1]! * DUO_TUNING.flash.alpha * (o.reducedMotion() ? REDUCED_MUL : 1);
    },
    reset() {
      level[0] = 0;
      level[1] = 0;
    },
  };
}
