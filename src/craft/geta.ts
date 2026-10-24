import type { ArmorSlot, ItemId } from '../contracts';
import { SAMURAI_GEAR } from './config';
import { NINJA_TUNING } from './ninjaTuning';

/** 下駄の 1 歩に 使う プレイヤーの 状態（固定ステップごとに 1 回わたす） */
export interface GetaPlayer {
  /** 走る 入力が 効いて いる（Shift ＋ 移動） */
  running: boolean;
  onGround: boolean;
  inWater: boolean;
  /** 横の 速さ（ブロック/秒）の もと */
  velocity: { x: number; z: number };
}

/**
 * SAMURAI-1 §4.6 明珍下駄: 走って いる 時間で 1 歩を 数える（キャラの 絵の 状態は 読まない）。
 * 下駄を 着て・走る 入力が 効いて・地面に 立って・水の 外で・横の 速さが getaMinSpeed 以上の ステップだけ 1 ずつ 足し、
 * getaStepTicks に なる たびに onStep を 1 回 呼んで 0 に もどす。ひとつでも 欠けたら 0 に もどす。
 */
export class GetaStepper {
  private n = 0;

  constructor(
    private readonly armor: { equipped(slot: ArmorSlot): ItemId | null },
    private readonly onStep: () => void,
  ) {}

  step(p: GetaPlayer): void {
    if (this.armor.equipped('legs') !== SAMURAI_GEAR.legs) {
      this.n = 0;
      return;
    }
    const min = NINJA_TUNING.getaMinSpeed;
    const going = p.running && p.onGround && !p.inWater && p.velocity.x * p.velocity.x + p.velocity.z * p.velocity.z >= min * min;
    if (!going) {
      this.n = 0;
      return;
    }
    this.n++;
    if (this.n >= NINJA_TUNING.getaStepTicks) {
      this.n = 0;
      this.onStep();
    }
  }

  /** いまの 数え（テスト用） */
  ticks(): number {
    return this.n;
  }
}
