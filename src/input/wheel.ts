import type { ActionState } from './actions';
import { WHEEL_CONFIG } from './config';

/**
 * マウスホイールの動き（deltaY）をためて、50 ごとに hotbarNext / hotbarPrev を 1 回押す。
 * ロックが外れている・もちもの画面のあいだは受け付けず、ためた量も捨てる。
 * 下（deltaY が正）= 右のマス（hotbarNext）。向きが変わったらためた量は捨てる。
 */
export class WheelAccumulator {
  private acc = 0;

  constructor(
    private readonly actions: ActionState,
    private readonly enabled: () => boolean,
  ) {}

  /** DOM の WheelEvent 用。deltaMode: 0 = ピクセル, 1 = 行, 2 = ページ */
  pushEvent(deltaY: number, deltaMode: number): void {
    const unit = deltaMode === 1 ? WHEEL_CONFIG.linePixels : deltaMode === 2 ? WHEEL_CONFIG.pagePixels : 1;
    this.push(deltaY * unit);
  }

  /** ピクセル単位の動き（テストの input.wheel も同じ入口） */
  push(deltaY: number): void {
    if (!this.enabled()) {
      this.acc = 0;
      return;
    }
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    if (Math.sign(deltaY) !== Math.sign(this.acc)) this.acc = 0;
    this.acc += deltaY;
    const step = WHEEL_CONFIG.pixelsPerSlot;
    while (Math.abs(this.acc) >= step) {
      const action = this.acc > 0 ? 'hotbarNext' : 'hotbarPrev';
      this.acc -= Math.sign(this.acc) * step;
      this.actions.press(action);
      this.actions.release(action);
    }
  }

  /** ホイールをゲームが使う状態か（使わないときは ブラウザの スクロールを止めない） */
  isActive(): boolean {
    return this.enabled();
  }

  reset(): void {
    this.acc = 0;
  }
}
