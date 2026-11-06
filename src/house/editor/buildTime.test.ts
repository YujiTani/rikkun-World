import { describe, expect, it } from 'vitest';
import * as model from './model';
import { SIZES } from './tuning';

/**
 * HOUSE-1C PR-2 AC21（#340。docs/design/HOUSE-1.md §4.1、docs/tickets/HOUSE-1C.md の PO 決め 6）: 建築の 時間の 式は model.ts に 1 か所。
 * 実装の 前は 赤（model.ts に `houseBuildTicks` が まだ 無い）。形は `windowMax`・`doorIndex` と 同じ（`{ w, d }` を 受ける）。
 * 数（9 とおり ぜんぶ）は 大きさの 表（`SIZES`）から 作る。決め打ちの 件数は 使わない。
 */
type BuildTicks = (s: { w: number; d: number }) => number;
const houseBuildTicks = (model as unknown as { houseBuildTicks?: BuildTicks }).houseBuildTicks;

/** 仕様 §4.1 と AC21 の 例（よこ × たて → ステップ。1 ステップ ＝ 1/60 秒）。式の 写しでは なく 数で 書く */
const EXAMPLES: ReadonlyArray<readonly [number, number, number]> = [
  [5, 5, 9000],
  [7, 5, 10800],
  [5, 7, 10800],
  [7, 7, 12600],
  [9, 5, 12600],
  [5, 9, 12600],
  [9, 7, 14400],
  [7, 9, 14400],
  [9, 9, 16200],
];

describe('AC21 建築の 時間（9,000＋900×(よこ＋たて−10) ステップ）', () => {
  it('model.ts に houseBuildTicks({ w, d }) が ある', () => {
    expect(typeof houseBuildTicks, 'model.ts の houseBuildTicks').toBe('function');
  });

  it('例の とおり: 5×5 9,000・7×5 10,800・7×7 と 9×5 12,600・9×7 14,400・9×9 16,200（よこ と たてを 入れかえても 同じ）', () => {
    for (const [w, d, ticks] of EXAMPLES) expect(houseBuildTicks?.({ w, d }), `${w}×${d}`).toBe(ticks);
  });

  it('大きさの 表（SIZES）の どの くみあわせでも: 整数・9,000 から 16,200 まで・よこ＋たてが 大きいほど 長い', () => {
    const seen: Array<{ sum: number; ticks: number }> = [];
    for (const w of SIZES) {
      for (const d of SIZES) {
        const ticks = houseBuildTicks?.({ w, d });
        expect(Number.isInteger(ticks), `${w}×${d}: 整数`).toBe(true);
        expect(ticks, `${w}×${d}: 2 分 30 秒〜4 分 30 秒`).toBeGreaterThanOrEqual(9000);
        expect(ticks, `${w}×${d}: 2 分 30 秒〜4 分 30 秒`).toBeLessThanOrEqual(16200);
        seen.push({ sum: w + d, ticks: ticks as number });
      }
    }
    for (const a of seen) for (const b of seen) if (a.sum < b.sum) expect(a.ticks, `よこ＋たて ${a.sum} < ${b.sum}`).toBeLessThan(b.ticks);
    for (const a of seen) for (const b of seen) if (a.sum === b.sum) expect(a.ticks, `よこ＋たて ${a.sum} は 同じ 長さ`).toBe(b.ticks);
  });
});
