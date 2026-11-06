import { DUO_TUNING } from './tuning';
import type { DuoView } from './types';

/**
 * COOP-1 作業 3e（#422。1.8）: 画面の ようす（1 人の 全面・左右分割。§2.3・§2.4・§9.2）を 決める 小さな 状態機械。DOM・Three.js なし。
 * テストは view.test.ts。距離も 2P の 位置も 見ない: 2P が 参加して いれば 'split'、いなければ 'one'。
 *
 * ---- つなぎ目の 約束 ----
 *   new DuoViewMachine({ reducedMotion })   時間は 持たず、step() を 固定ステップ（1/60 秒）ごとに 1 回 呼ぶ（2P が いなくても 毎ステップ）。最初は 'one'。
 *   step({ joined })                        joined = 2P が 参加している。かわった その ステップに switched = true。
 *   transition()                            ようすの 切りかえの 見せ方の 進み。ふつう 24 ステップ、動きを 減らす 設定は 9 ステップ（参加でも やめるでも 同じ）。
 */
export interface DuoViewInput {
  joined: boolean;
}

export interface DuoViewResult {
  view: DuoView;
  /** この step で ようすが かわった（参加して 分かれた ステップは switched && view === 'split'） */
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
  private transLeft = 0;
  private transTotal = 1;
  private readonly reduced: boolean;
  /** step の 返す 入れもの（毎ステップ 新しく 作らない。次の step まで 有効） */
  private readonly result: DuoViewResult = { view: 'one', switched: false };

  constructor(opts: DuoViewOptions = {}) {
    this.reduced = opts.reducedMotion === true;
  }

  /** 返す 物は 使いまわす: 次の step を 呼ぶ 前に 読む */
  step(input: DuoViewInput): DuoViewResult {
    if (this.transLeft > 0) this.transLeft--;
    const to: DuoView = input.joined ? 'split' : 'one';
    const switched = to !== this._view;
    if (switched) {
      this._view = to;
      this.transTotal = this.reduced ? DUO_TUNING.transitionSteps.reduced : DUO_TUNING.transitionSteps.split;
      this.transLeft = this.transTotal;
    }
    this.result.view = this._view;
    this.result.switched = switched;
    return this.result;
  }

  get view(): DuoView {
    return this._view;
  }

  transition(): DuoViewTransition {
    const active = this.transLeft > 0;
    return { active, progress: active ? 1 - this.transLeft / this.transTotal : 1 };
  }
}
