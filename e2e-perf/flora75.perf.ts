import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fine, wide } from '../e2e/helpers/fine';
import { measureCountry, openFlora } from '../e2e/helpers/flora';

/**
 * FLORA-75 AC11 の 12 の国ぜんぶ（国ごとに 5 か所 × 4 方向の最大）。重いので CI の E2E には 入れず、`npm run perf`（性能ループ）で 回す。
 * E2E 側（e2e/flora75.spec.ts）は スタートと ふえの大きい 3 国だけ。基準の数は 同じ（描画回数 +25・三角形 +36,864・903,036）。
 * 903,036 は 12 の国ぜんぶに かける（#219。測り方は VOX-I §3.9）。
 */
const KINDS = ['harappa', 'mori', 'ookina', 'hana', 'sunahama', 'susuki', 'take', 'kappa', 'iwayama', 'tengu', 'momiji', 'yuki'];

test('FLORA-75 AC11: 12 の国の 描画回数・三角形の ふえ', async ({ page }) => {
  test.setTimeout(1_800_000);
  const golden = JSON.parse(readFileSync('e2e/golden/flora75-main.json', 'utf8')) as { countries: Record<string, { triangles: number; drawCalls: number }> };
  await openFlora(page, fine(wide('?nosave=1')));
  const rows: string[] = [];
  for (const k of KINDS) {
    const s = await measureCountry(page, k);
    const g = golden.countries[k]!;
    rows.push(`${k}: 描画 ${g.drawCalls}→${s.drawCalls} 三角形 ${g.triangles}→${s.triangles}`);
    expect(s.here, `${k}: 足もとの国`).toBe(k);
    expect(s.drawCalls - g.drawCalls, `${k}: 描画回数の ふえ`).toBeLessThanOrEqual(25);
    expect(s.triangles - g.triangles, `${k}: 三角形の ふえ`).toBeLessThanOrEqual(36_864);
    // #219: #75 のあと もみじやま も 903,036 の中（792,112）に入ったので、12 の国ぜんぶ 上限を見る（VOX-I §3.9・#184-AC15）
    expect(s.triangles, `${k}: 1 コマの三角形`).toBeLessThanOrEqual(903_036);
  }
  console.log('FLORA75 AC11\n' + rows.join('\n'));
});
