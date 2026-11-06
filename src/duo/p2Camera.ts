/**
 * COOP-1 作業 3e（#422。1.8）: 2P の 向きと カメラ（§2.5・AC26・AC86）。テストは p2Camera.test.ts。
 * 2P は いつも 自分の カメラ（1P と 同じ）: 右スティックだけで 回り、左スティック上は その カメラの 奥へ 歩く。
 *
 * ---- つなぎ目の 約束 ----
 *   new P2Camera()   step() を 固定ステップごとに 1 回 呼ぶ（2P が いる あいだ）。
 *   step({ screenYawDeg, lookDeltaDeg })
 *     screenYawDeg = 1P の カメラの 向き（`player.get().yawDeg` と 同じ 決まり）。lookDeltaDeg = 2P の 右スティックの この ステップの 回転（度。+ が 右）。
 *     作った あと（reset() の あと）の 最初の step だけ camYawDeg = screenYawDeg（参加した 瞬間は 1P の カメラと 同じ）。そのあとは lookDeltaDeg だけで 回る。
 *     返す walkYawDeg = いつも camYawDeg。
 *   reset()   2P が やめた とき（つぎの step は また 1P の 向きに そろえる）。
 */
export interface P2CameraInput {
  screenYawDeg: number;
  lookDeltaDeg: number;
}

export interface P2CameraOutput {
  camYawDeg: number;
  walkYawDeg: number;
}

export class P2Camera {
  private camYaw = 0;
  private started = false;
  /** 毎ステップ 使いまわす 返り値（新しい 物を 作らない） */
  private readonly out: P2CameraOutput = { camYawDeg: 0, walkYawDeg: 0 };

  step(input: P2CameraInput): P2CameraOutput {
    if (!this.started) {
      this.started = true;
      this.camYaw = input.screenYawDeg;
    }
    this.camYaw += input.lookDeltaDeg;
    this.out.camYawDeg = this.camYaw;
    this.out.walkYawDeg = this.camYaw;
    return this.out;
  }

  reset(): void {
    this.started = false;
  }
}
