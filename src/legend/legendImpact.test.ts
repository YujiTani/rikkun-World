import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts';
import { impactOf, type ImpactLevel } from '../fx/impact';
import type { LegendEvent } from './LegendSystem';
import { feedLegendImpact, newLegendImpactState } from './legendImpact';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6「手ごたえ」・(b)・AC103・AC113）の 先行テスト（赤）。
 * わざの 出来事 → 手ごたえの 段。**今 src/game/step.ts に 直接 書いて ある 決まり**を 1 か所の 部品に して、1P も 2P も 同じ 部品を 使う（式の コピーなし）。
 *
 * ---- 実装への 約束（新しい ファイル src/legend/legendImpact.ts。three を 使わない）----
 *   newLegendImpactState(): LegendImpactState          ＝ { domeFirst: true }（今の step.ts の `let domeFirstHit = true`）
 *   feedLegendImpact(sink: { hit(level: ImpactLevel): void }, events: readonly LegendEvent[], st: LegendImpactState): void
 *     出来事を 順に 見て:
 *       lightningStrike で hits が 1 つ 以上   → sink.hit(impactOf({ kind: 'charged' }))      （当たらない 落雷は 何も 出さない）
 *       waveHit / spiralHit                    → sink.hit(impactOf({ kind: 'repeat' }))       （真空波・らせん: 止めなし）
 *       shiningStart                           → st.domeFirst = true
 *       domeHit                                → sink.hit(impactOf({ kind: st.domeFirst ? 'charged' : 'repeat' }))、st.domeFirst = false
 *       そのほかの 出来事は 何も 出さない
 *   1P の step.ts も 同じ 部品を 呼ぶ（impactBus を sink に）。1 人の ときの 段・順は 今と 同じ（AC113）。
 *   sink は 1P: impactFor(1)、2P: impactFor(2)（4d-0）。
 */

const V: Vec3 = { x: 0, y: 0, z: 0 };
const CHARGED = impactOf({ kind: 'charged' });
const REPEAT = impactOf({ kind: 'repeat' });

function feed(events: LegendEvent[], st = newLegendImpactState()): ImpactLevel[] {
  const out: ImpactLevel[] = [];
  feedLegendImpact({ hit: (l) => out.push(l) }, events, st);
  return out;
}

describe('feedLegendImpact（1P と 2P で 同じ 部品）', () => {
  it('はじめの 状態は domeFirst: true', () => {
    expect(newLegendImpactState()).toEqual({ domeFirst: true });
  });

  it('落雷: 当たった（hits あり）なら 大、当たらなければ 何も 出さない', () => {
    expect(feed([{ type: 'lightningStrike', tick: 1, S: V, hits: [1], skyVisible: true, variant: 0 }])).toEqual([CHARGED]);
    expect(feed([{ type: 'lightningStrike', tick: 1, S: V, hits: [], skyVisible: true, variant: 0 }])).toEqual([]);
    expect(feed([{ type: 'lightningMiss', tick: 1 }])).toEqual([]);
  });

  it('真空波・らせんの 当たりは くり返しの 段（止めなし）', () => {
    expect(feed([{ type: 'waveHit', tick: 1, id: 1, yokaiId: 1, damage: 1 }])).toEqual([REPEAT]);
    expect(feed([{ type: 'spiralHit', tick: 1, id: 1, yokaiId: 1, damage: 1 }])).toEqual([REPEAT]);
    expect(REPEAT).toBe('echo');
  });

  it('ドーム: shiningStart の あと はじめの domeHit だけ 大、2 回目から くり返し。次の shiningStart で また 大から', () => {
    const st = newLegendImpactState();
    const hit = { type: 'domeHit', tick: 1, yokaiId: 1, damage: 1 } as const;
    expect(feed([{ type: 'shiningStart', tick: 1 }, hit, hit, hit], st)).toEqual([CHARGED, REPEAT, REPEAT]);
    expect(st.domeFirst).toBe(false);
    expect(feed([hit], st), 'ステップを またいでも 続く').toEqual([REPEAT]);
    expect(feed([{ type: 'shiningStart', tick: 9 }, hit], st)).toEqual([CHARGED]);
  });

  it('はじめから domeHit が 来ても（shiningStart を 見る 前）はじめの 1 回は 大', () => {
    expect(feed([{ type: 'domeHit', tick: 1, yokaiId: 1, damage: 1 }])).toEqual([CHARGED]);
  });

  it('ほかの 出来事（ため・休み・ドームを 消した）は 何も 出さない。順番は 出来事の 順', () => {
    expect(
      feed([
        { type: 'chargeStart', tick: 1 },
        { type: 'chargeReady', tick: 2 },
        { type: 'shiningEnd', tick: 3 },
        { type: 'shiningReady', tick: 4 },
        { type: 'domeErase', tick: 5, projectileId: 1 },
      ]),
    ).toEqual([]);
    expect(
      feed([
        { type: 'waveHit', tick: 1, id: 1, yokaiId: 1, damage: 1 },
        { type: 'lightningStrike', tick: 1, S: V, hits: [1], skyVisible: true, variant: 0 },
      ]),
    ).toEqual([REPEAT, CHARGED]);
  });
});
