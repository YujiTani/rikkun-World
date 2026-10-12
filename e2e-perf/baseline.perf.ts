import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * 性能の数値を記録する。
 * 注意: クラウドは GPU なし（ソフトウェア描画）なので fps は目安にならない。
 * 比べるのは「描画回数・ポリゴン数・1 回の更新＋描画にかかる時間」。
 */
test('性能の基準値を記録する', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__rikkun?.ready === true);

  const result = await page.evaluate(() => {
    const h = window.__rikkun!;
    h.pause();
    h.step(10); // 慣らし
    const samples: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t = performance.now();
      h.step(1);
      samples.push(performance.now() - t);
    }
    samples.sort((a, b) => a - b);
    const stats = h.renderStats();
    return {
      stepMsMedian: samples[Math.floor(samples.length / 2)],
      stepMsP95: samples[Math.floor(samples.length * 0.95)],
      drawCalls: stats.drawCalls,
      triangles: stats.triangles,
      geometries: stats.geometries,
      textures: stats.textures,
    };
  });

  const report = { scene: 'baseline', measuredAt: new Date().toISOString(), ...result };
  mkdirSync('perf-results', { recursive: true });
  writeFileSync('perf-results/latest.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
