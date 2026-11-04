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

/** 地面を 歩いて いるか（地面・水の 外・横の 速さ getaMinSpeed 以上）。下駄と 足音（FOOTSTEPS）で 共用 */
export function striding(p: Omit<GetaPlayer, 'running'>): boolean {
  const min = NINJA_TUNING.getaMinSpeed;
  return p.onGround && !p.inWater && p.velocity.x * p.velocity.x + p.velocity.z * p.velocity.z >= min * min;
}

/** 歩いて いる ステップを 数え、every に なったら true を 返して 0 に もどす（歩いて いなければ 0）。下駄と 足音で 共用 */
export class StepCounter {
  n = 0;
  tick(going: boolean, every: number): boolean {
    if (!going) {
      this.n = 0;
      return false;
    }
    if (++this.n < every) return false;
    this.n = 0;
    return true;
  }
}

/**
 * SAMURAI-1 §4.6 明珍下駄: 走って いる 時間で 1 歩を 数える（キャラの 絵の 状態は 読まない）。
 * 下駄を 着て・走る 入力が 効いて・地面に 立って・水の 外で・横の 速さが getaMinSpeed 以上の ステップだけ 1 ずつ 足し、
 * getaStepTicks に なる たびに onStep を 1 回 呼んで 0 に もどす。ひとつでも 欠けたら 0 に もどす。
 */
export class GetaStepper {
  private readonly c = new StepCounter();

  constructor(
    private readonly armor: { equipped(slot: ArmorSlot): ItemId | null },
    private readonly onStep: () => void,
  ) {}

  /** 下駄で 走って いる ステップは true（このときは ふつうの 足音を 鳴らさない。FOOTSTEPS §2） */
  step(p: GetaPlayer): boolean {
    const on = this.armor.equipped('legs') === SAMURAI_GEAR.legs && p.running && striding(p);
    if (this.c.tick(on, NINJA_TUNING.getaStepTicks)) this.onStep();
    return on;
  }

  /** いまの 数え（テスト用） */
  ticks(): number {
    return this.c.n;
  }
}
