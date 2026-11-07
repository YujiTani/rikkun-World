import { BOKEN_TUNING } from './mineBokenConfig';
import { bokenSiteOk, planBokenSteps, type BokenPlanEnv } from './mineBokenPlan';
import { styleLadder, styleOf } from './mineBokenStyle';
import { buildOps, type ColOps } from './mineShaftOps';
import type { ShaftPlan } from './mineShaftPlan';
import { regionSites, type Geo, type Site } from './mineShaftSite';

/**
 * 1E の 坑道 1 区画ぶんの 計画の 仕事（MINE-1E §4.1・§5）。1C の `regionJob` と 同じく 1 ステップごとに yield する〔先読みが 時間で 止まれる〕。
 * 性格は 世界の シードと 区画で きまる。入らない ときは 階・迷路・キャンプを へらした 性格で ためす。
 */
export function* bokenRegionJob(G: Geo, seed: number, rx: number, rz: number, env: BokenPlanEnv): Generator<void, { plan: ShaftPlan; ops: Map<number, ColOps> | null } | null> {
  const ladder = styleLadder(styleOf(seed, rx, rz));
  const sites: (Site | null)[] = [];
  for (let level = 0; level < ladder.length; level++) {
    // 性格どおりは 予算の 大半、ゆるめた 性格は のこりを 分けあう
    let budget = level === 0 ? BOKEN_TUNING.budgetFull : Math.floor((BOKEN_TUNING.budget - BOKEN_TUNING.budgetFull) / (ladder.length - 1));
    const list = level === 0 ? regionSites(G, rx, rz) : sites;
    for (const site of list) {
      if (level === 0) sites.push(site);
      if (site === null || !bokenSiteOk(G, site)) {
        yield;
        continue;
      }
      for (let a = 0; a < BOKEN_TUNING.attempts && budget-- > 0; a++) {
        const plan = yield* planBokenSteps(G, site, `r${rx}_${rz}`, rx, rz, ladder[level]!, env, a);
        if (plan) {
          yield;
          return { plan, ops: buildOps(plan) };
        }
        yield;
      }
      if (budget <= 0) break;
      yield;
    }
  }
  return null;
}
