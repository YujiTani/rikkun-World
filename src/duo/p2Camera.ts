import type { DuoView } from './types';

/**
 * COOP-1 作業 2（#399）: 2P の 向きと カメラ（§2.5・AC26）。テストは p2Camera.test.ts。
 *
 * ---- つなぎ目の 約束 ----
 *   new P2Camera()   step() を 固定ステップごとに 1 回 呼ぶ。
 *   step({ view, screenYawDeg, lookDeltaDeg, stickHeld })
 *     screenYawDeg = 今の 大きい 画面（1P の カメラ）の 向き（`player.get().yawDeg` と 同じ 決まり）。lookDeltaDeg = 2P の 右スティックの この ステップの 回転（度。+ が 右）。
 *     stickHeld = 2P の 左スティックを 倒している。
 *     返す camYawDeg = 分割で 2P の カメラが 向く 向き。'one'・'loupe' の あいだは screenYawDeg に ついていく。
 *       'split' に かわる ステップの 値は 直前の 画面の 向き（screenYawDeg）と 1° 以内で 同じ。そのあとは lookDeltaDeg だけで 回り、screenYawDeg には 引きずられない。
 *     返す walkYawDeg = 2P の 左スティックの「上」が 向かう 向き。'one'・'loupe' では screenYawDeg、'split' では camYawDeg。
 *       分割 → 1 画面に 戻ったとき stickHeld が 続いている あいだは 前の 向き（分割の camYawDeg）のまま。はなしたら screenYawDeg。
 */
export interface P2CameraInput {
  view: DuoView;
  screenYawDeg: number;
  lookDeltaDeg: number;
  stickHeld: boolean;
}

export interface P2CameraOutput {
  camYawDeg: number;
  walkYawDeg: number;
}

export class P2Camera {
  private camYaw = 0;
  private prevView: DuoView = 'one';
  /** 分割から 戻った あと、左スティックを はなすまで 使う 歩く 向き（null = 使わない） */
  private heldWalk: number | null = null;

  step(input: P2CameraInput): P2CameraOutput {
    const { view, screenYawDeg, lookDeltaDeg, stickHeld } = input;
    let walk: number;
    if (view === 'split') {
      if (this.prevView !== 'split') this.camYaw = screenYawDeg;
      this.camYaw += lookDeltaDeg;
      this.heldWalk = null;
      walk = this.camYaw;
    } else {
      if (this.prevView === 'split' && stickHeld) this.heldWalk = this.camYaw;
      if (!stickHeld) this.heldWalk = null;
      this.camYaw = screenYawDeg;
      walk = this.heldWalk ?? screenYawDeg;
    }
    this.prevView = view;
    return { camYawDeg: this.camYaw, walkYawDeg: walk };
  }
}
