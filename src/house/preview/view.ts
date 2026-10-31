// HOUSE-1B 見本の 見る 向き（まわす・見おろす 角度）。three なし。
//   PR-1: ふれる 前の ゆっくり 自動で 回る 向きだけ。PR-2 で ドラッグ（drag）・窓を 見せる なめらかな 回り（turnTo）を 足す。
import type { Wall } from '../editor/tuning';
import { PREVIEW } from './tuning';

const wrap = (deg: number): number => ((deg % 360) + 360) % 360;

/** かべの 外向きの 向き（x, z） */
export const OUTWARD: Readonly<Record<Wall, readonly [number, number]>> = { front: [0, 1], right: [1, 0], back: [0, -1], left: [-1, 0] };

/** 見本 1 つの 見る 向き。1 ステップ ＝ 1/60 秒 */
export class ViewCtl {
  yaw: number = PREVIEW.stillYawDeg;
  elev: number;
  /** 手で さわった（PR-2 の ドラッグ。さわったら 自動の 回りを やめる） */
  touched = false;

  constructor(private readonly elev0: number) {
    this.elev = elev0;
  }

  /** はじめの 向き（まえ から ＝ 戸が 見える。ゆっくり 回りはじめる） */
  reset(): void {
    this.yaw = PREVIEW.stillYawDeg;
    this.elev = this.elev0;
    this.touched = false;
  }

  /** 1 コマ。spin ＝ 自動で 回って よいか（動きを へらす 設定では false） */
  step(spin: boolean): void {
    if (!this.touched && spin) this.yaw = wrap(this.yaw + 360 / PREVIEW.lapFrames);
  }
}
