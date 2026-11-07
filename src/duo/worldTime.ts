import type { ScreenMode } from '../contracts';
import { duoTimeScale } from './rules';

/**
 * COOP-1 4d-0（docs/design/COOP-1.md §3.6 (a)「かけ合わせ」「2 人 同時」・§9.10）: 世界ぜんたいの 時間の 倍率の まとめ方。
 * 純粋な 関数だけ。three・DOM を 使わない。テストは worldTime.test.ts。
 */

/**
 * その時 いる 人の パリィの 倍率（1 人の ときは 1P の 1 つ、2 人の ときは 1P と 2P）の「小さい 方」。かけ算 しない
 * （2 人 同時でも 0.25 のまま）。空なら 1。受けとった 配列は こわさない
 */
export function parryTimeScale(scales: readonly number[]): number {
  let m = 1;
  for (let i = 0; i < scales.length; i++) {
    const s = scales[i]!;
    if (s < m) m = s;
  }
  return m;
}

export interface WorldTimeInput {
  /** `screen.mode()` */
  mode: ScreenMode;
  /** `screen.timeScale()`（案内中 0・もちもの画面 `inventoryTimeScale`・遊び 1） */
  screenScale: number;
  /** 2P が いる */
  joined: boolean;
  /** `shared.parryScales()`（その時 いる 人の パリィの 倍率） */
  parryScales: readonly number[];
}

/**
 * `Game.setTimeScale` に 渡す 倍率。画面の 倍率 × パリィの 倍率。
 * パリィを かけるのは「2 人の ときは いつも」（2P も パリィ できる ので、1P が もちもの画面でも）、
 * 「1 人の ときは 遊び画面（'play'）の ときだけ」（今の 決まり）。
 */
export function worldTimeScale(i: WorldTimeInput): number {
  const screen = i.mode === 'inventory' ? duoTimeScale(i.screenScale, i.joined) : i.screenScale;
  const withParry = i.joined || i.mode === 'play';
  return screen * (withParry ? parryTimeScale(i.parryScales) : 1);
}
