// #447: vitest の --shard=i/n を「ファイルの 件数」でなく「時間」で 分ける sequencer。
// 表（scripts/unit-shard-times.json。{ "src/…test.ts": 秒 }）で、重い ファイルから 順に、いま 合計が いちばん 小さい シャードへ 入れる（貪欲法）。
// 同じ 表なら いつも 同じ 分け方（決定的）。表に ない ファイルは 表の まん中の 値で 見つもる。
// --shard を 付けない ふだんの 実行（npm test）は shard() が 呼ばれないので 今までどおり 全部。
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { BaseSequencer } from 'vitest/node';
import type { TestSpecification } from 'vitest/node';

/** 表に ない ファイルの 見つもりの 数（表が からの ときの 秒） */
const FALLBACK_SEC = 5; // 秒

export function loadTimes(file = new URL('./unit-shard-times.json', import.meta.url)): Record<string, number> {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

function median(values: number[]): number {
  if (values.length === 0) return FALLBACK_SEC;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** 純粋な 分け方: key → 秒 の 表で、keys を count 個に 分けて、index（1 から）番目の keys を 返す */
export function pickShard(keys: string[], times: Record<string, number>, index: number, count: number): string[] {
  const mid = median(Object.values(times));
  const est = (k: string) => times[k] ?? mid;
  const order = [...keys].sort((a, b) => est(b) - est(a) || (a < b ? -1 : a > b ? 1 : 0));
  const sums = new Array<number>(count).fill(0);
  const mine: string[] = [];
  for (const k of order) {
    let best = 0;
    for (let i = 1; i < count; i++) if (sums[i] < sums[best]) best = i;
    sums[best] += est(k);
    if (best === index - 1) mine.push(k);
  }
  return mine;
}

export default class TimeSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { config } = this.ctx;
    const { index, count } = config.shard!;
    const keyOf = (spec: TestSpecification) => relative(config.root, spec.moduleId).split('\\').join('/');
    const mine = new Set(pickShard(files.map(keyOf), loadTimes(), index, count));
    return files.filter((spec) => mine.has(keyOf(spec)));
  }
}
