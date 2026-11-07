import type { BladeEvent, BowEvent, CombatEvent, YokaiTitle } from '../contracts';
import { impactOf, type ImpactLevel } from '../fx/impact';

/**
 * COOP-1 4d-0（docs/design/COOP-1.md §3.6「手ごたえ」・AC97）: 2P の 刀・弓・パンチが 妖怪に 当たったら、1P と 同じ 段の 手ごたえを 2P の 分に 出す。
 * 出来事は 2P の 道具が 毎ステップ 取り出した 物。段は 1P と 同じ `impactOf`。純粋な 関数だけ（three を 使わない）。
 * たおした 手ごたえ（large）は 世界の たおした 知らせから（creatures.ts の onDefeat。たおした 人の 物）。
 */
export interface ImpactSink {
  hit(level: ImpactLevel): void;
}

export function feedP2Impact(sink: ImpactSink, titleOf: (yokaiId: number) => YokaiTitle, combat: readonly CombatEvent[], blade: readonly BladeEvent[], arrows: readonly BowEvent[]): void {
  for (const e of combat) {
    if (e.type === 'punchHit') sink.hit(impactOf({ kind: 'punch', title: titleOf(e.yokaiId) }));
  }
  for (const e of blade) {
    if (e.type === 'techHit') sink.hit(impactOf({ kind: 'tech', tech: e.tech, step: e.step, title: titleOf(e.yokaiId) }));
  }
  for (const e of arrows) {
    if (e.type === 'arrowHit') sink.hit(impactOf({ kind: 'arrow', title: titleOf(e.yokaiId) }));
  }
}
