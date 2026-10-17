import { expect, test, type Page } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';

/** #82（と #44）: 合図が ほる／おく の チップに重ならない・もちもの画面の うしろに HUD が すけて見えない */
async function fullOnSand(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.achievements.mute(true);
    h.world.fill(0, 8, 0, 40, 8, 40, 'sand');
    h.world.fill(0, 9, 0, 40, h.world.size().y - 1, 40, 'air');
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1); // 空気の穴の光とメッシュを先に済ませる
    h.time.set(6000);
    h.inventory.clear();
    for (let i = 0; i < 36; i++) h.inventory.setSlot(i, { item: 'dirt', count: 64 });
    h.inventory.select(0);
    h.player.set({ position: { x: 10.5, y: 9, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
    h.step(10);
    // 足もとの となりの 砂を ねらう（角度は いまの ねらい方から 求める）
    (window as any).__aim.solve(11, 8, 10);
    h.step(1);
    h.input.press('primary');
    h.step(60);
    h.input.release('primary');
    h.step(2);
    // ほれた 砂を ひろえない ので 合図が出る（同じ向きのまま もう一度 おす）
    h.input.press('primary');
    h.step(3);
    h.input.release('primary');
    h.step(2);
  });
}

const rect = (page: Page, sel: string) => page.locator(sel).evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);

test('砂の上の「もちものが いっぱい！」は ほる／おく の チップの下に出る', async ({ page }) => {
  await fullOnSand(page);
  await expect(page.locator('#notice-signal-text')).toBeVisible();
  await expect(page.locator('#action-hint')).toBeVisible();
  const sig = await rect(page, '#notice-signal-text');
  const hint = await rect(page, '#action-hint');
  expect(sig.top).toBeGreaterThanOrEqual(hint.bottom);
});

test('もちもの画面を開くと、うしろの HUD（題・時計・レベル・ホットバー）は消え、とじると もどる', async ({ page }) => {
  await fullOnSand(page);
  const hudSel = ['#title', '#clock', '#hud-self', '#hotbar', '#crosshair'];
  const opacities = () => page.evaluate((sels) => sels.map((s) => getComputedStyle(document.querySelector(s)!).opacity), hudSel);
  const toggle = () =>
    page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('toggleInventory');
      h.step(1);
      h.input.release('toggleInventory');
      h.step(2);
    });
  await toggle();
  await expect(page.locator('#inventory-screen')).toBeVisible();
  expect(await opacities()).toEqual(hudSel.map(() => '0'));
  await toggle();
  await expect(page.locator('#inventory-screen')).toBeHidden();
  expect(await opacities()).toEqual(hudSel.map(() => '1'));
});
