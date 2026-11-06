import type { DuoTier, DuoView } from './types';

/**
 * COOP-1 作業 2（#399）: 画面の ようす（1 画面・ルーペ・分割。§2.3・§2.4・§9.2）を 決める 小さな 状態機械。DOM・Three.js なし。
 * これは 宣言だけ（実装は developer。中身は まだ 無い）。テストは view.test.ts。
 *
 * ---- つなぎ目の 約束 ----
 *   new DuoViewMachine({ reducedMotion })   時間は 持たず、step() を 固定ステップ（1/60 秒）ごとに 1 回 呼ぶ。最初は 'one'・tier 0。
 *   step({ distance, p2Ndc })               distance = 2 人の 体の 中心どうしの 直線（マス）。p2Ndc = 2P の 足もとを 1P の カメラで 映した 位置（-1〜1。
 *                                           画面の 外なら 絶対値が 1 を こえる。カメラの うしろ・計算できないときは null = 外）。
 *   色の 段 tier は nextTier(prev, distance)（meter.ts）。ただし 分割の あいだは 2 段目の まま（§9.2: 17 以下の 瞬間に 1 画面へ 戻る ときに 同時に 1 段目）。
 *   ようす: 24 以上で 分割（ルーペからも 1 画面からも）。分割から 戻るのは 17 以下が 60 ステップ つづいた とき（とちゅうで 17 より 大きくなれば 数え直し）。
 *           戻る先は 2P が 画面の 内側 90% の 外なら 'loupe'、中なら 'one'。
 *           1 画面 → ルーペ: p2Ndc が 90%（max(|x|,|y|) > 0.9）の 外に 18 ステップ つづいた とき（内側に 入れば 数え直し）。
 *           ルーペ → 1 画面: 80%（max(|x|,|y|) <= 0.8）の 中に 18 ステップ つづいた とき（0.8〜0.9 の あいだは どちらにも 数えない = ゆれ止め）。
 *           ようすを 切りかえたら 60 ステップは 次の ようすの 切りかえを しない（待っている あいだも 数えは つづける）。色の 段には この 待ちは ない。
 *   transition()                            ようすの 切りかえの 見せ方の 進み。普通: ルーペが 出る/消える 約 12 ステップ、分割へ/から 約 24 ステップ。
 *                                           reducedMotion（動きを 減らす 設定）のときは どれも 9 ステップ（0.15 秒）以内。
 */
export interface DuoViewInput {
  distance: number;
  p2Ndc: { x: number; y: number } | null;
}

export interface DuoViewResult {
  view: DuoView;
  tier: DuoTier;
  /** この step で ようすが かわった */
  switched: boolean;
}

export interface DuoViewTransition {
  active: boolean;
  /** 0〜1 */
  progress: number;
}

export interface DuoViewOptions {
  reducedMotion?: boolean;
}

export class DuoViewMachine {
  constructor(_opts: DuoViewOptions = {}) {
    throw new Error('COOP-1 作業 2: DuoViewMachine は まだ 実装されていない');
  }
  step(_input: DuoViewInput): DuoViewResult {
    throw new Error('COOP-1 作業 2: 未実装');
  }
  get view(): DuoView {
    throw new Error('COOP-1 作業 2: 未実装');
  }
  get tier(): DuoTier {
    throw new Error('COOP-1 作業 2: 未実装');
  }
  transition(): DuoViewTransition {
    throw new Error('COOP-1 作業 2: 未実装');
  }
}
