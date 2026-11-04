import { expect, test, type Page } from '@playwright/test';
import { installArena } from './helpers/arena';

/**
 * FOOTSTEPS（#50 ①、docs/design/FOOTSTEPS.md）: 地面を 歩くと 足音（名前 なしの 効果音）が 一定の 間かくで 鳴る。止まって いる・空中 では 鳴らない。
 * 音の 種類（草・石…）は ユニット（src/fx/footsteps.test.ts）で 見る。
 */
async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await installArena(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    (window as any).__arena.floor(0, 0, 40, 20);
    h.inventory.clear();
    h.player.set({ position: { x: 4.5, y: 9, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
    h.step(30);
  });
}

test.describe('FOOTSTEPS 足音', () => {
  test('歩くと 足音が 鳴る（約 0.4 秒に 1 歩）。止まって いる・空中では 鳴らない', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Shift'); // 音は 最初の 操作の あとで 出る（ブラウザの きまり）
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const count = () => (h.audio.sfx() as { name: string }[]).filter((s) => s.name === '').length;
      count();
      h.step(120); // 止まって いる
      const still = count();
      h.input.press('moveForward');
      h.step(120); // 2 秒 歩く // 2 秒 歩く
      h.input.release('moveForward');
      const walked = count();
      const x = h.player.get().position.x;
      h.player.set({ position: { x, y: 30, z: 10.5 }, velocity: { x: 3, y: 0, z: 0 } });
      h.step(20); // 空中
      const air = count();
      return { still, walked, air, moved: Math.abs(x - 4.5) };
    });
    expect(r.moved, '歩いた').toBeGreaterThan(3);
    expect(r.still, '止まって いる').toBe(0);
    expect(r.walked, '2 秒で 3〜6 歩').toBeGreaterThanOrEqual(3);
    expect(r.walked).toBeLessThanOrEqual(6);
    expect(r.air, '空中').toBe(0);
  });
});
