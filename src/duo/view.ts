import { nextTier } from './meter';
import { DUO_TUNING } from './tuning';
import type { DuoTier, DuoView } from './types';

/**
 * COOP-1 作業 2（#399）: 画面の ようす（1 画面・ルーペ・分割。§2.3・§2.4・§9.2）を 決める 小さな 状態機械。DOM・Three.js なし。
 * テストは view.test.ts。
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
  private _view: DuoView = 'one';
  private _tier: DuoTier = 0;
  /** 次の ようすの 切りかえまで あと何ステップ（0 = 切りかえてよい） */
  private wait = 0;
  /** 2P が 90% の 外に つづけて いる ステップ / 80% の 中に つづけて いる ステップ / 分割から 戻れる 距離に つづけて いる ステップ */
  private outSteps = 0;
  private inSteps = 0;
  private backSteps = 0;
  private transLeft = 0;
  private transTotal = 1;
  private readonly reduced: boolean;

  constructor(opts: DuoViewOptions = {}) {
    this.reduced = opts.reducedMotion === true;
  }

  step(input: DuoViewInput): DuoViewResult {
    if (this.wait > 0) this.wait--;
    if (this.transLeft > 0) this.transLeft--;
    const { distance, p2Ndc } = input;
    const out = p2Ndc === null || Math.max(Math.abs(p2Ndc.x), Math.abs(p2Ndc.y)) > DUO_TUNING.loupeOutRatio;
    const inner = p2Ndc !== null && Math.max(Math.abs(p2Ndc.x), Math.abs(p2Ndc.y)) <= DUO_TUNING.loupeInRatio;
    this.outSteps = out ? this.outSteps + 1 : 0;
    this.inSteps = inner ? this.inSteps + 1 : 0;
    this.backSteps = distance <= DUO_TUNING.splitDownAt ? this.backSteps + 1 : 0;

    const from = this._view;
    let to: DuoView = from;
    if (this.wait === 0) to = this.decide(from, distance, out);
    let switched = false;
    if (to !== from) {
      this._view = to;
      switched = true;
      this.wait = DUO_TUNING.viewWaitSteps;
      this.outSteps = 0;
      this.inSteps = 0;
      this.backSteps = 0;
      this.transTotal = this.reduced ? DUO_TUNING.transitionSteps.reduced : from === 'split' || to === 'split' ? DUO_TUNING.transitionSteps.split : DUO_TUNING.transitionSteps.loupe;
      this.transLeft = this.transTotal;
    }
    // 色の 段: 分割の あいだは 2 段目の まま。分割を 出る ステップは 今の 距離で 決め直す
    this._tier = this._view === 'split' ? 2 : nextTier(this._tier, distance);
    return { view: this._view, tier: this._tier, switched };
  }

  private decide(from: DuoView, distance: number, out: boolean): DuoView {
    if (from !== 'split' && distance >= DUO_TUNING.splitUpAt) return 'split';
    if (from === 'split') return this.backSteps >= DUO_TUNING.splitBackSteps ? (out ? 'loupe' : 'one') : from;
    if (from === 'one') return this.outSteps >= DUO_TUNING.loupeHoldSteps ? 'loupe' : from;
    return this.inSteps >= DUO_TUNING.loupeHoldSteps ? 'one' : from;
  }

  get view(): DuoView {
    return this._view;
  }
  get tier(): DuoTier {
    return this._tier;
  }

  transition(): DuoViewTransition {
    const active = this.transLeft > 0;
    return { active, progress: active ? 1 - this.transLeft / this.transTotal : 1 };
  }
}
