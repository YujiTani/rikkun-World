import { ActionState, type Action } from '../input/actions';
import { walkHeadingDeg } from './move';

/** 画面の 向きで 歩くための 4 方向（これらは 向きに 置きかえて 読む） */
const MOVE_ACTIONS: readonly Action[] = ['moveForward', 'moveBack', 'moveLeft', 'moveRight'];

/**
 * 1 画面・ルーペの とき 2P を 歩かせる 入力（§2.5）。元の ActionState（2P の パッド）の 4 方向を
 * 「画面の 向き（1P の カメラ）の 奥」に 置きかえる: 倒している ときは moveForward だけ 押している ことにして、
 * 歩く 向きは `heading()` で PlayerController の yaw に 入れる。それ以外の Action（ジャンプ・はしる…）は 元のまま。
 */
export class WalkRelativeActions extends ActionState {
  private deg: number | null = null;
  /** false なら 4 方向も 元のまま（分割で 2P が 自分の カメラで 歩くとき） */
  relative = true;

  constructor(private readonly src: ActionState) {
    super();
  }

  /** 毎ステップ、PlayerController.update の 前に 呼ぶ。cameraYawDeg = 1P の カメラの 向き */
  sync(cameraYawDeg: number): void {
    const s = this.src;
    const fwd = (s.isHeld('moveForward') ? 1 : 0) - (s.isHeld('moveBack') ? 1 : 0);
    const right = (s.isHeld('moveRight') ? 1 : 0) - (s.isHeld('moveLeft') ? 1 : 0);
    this.deg = this.relative ? walkHeadingDeg(fwd, right, cameraYawDeg) : null;
  }

  /** 歩く 向き（度）。倒していない ときは null */
  heading(): number | null {
    return this.deg;
  }

  override isHeld(action: Action): boolean {
    if (!this.relative || !MOVE_ACTIONS.includes(action)) return this.src.isHeld(action);
    return action === 'moveForward' && this.deg !== null;
  }

  override wasPressed(action: Action): boolean {
    return this.src.wasPressed(action);
  }
}
