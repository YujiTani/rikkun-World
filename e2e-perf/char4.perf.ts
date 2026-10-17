import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { KATANA_SET, holdItems, openBladeWorld, toStance, waitReady } from '../e2e/helpers/blade';

/**
 * CHAR-4 §4.8: 刀を ふった ときの 描画回数・三角形・1 ステップの 時間（軌跡の 前後くらべ）。
 * 立って いるだけ（わざなし）と、大けさぎり F20（軌跡 なし）・F31（軌跡の まっさかり）・F50（もう 消えた）を くらべる。
 * クラウドは GPU なし。fps は 見ない。
 */
for (const item of ['katana', 'crystal_katana']) {
  test(`CHAR-4 性能: ${item} の 大けさぎり`, async ({ page }) => {
    await openBladeWorld(page);
    await holdItems(page, [{ item }]);
    await waitReady(page, KATANA_SET);
    await toStance(page, 'jodan');
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const stat = () => {
        const s = h.renderStats();
        return { drawCalls: s.drawCalls, triangles: s.triangles };
      };
      const idle = { ...stat() };
      const frames: Record<string, { drawCalls: number; triangles: number }> = {};
      const times: number[] = [];
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      for (let f = 1; f <= 60; f++) {
        if (f > 1) {
          const t = performance.now();
          h.step(1);
          times.push(performance.now() - t);
        }
        if ([10, 20, 29, 31, 34, 42, 43, 50].includes(f)) frames[`F${f}`] = stat();
      }
      times.sort((a, b) => a - b);
      return { idle, frames, stepMsMedian: times[Math.floor(times.length / 2)], stepMsP95: times[Math.floor(times.length * 0.95)] };
    });
    const report = { scene: `char4-${item}`, measuredAt: new Date().toISOString(), ...r };
    mkdirSync('perf-results', { recursive: true });
    writeFileSync(`perf-results/char4-${item}.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  });
}
