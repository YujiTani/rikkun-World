import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { specFiles, splitByTime } from '../../scripts/e2e-shard.mjs';

/** CI の E2E を 時間で 4 つに 分ける（scripts/e2e-shard.mjs）。どの spec も ちょうど 1 回 回ること */
describe('E2E の シャード分け', () => {
  const times = JSON.parse(readFileSync('e2e/shard-times.json', 'utf8')) as Record<string, number>;

  it('ぜんぶの spec が どれか 1 つの シャードに 1 回だけ 入る（表に ない 新しい spec も）', () => {
    const files = specFiles();
    expect(files.length).toBeGreaterThan(0);
    const all = splitByTime(files, times, 4).flat();
    expect([...all].sort()).toEqual([...files].sort());
  });

  it('重さが かたよらない: 表の 時間で いちばん重い シャードは 平均の 1.2 倍まで', () => {
    const files = specFiles();
    const est = (f: string) => times[f] ?? 0;
    const totals = splitByTime(files, times, 4).map((s) => s.reduce((a, f) => a + est(f), 0));
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(Math.max(...totals)).toBeLessThanOrEqual(avg * 1.2);
  });

  it('同じ 入力なら いつも 同じ 分け方（4 つの ジョブが べつべつに 計算しても 重ならない）', () => {
    const files = specFiles();
    expect(splitByTime([...files].reverse(), times, 4)).toEqual(splitByTime(files, times, 4));
  });

  it('表に ない spec は 表の まん中の 時間と みなす', () => {
    const s = splitByTime(['a', 'b', 'c', 'new'], { a: 100, b: 10, c: 50 }, 2);
    // a(100) → 1 つ目、c(50) → 2 つ目、new(50 と みなす) → 2 つ目、b(10) → 1 つ目。new を 0 と みると [a] と [b, c, new] に なる
    expect(s).toEqual([['a', 'b'], ['c', 'new']]);
  });
});
