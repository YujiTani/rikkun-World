import { test } from '@playwright/test';
import { appendFileSync, writeFileSync } from 'node:fs';
import { legendWorld } from './helpers/legend';
import { holdNiji, pushCameraIn, removeWall } from './helpers/niji';

/** WEAPON-9 検証用のスクショ（AC34・52・59 の 見た目。オーナーに 見せる）。docs/art/WEAPON-9/verify/ に 保存する。判定はしない。 */
test.describe.configure({ mode: 'serial', timeout: 600_000 });
const OUT = 'docs/art/WEAPON-9/verify';
const run = (page: import('@playwright/test').Page, n: number) => page.evaluate((n) => (window.__rikkun as any).step(n), n);

test('スクショ: ドーム・すいこみ・一人称・斬撃 8 方向・手持ち 8 コマ', async ({ page }) => {
  writeFileSync(`${OUT}/slash-views.txt`, '');
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  await holdNiji(page, 10);
  await page.evaluate(() => (window.__rikkun as any).yokai.clear());
  await run(page, 60);
  // すいこみ（ため中）
  await page.evaluate(() => (window.__rikkun as any).input.press('primary'));
  for (const t of [30, 75, 120, 150]) {
    await run(page, t - (t === 30 ? 0 : t === 75 ? 30 : t === 120 ? 75 : 120));
    await page.screenshot({ path: `${OUT}/suikomi-${t}.png` });
  }
  await page.evaluate(() => (window.__rikkun as any).input.release('primary'));
  await run(page, 100);
  await page.screenshot({ path: `${OUT}/dome-third-F100.png` });
  await run(page, 200); // おわる
  await run(page, 700);
  // 一人称
  await holdNiji(page, 10);
  await pushCameraIn(page);
  await page.evaluate(() => (window.__rikkun as any).input.press('primary'));
  await run(page, 150);
  await page.evaluate(() => (window.__rikkun as any).input.release('primary'));
  await run(page, 100);
  await page.screenshot({ path: `${OUT}/dome-first-F100.png` });
  await run(page, 700);
  await removeWall(page);
  // 斬撃を 出した あと カメラを 8 方向に 回す
  await holdNiji(page, 10);
  for (let k = 0; k < 8; k++) {
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.player.set({ yaw: 0, pitch: 0 });
      h.step(30);
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(3);
    });
    await page.evaluate((k) => {
      const h = window.__rikkun as any;
      h.player.set({ yaw: k * 45 });
      h.step(1);
    }, k);
    const v = await page.evaluate(() => JSON.stringify((window.__rikkun as any).legend.slashes?.() ?? []));
    await page.screenshot({ path: `${OUT}/slash-dir${k * 45}.png` });
    appendFileSync(`${OUT}/slash-views.txt`, `dir${k * 45} ${v}\n`);
    await run(page, 60);
  }
  // 手持ち 8 コマ（1 回 ふる 間を 3 ステップごと）
  await page.evaluate(() => {
    const h = window.__rikkun as any;
    h.player.set({ yaw: 0, pitch: 0 });
    h.step(60);
    h.input.press('primary');
    h.step(1);
    h.input.release('primary');
  });
  for (let i = 0; i < 8; i++) {
    await run(page, 3);
    await page.screenshot({ path: `${OUT}/hand-${i}.png`, clip: { x: 440, y: 200, width: 400, height: 500 } });
  }
});
