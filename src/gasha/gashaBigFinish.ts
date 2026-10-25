/**
 * #293 とどめの 流れ(FIX-BRIEF-2 §5)の 時間の 進みだけ(3D も 音も 知らない 純粋な 部分)。
 *   blow(とどめの 一撃: ヒットストップ・はじく)→ fall(ゆっくり 倒れる)→ lie(ふせて コアが 赤い。たたける)→ crumble(コアを こわした あと ボロボロに くずれる)→ gone(消えた)
 * 見た目・音・ドロップは gashaBig.ts と release.ts が イベントを 受けて つける。数は gashaBigTuning.ts の finish。
 */
import { TUNE as T } from './gashaBigTuning';

export type FinishPhase = 'off' | 'blow' | 'fall' | 'lie' | 'crumble' | 'gone';
export interface FinishEvent {
  kind: 'blow' | 'fall' | 'lie' | 'coreHit' | 'crumble' | 'gone';
  /** coreHit: 何回目の 一撃か(1 はじまり) / ほか: 0 */
  n: number;
  /** coreHit: のこりの 回数 */
  left: number;
}

/** 倒れる 速さの くせ(0〜1 → 0〜1)。ease が 大きい ほど はじめ ゆっくり、あと 速い */
export function fallEase(k: number, ease: number): number {
  const c = Math.min(1, Math.max(0, k));
  return Math.pow(c, Math.max(0.01, ease));
}

export class FinishSeq {
  phase: FinishPhase = 'off';
  /** その 場面に 入ってから の 秒 */
  t = 0;
  coreMax = 0;
  coreHp = 0;
  /** コアを つづけて たたいた とき、次に 数える まで の のこり(秒) */
  private gap = 0;

  /** はじめる(とどめの 一撃)。すでに はじまって いれば 何も しない */
  begin(): FinishEvent[] {
    if (this.phase !== 'off') return [];
    this.phase = 'blow'; this.t = 0;
    this.coreMax = Math.max(1, Math.round(T.finish.core.hits));
    this.coreHp = this.coreMax;
    this.gap = 0;
    return [{ kind: 'blow', n: 0, left: 0 }];
  }

  /** やめる(体を かたづけた とき) */
  cancel(): void {
    this.phase = 'off'; this.t = 0;
  }

  /** 倒れる 進み具合 0〜1(くせ つき) */
  get fallK(): number {
    if (this.phase === 'off' || this.phase === 'blow') return 0;
    if (this.phase !== 'fall') return 1;
    return fallEase(this.t / Math.max(1e-3, T.finish.fall.sec), T.finish.fall.ease);
  }

  /** コアの 赤さ 0〜1(倒れおわって から) */
  get redK(): number {
    if (this.phase === 'lie') return Math.min(1, this.t / Math.max(1e-3, T.finish.core.redSec));
    return this.phase === 'crumble' || this.phase === 'gone' ? 1 : 0;
  }

  /** くずれる 進み具合 0〜1 */
  get crumbleK(): number {
    if (this.phase === 'gone') return 1;
    if (this.phase !== 'crumble') return 0;
    return Math.min(1, this.t / Math.max(1e-3, T.finish.crumble.sec));
  }

  /** 時間を すすめる。この間に 起きた 出来事を 順番に 返す */
  update(dt: number): FinishEvent[] {
    const out: FinishEvent[] = [];
    if (this.phase === 'off' || this.phase === 'gone') return out;
    this.t += dt;
    if (this.gap > 0) this.gap = Math.max(0, this.gap - dt);
    const F = T.finish;
    for (let guard = 0; guard < 8; guard++) {
      if (this.phase === 'blow' && this.t >= F.fall.delaySec) { this.t -= F.fall.delaySec; this.phase = 'fall'; out.push({ kind: 'fall', n: 0, left: 0 }); continue; }
      if (this.phase === 'fall' && this.t >= F.fall.sec) { this.t -= F.fall.sec; this.phase = 'lie'; out.push({ kind: 'lie', n: 0, left: 0 }); continue; }
      if (this.phase === 'crumble' && this.t >= F.crumble.sec) { this.t = 0; this.phase = 'gone'; out.push({ kind: 'gone', n: 0, left: 0 }); }
      break;
    }
    return out;
  }

  /** コアを たたいた。倒れおわって(lie)いて 間かくが あいて いれば 数える。のこりが 0 なら くずれはじめる */
  hitCore(): { accepted: boolean; left: number; events: FinishEvent[] } {
    if (this.phase !== 'lie' || this.gap > 0 || this.coreHp <= 0) return { accepted: false, left: this.coreHp, events: [] };
    this.coreHp--;
    this.gap = T.finish.core.hitGapSec;
    const events: FinishEvent[] = [{ kind: 'coreHit', n: this.coreMax - this.coreHp, left: this.coreHp }];
    if (this.coreHp <= 0) { this.phase = 'crumble'; this.t = 0; events.push({ kind: 'crumble', n: 0, left: 0 }); }
    return { accepted: true, left: this.coreHp, events };
  }
}
