import { impactOf, type ImpactLevel } from '../fx/impact';
import type { LegendEvent } from './LegendSystem';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6「手ごたえ」・AC103・AC113）: わざの 出来事 → 手ごたえの 段。
 * 今まで src/game/step.ts に 直接 書いて あった 決まりを 1 か所の 部品に した もの。1P も 2P も これを 使う（式の コピーなし）。three を 使わない。
 * 1P は impactFor(1)、2P は impactFor(2) を sink に する。テストは legendImpact.test.ts。
 */

/** ステップを またいで おぼえる もの（ドームの はじめの 当たりか） */
export interface LegendImpactState {
  /** シャイニングを 始めてから まだ 当たって いない（最初の 当たりだけ 大） */
  domeFirst: boolean;
}

export function newLegendImpactState(): LegendImpactState {
  return { domeFirst: true };
}

export interface LegendImpactSink {
  hit(level: ImpactLevel): void;
}

/** 出来事を 順に 見て 手ごたえを 出す（1 ステップに 1 回 まとめて 渡す） */
export function feedLegendImpact(sink: LegendImpactSink, events: readonly LegendEvent[], st: LegendImpactState): void {
  for (const e of events) {
    if (e.type === 'lightningStrike') {
      if (e.hits.length > 0) sink.hit(impactOf({ kind: 'charged' })); // 当たらない 落雷は 何も 出さない
    } else if (e.type === 'waveHit' || e.type === 'spiralHit') {
      sink.hit(impactOf({ kind: 'repeat' })); // 真空波・らせん: 止めなし
    } else if (e.type === 'shiningStart') {
      st.domeFirst = true;
    } else if (e.type === 'domeHit') {
      // シャイニングの ドーム: 始めてから 最初の 当たりだけ 大。2 回目からは 止めなし（ゆれは 中の 量）
      sink.hit(impactOf({ kind: st.domeFirst ? 'charged' : 'repeat' }));
      st.domeFirst = false;
    } // ため・休み・ドームを 消した などは 何も 出さない
  }
}
