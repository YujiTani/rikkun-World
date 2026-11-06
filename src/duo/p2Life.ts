import type { Vec3, YokaiKind } from '../contracts';
import type { PlayerCombatImpl } from '../combat/PlayerCombat';

/** 2P に とどく ダメージの 元。プレイヤーの こうげきは 仲間には 当たらない（AC37） */
export type HitSource = { type: 'yokai'; kind?: YokaiKind; from?: Vec3 } | { type: 'player'; who: 1 | 2 };

export interface P2LifeDeps {
  /** 2P 用の PlayerCombatImpl（体力・おまもり・落ちる・袋の 持ち主） */
  combat: PlayerCombatImpl;
  /** 1P が 倒れているか（倒れている あいだは 2P は 戻らず 待つ。AC44） */
  p1Down: () => boolean;
  /** 戻った ステップに 1 回 */
  onReturn?: () => void;
  /** 1P を 待っている ステップごとに 1 回（AC44。位置を とめるため） */
  onWait?: () => void;
  /** 倒れた ステップに 1 回 */
  onDown?: () => void;
}

/** 2P の 体力まわりを 包む 係（DOM・Three.js なし）。戻るまでの 数えは ここで する */
export class P2Life {
  private tracked = false;
  private left = 0;
  private waiting = false;

  constructor(private readonly d: P2LifeDeps) {}

  get hp(): number {
    return this.d.combat.hp();
  }
  get maxHp(): number {
    return this.d.combat.maxHp();
  }
  get down(): boolean {
    return this.d.combat.dead();
  }
  /** 戻るまでの のこり ステップ（倒れていないとき・1P を 待っているとき 0） */
  get returnLeft(): number {
    return this.tracked && !this.waiting ? this.left : 0;
  }

  damage(amount: number, from: HitSource): { applied: number; knock: boolean } {
    if (from.type === 'player') return { applied: 0, knock: false };
    const c = this.d.combat;
    if (c.dead()) return { applied: 0, knock: false };
    const before = c.hp();
    // from が なければ のけぞらない（debugDamage は from なし）
    if (from.from) c.damage(amount, from.kind ?? 'karakasa', from.from);
    else c.debugDamage(amount, from.kind ?? 'karakasa');
    this.noticeDown();
    const applied = before - c.hp();
    return { applied, knock: applied > 0 };
  }

  /** レベルアップ: ハートを 満タンに（倒れているときは 何もしない） */
  fill(): void {
    this.d.combat.healFull();
  }

  /** 毎ステップ */
  step(): void {
    const c = this.d.combat;
    if (this.tracked) {
      if (this.left <= 1 && this.d.p1Down()) {
        this.waiting = true;
        this.d.onWait?.();
        return;
      }
      this.waiting = false;
      this.left--;
    }
    c.update();
    if (this.tracked && !c.dead()) {
      this.tracked = false;
      this.left = 0;
      this.d.onReturn?.();
    }
    this.noticeDown();
  }

  private noticeDown(): void {
    if (this.tracked || !this.d.combat.dead()) return;
    this.tracked = true;
    this.left = this.d.combat.config.respawnDelayTicks;
    this.waiting = false;
    this.d.onDown?.();
  }
}
