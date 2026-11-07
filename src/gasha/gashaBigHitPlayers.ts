/**
 * COOP-1 4d-3: 人の 一覧（GashaTarget）から BigHit の「攻撃を 当てる 人の 一覧」（HitEnv.players）を 作る。
 * 人ごとの 入れものは 使いまわし、毎ステップ 新しい 物を 作らない。
 */
import type { HitPlayer, HitSources } from './gashaBigHit';
import type { GashaTarget } from './gashaTargets';

const NONE: HitSources = {};

export function createHitPlayers(targets: () => readonly GashaTarget[]): () => readonly HitPlayer[] {
  const cache = new Map<number, { t: GashaTarget; p: HitPlayer }>();
  const out: HitPlayer[] = [];
  return () => {
    const list = targets();
    out.length = 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      let c = cache.get(t.who);
      if (!c || c.t !== t) {
        c = {
          t,
          p: {
            who: t.who,
            get sources(): HitSources { return t.hit ?? NONE; },
            defIgnore: () => t.defIgnore?.() ?? 0,
            onStrike: (info) => { t.onStrike?.(info); },
          },
        };
        cache.set(t.who, c);
      }
      out.push(c.p);
    }
    return out;
  };
}
