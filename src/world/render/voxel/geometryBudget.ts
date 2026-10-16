/**
 * ジオメトリの合計バイトが上限をこえたとき、どれを捨てるか（遠い順）。VOX-E §5「捨てる」。
 * three にも world にも依らない純粋関数。
 */
export interface BudgetEntry {
  key: number;
  bytes: number;
  /** プレイヤーからの距離（遠いほど先に捨てる） */
  dist: number;
}

/** 上限をこえたら、上限の 90% になるまで 遠い順に捨てる（捨てたあと すぐ また こえないように） */
export const BUDGET_RELEASE = 0.9;

/** total > limit なら 捨てる key の並び（遠い順。同じ距離なら key の小さい順）。こえていなければ空 */
export function pickEvictions(entries: readonly BudgetEntry[], total: number, limit: number): number[] {
  if (total <= limit) return [];
  const goal = limit * BUDGET_RELEASE;
  const sorted = entries.filter((e) => e.bytes > 0).sort((a, b) => b.dist - a.dist || a.key - b.key);
  const out: number[] = [];
  let t = total;
  for (const e of sorted) {
    if (t <= goal) break;
    out.push(e.key);
    t -= e.bytes;
  }
  return out;
}
