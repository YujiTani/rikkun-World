import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addFromJson, addFromLog, tidy } from '../../scripts/e2e-shard-times.mjs';
import { countTests, loadTimes, specFiles, splitByTime } from '../../scripts/e2e-shard.mjs';

/** CI の E2E を 時間で いくつかに 分ける（scripts/e2e-shard.mjs）。どの spec も ちょうど 1 回 回ること */
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

  it('本数が わかれば、表に ない spec は「本数 × 1 本あたりの まん中の 時間」と みなす（#311）', () => {
    // 1 本あたり a 10・b 20・c 30 秒 → まん中 20 秒。new は 5 本 → 100 秒と みなして a(100) と 同じ 重さ
    const times = { a: 100, b: 40, c: 30 };
    const counts = { a: 10, b: 2, c: 1, new: 5 };
    const s = splitByTime(['a', 'b', 'c', 'new'], times, 2, counts);
    // a(100) → 1、new(100) → 2、b(40) → 1、c(30) → 2
    expect(s).toEqual([['a', 'b'], ['c', 'new']]);
  });

  it('test( の 本数を 数える（describe や configure は 数えない）', () => {
    const src = [
      "test.describe.configure({ timeout: 1 });",
      "test.describe('x', () => {",
      "  test('a', async () => {});",
      "  test.skip(`b`, async () => {});",
      '  test("c", async () => {});',
      '  expect(1).toBe(1); // test は ここでは 文字だけ',
      '});',
    ].join('\n');
    expect(countTests(src)).toBe(3);
  });

  it('新しい 時間（CI が 置く フォルダ）を 表の 上に かさねる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shard-'));
    const table = join(dir, 'table.json');
    writeFileSync(table, JSON.stringify({ 'e2e/a.spec.ts': 10, 'e2e/b.spec.ts': 20 }));
    const fresh = join(dir, 'fresh');
    mkdirSync(fresh);
    writeFileSync(join(fresh, 'shard-1.json'), JSON.stringify({ 'e2e/b.spec.ts': 99, 'e2e/c.spec.ts': 5 }));
    writeFileSync(join(fresh, 'broken.json'), '{');
    expect(loadTimes(table, fresh)).toEqual({ 'e2e/a.spec.ts': 10, 'e2e/b.spec.ts': 99, 'e2e/c.spec.ts': 5 });
    expect(loadTimes(table, join(dir, 'none'))).toEqual({ 'e2e/a.spec.ts': 10, 'e2e/b.spec.ts': 20 });
  });

  it('結果から spec ごとの 秒を 作る（list の ログ と JSON レポート）', () => {
    const log = [
      '  ✓  1 [chromium] › e2e/a.spec.ts:3:1 › 1 本目 (2.5s)',
      '  ✘  2 [chromium] › e2e/a.spec.ts:9:1 › 2 本目 (500ms)',
      '  ✓  3 [chromium] › e2e/b.spec.ts:3:1 › ながい (1.5m)',
    ].join('\n');
    expect(tidy(addFromLog(log))).toEqual({ 'e2e/a.spec.ts': 3, 'e2e/b.spec.ts': 90 });
    const report = {
      suites: [
        {
          file: 'a.spec.ts',
          specs: [{ file: 'a.spec.ts', tests: [{ results: [{ duration: 2500 }] }] }],
          suites: [{ specs: [{ file: 'a.spec.ts', tests: [{ results: [{ duration: 1500 }] }] }] }],
        },
        { file: 'b.spec.ts', specs: [{ file: 'b.spec.ts', tests: [{ results: [{ duration: 90000 }] }] }] },
      ],
    };
    expect(tidy(addFromJson(report))).toEqual({ 'e2e/a.spec.ts': 4, 'e2e/b.spec.ts': 90 });
  });
});
