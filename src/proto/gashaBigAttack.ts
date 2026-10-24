/**
 * #293 試作: 怒りの 攻撃サイクル（画面・DOM には さわらない。ユニットテストで 動かせる）。
 *  怒る → ならし（gap）→ 攻撃（attack）× 3〜5 回（間に ならし。3 回目の あとから 毎回 休む くじ、5 回目の あとは 必ず 休む）→ つかれて 休む（tired。30〜40 秒）→ また ならし …
 *  攻撃の 種類は 調整表 `attack.table` の 行（名前と 重み）。行を 足すだけで ふやせる。くじは シード付き。
 *  攻撃の 動きそのものは 呼ぶ 側（gashaBigActor.ts）が 名前で 出し分ける。数は gashaBigTuning.ts の attack・tired。
 */
import { TUNE as T } from './gashaBigTuning';

export type CyclePhase = 'off' | 'gap' | 'attack' | 'tired';

export interface CycleEvent {
  /** この コマで 攻撃を はじめる（名前） */
  start?: string;
  /** この コマで 休みが おわった（次の サイクルの ならしに はいる） */
  tiredEnd?: boolean;
}

function makeRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class AttackCycle {
  phase: CyclePhase = 'off';
  /** この サイクルで 出す 攻撃の 回数の 上限（maxCount）。回数は くじで 決まる（minCount〜maxCount） */
  count = 0;
  /** この サイクルで 出し終えた 攻撃の 数 */
  done = 0;
  /** いま 出している 攻撃の 名前（attack の 間） */
  current: string | null = null;
  /** ならし・休みの のこり（秒） */
  left = 0;
  /** はじめた サイクルの 数 */
  cycles = 0;
  private readonly rnd: () => number;

  constructor(seed: number = T.attack.seed) { this.rnd = makeRnd(seed); }

  private randIn(r: readonly [number, number]): number { return r[0] + this.rnd() * (r[1] - r[0]); }

  /** 新しい サイクルを はじめる（怒った とき）。最初の 攻撃までは firstGapSec */
  begin(): void {
    const A = T.attack;
    this.count = Math.max(1, Math.round(A.maxCount));
    this.done = 0;
    this.current = null;
    this.phase = 'gap';
    this.left = A.firstGapSec;
    this.cycles++;
  }

  /** 怒りが 解けた: サイクルを 止める */
  reset(): void { this.phase = 'off'; this.current = null; this.left = 0; this.done = 0; this.count = 0; }

  private pick(): string {
    const t = T.attack.table;
    let sum = 0;
    for (const r of t) sum += Math.max(0, r.weight);
    let x = this.rnd() * sum;
    for (const r of t) { x -= Math.max(0, r.weight); if (x < 0) return r.name; }
    return t[t.length - 1]!.name;
  }

  /** 1 コマ。ならしが おわれば 攻撃を はじめ、休みが おわれば 次の サイクルへ */
  update(dt: number): CycleEvent {
    if (this.phase === 'gap') {
      this.left -= dt;
      if (this.left <= 0) { this.phase = 'attack'; this.current = this.pick(); this.left = 0; return { start: this.current }; }
    } else if (this.phase === 'tired') {
      this.left -= dt;
      if (this.left <= 0) { this.begin(); this.left = this.randIn(T.attack.gapSec); return { tiredEnd: true }; }
    }
    return {};
  }

  /** 攻撃が おわった（呼ぶ 側が 動きを おえた とき）。回数に 達したら つかれる、まだなら ならし */
  attackEnded(): void {
    if (this.phase !== 'attack') return;
    this.done++;
    this.current = null;
    const A = T.attack;
    const rest = this.done >= this.count || (this.done >= Math.round(A.minCount) && this.rnd() < A.restChance);
    if (rest) this.forceTired();
    else { this.phase = 'gap'; this.left = this.randIn(T.attack.gapSec); }
  }

  // ---- デバッグ・テスト用
  forceAttack(name: string): void { this.phase = 'attack'; this.current = name; this.left = 0; }
  forceTired(sec?: number): void { this.phase = 'tired'; this.current = null; this.left = sec ?? this.randIn(T.tired.restSec); }
}
