import type { ArmorSlot, CombatEvent, ItemId, Vec3, YokaiWorld } from '../contracts';
import { NINJA_GEAR } from '../craft/config';
import { NINJA_TUNING } from '../craft/ninjaTuning';

/**
 * NINJA-1 §4.3 忍びの手甲: 刀・素手で 妖怪に 当てるたび、おくれて 小太刀が 追い打ち（＋ tekkoDamage）。
 * 数（おくれ・ダメージ・待ちの 上限）は 調整表 ninjaTuning.ts。
 *  ・聞く 出来事は パンチ `punchHit` と 刀の わざ `techHit` だけ（弓 `arrowHit`・真空波・らせん・雷・ドーム・パリィ・マッチョの パンチ・追い打ち自身は 専用の 出来事が 無い ので 自然に 対象外）。
 *  ・1 回の 当たり（1 体ごと）に 1 回。当てた ときを 0 として tekkoDelayTicks 回目の step() で 出る。
 *  ・追い打ちは 押さない・よろけの 2 倍を 使わない（YokaiManager.damage の by = 'kodachi'）。待って いる 間に 手甲を ぬいでも 出る。
 *  ・その とき 妖怪が たおれた・消えた → 何も しない。追い打ちで たおれたら ふつうに たおした こと。
 *  ・がしゃどくろにも 効く: 当たった 部位に 同じ 時間 あとで big.damage(部位, 追い打ちの ダメージ)（部位の 倍率・防御力は BigHit が かける）。
 * 呼ぶ 順番: 毎ステップ、先に step()、そのあと そのステップの 出来事を onCombatEvent に 入れる（当てた ステップを 0 に する ため）。
 */
export interface KodachiEnv {
  armor: { equipped(slot: ArmorSlot): ItemId | null };
  yokai: Pick<YokaiWorld, 'list' | 'damage'>;
  /** 追い打ちの 向き（押さない ので 位置の 目安だけ） */
  playerPos(): Vec3;
  /** がしゃどくろの 体（BigHit）。なければ 箱への 追い打ちは なし */
  big?: { damage(part: string, amount: number, at: Vec3 | null, source: string): number };
  /** 出来事に つける ステップの 番号（なければ step() の 回数） */
  tick?: () => number;
  /** 追い打ちが 出た（絵・音用。妖怪 1 体 = yokaiId、がしゃどくろの 箱 = yokaiId null と part） */
  onFire?(info: { yokaiId: number | null; part: string | null; damage: number }): void;
}

export interface KodachiHitEvent {
  type: 'kodachiHit';
  tick: number;
  yokaiId: number;
  damage: number;
}

interface Pending {
  yokaiId: number | null;
  part: string | null;
  left: number;
}

type HitLike = Readonly<{ type: string; yokaiId?: number }>;

export class Kodachi {
  private queue: Pending[] = [];
  private events: KodachiHitEvent[] = [];
  private ticks = 0;

  constructor(private readonly env: KodachiEnv) {}

  private wearing(): boolean {
    return this.env.armor.equipped('arms') === NINJA_GEAR.arms;
  }

  private push(p: Pending): void {
    this.queue.push(p);
    // 待ちの 上限: 古い ものから 出さない（すてる）
    while (this.queue.length > NINJA_TUNING.tekkoQueueMax) this.queue.shift();
  }

  /** パンチ `punchHit`・刀の わざ `techHit` を 聞く（ほかの 出来事は 無視） */
  onCombatEvent(e: HitLike | CombatEvent): void {
    if ((e.type !== 'punchHit' && e.type !== 'techHit') || !this.wearing()) return;
    const id = (e as HitLike).yokaiId;
    if (typeof id !== 'number') return;
    this.push({ yokaiId: id, part: null, left: Math.max(1, Math.floor(NINJA_TUNING.tekkoDelayTicks)) });
  }

  /** がしゃどくろの 箱（部位）に 刀・パンチが 当たった */
  onBigHit(part: string): void {
    if (!this.wearing()) return;
    this.push({ yokaiId: null, part, left: Math.max(1, Math.floor(NINJA_TUNING.tekkoDelayTicks)) });
  }

  /** 1 ステップ（固定ステップ）。待ちの 数だけ 見る */
  step(): void {
    this.ticks++;
    if (this.queue.length === 0) return;
    const due: Pending[] = [];
    const rest: Pending[] = [];
    for (const p of this.queue) {
      p.left--;
      (p.left <= 0 ? due : rest).push(p);
    }
    this.queue = rest;
    for (const p of due) this.fire(p);
  }

  private fire(p: Pending): void {
    const dmg = NINJA_TUNING.tekkoDamage;
    if (p.part !== null) {
      if (!this.env.big) return;
      const dealt = this.env.big.damage(p.part, dmg, null, 'kodachi');
      if (dealt > 0) this.env.onFire?.({ yokaiId: null, part: p.part, damage: dealt });
      return;
    }
    const id = p.yokaiId!;
    const y = this.env.yokai.list().find((q) => q.id === id);
    if (!y || y.state === 'dying' || y.state === 'leaving') return;
    const dealt = this.env.yokai.damage(id, dmg, this.env.playerPos(), { dist: 0, up: 0 }, 'kodachi');
    if (typeof dealt === 'number' && dealt > 0) {
      this.events.push({ type: 'kodachiHit', tick: this.env.tick?.() ?? this.ticks, yokaiId: id, damage: dealt });
      this.env.onFire?.({ yokaiId: id, part: null, damage: dealt });
    }
  }

  /** `kodachiHit` の 列（読むと 空に なる） */
  drainEvents(): KodachiHitEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** 待ちを ぜんぶ すてる（セーブの 読みこみ・世界の きりかえ。前の 世界の 妖怪 id に 当たらない ように） */
  clear(): void {
    this.queue = [];
  }

  /** 待って いる 追い打ちの 数 */
  pending(): number {
    return this.queue.length;
  }
}
