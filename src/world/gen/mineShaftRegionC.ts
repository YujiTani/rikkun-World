import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { buildOps, type ColOps } from './mineShaftOps';
import { planShaftSteps, type PlanEnv, type ShaftPlan } from './mineShaftPlan';
import { regionSites, type Geo } from './mineShaftSite';
import { colKey } from '../stream/ring';

/**
 * 1C・1D の 作り方で 区画 (rx, rz) の 坑道を 計画する 仕事（MINE-1.md §4.5）。1 回 yield するごとに 短い 仕事を 1 つ した。
 * 古い 世界で 1C・1D の 坑道を のこす とき と、1E の 前の 世界〔legacy〕の テストで つかう。
 */
export function* regionJobC(G: Geo, env: PlanEnv, rx: number, rz: number): Generator<void, { plan: ShaftPlan; ops: Map<number, ColOps> | null } | null> {
  let budget = S.plan.budget;
  for (const site of regionSites(G, rx, rz)) {
    if (site === null) {
      yield;
      continue;
    }
    for (let a = 0; a < S.planTries && budget-- > 0; a++) {
      const plan = yield* planShaftSteps(G, site, `r${rx}_${rz}`, false, env, a);
      if (plan) {
        yield;
        return { plan, ops: buildOps(plan) };
      }
      yield;
    }
    if (budget <= 0) break;
    yield;
  }
  return null;
}

/** 箱（両はし ふくむ）に かかる 列に 1E の 一覧の 列〔保存の 列〕が あるか */
export function touchesBoken(boken: ReadonlySet<number> | undefined, x0: number, z0: number, x1: number, z1: number): boolean {
  if (!boken || boken.size === 0) return false;
  for (let cz = z0 >> 4; cz <= z1 >> 4; cz++) for (let cx = x0 >> 4; cx <= x1 >> 4; cx++) if (boken.has(colKey(cx, cz))) return true;
  return false;
}

/** 区画ごとの 1C・1D の 作り方の 坑道〔版 6 の 計画〕。いま 1C〔`gen: 'c'`〕なら 今の 計画そのもの。1E の 一覧の 列に かかる 部屋が 版 6 の 作り方を 守る ために つかう（MINE-1E §4.13） */
export class V6Regions<P extends { plan: ShaftPlan; ops: Map<number, ColOps> | null }> {
  private readonly memo = new Map<string, P | null>();
  constructor(
    private readonly now: (rx: number, rz: number) => P | null,
    private readonly hasShaft: (rx: number, rz: number) => boolean,
    private readonly geo: () => Geo,
    private readonly env: () => PlanEnv,
  ) {}

  plan(rx: number, rz: number): P | null {
    const now = this.now(rx, rz);
    if (now && now.plan.shaft.gen === 'c') return now;
    const key = `${rx},${rz}`;
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    let out: P | null = null;
    if (this.hasShaft(rx, rz)) {
      const job = regionJobC(this.geo(), this.env(), rx, rz);
      let r = job.next();
      while (!r.done) r = job.next();
      out = r.value as P | null;
    }
    this.memo.set(key, out);
    return out;
  }
}
