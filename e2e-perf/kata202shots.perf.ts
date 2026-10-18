import { test } from '@playwright/test';
import { open, QUIET } from './shadowScenes';

/**
 * #202 ブロックの型の見くらべ（近く）。たいらな くさはらに 石のかべ・はっぱ・き・すな・つち を置き、型なし／表／4／16 で撮る。
 * 実行: npx playwright test --config playwright.perf.config.ts e2e-perf/kata202shots.perf.ts → perf-results/kata202/near-*.png
 */
test.setTimeout(600_000);
const KATAS = (process.env.KATAS ?? 'off,table,4,16').split(',');
for (const kata of KATAS) {
  test(`型 ${kata}`, async ({ page }) => {
    await open(page, `&shadow=0&kata=${kata}`);
    await page.evaluate((quiet) => {
      const h = (window as any).__rikkun;
      const q = eval(quiet);
      const sp = h.world.spawn();
      const x0 = Math.floor(sp.x) - 30;
      const z0 = Math.floor(sp.z) - 30;
      const gy = h.world.groundHeight(x0 + 8, z0 + 8);
      h.world.fill(x0 - 4, gy + 1, z0 - 4, x0 + 20, gy + 14, z0 + 20, 'air');
      h.world.fill(x0 - 4, gy - 2, z0 - 4, x0 + 20, gy - 1, z0 + 20, 'dirt');
      h.world.fill(x0 - 4, gy, z0 - 4, x0 + 20, gy, z0 + 20, 'grass');
      // 石のかべ 9×5（1 まい）
      h.world.fill(x0, gy + 1, z0 + 2, x0 + 8, gy + 5, z0 + 2, 'stone');
      // はっぱ 5×3×3（かべの右）と その下の き
      h.world.fill(x0 + 10, gy + 1, z0 + 3, x0 + 10, gy + 2, z0 + 3, 'log');
      h.world.fill(x0 + 9, gy + 3, z0 + 2, x0 + 13, gy + 5, z0 + 4, 'leaves');
      // すな と つち の だん（かべの左）
      h.world.fill(x0 - 3, gy + 1, z0 + 3, x0 - 1, gy + 2, z0 + 5, 'sand');
      h.world.fill(x0 - 3, gy + 3, z0 + 3, x0 - 1, gy + 3, z0 + 5, 'dirt');
      q(h);
      h.time.set(14000);
      h.player.set({ position: { x: x0 + 5.5, y: gy + 1, z: z0 + 12.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -6 });
      h.step(3);
      q(h);
    }, QUIET);
    await page.screenshot({ path: `perf-results/kata202/near-${kata}.png` });
  });
}
