import { expect, test } from '@playwright/test';
import { installArena } from './helpers/arena';

/** ROPE-1 版 3 B（docs/design/ROPE-1.md AC27）: たいらで つなぐ → がけから 落ちると 長さで ぶら下がる → スペースで のぼる。ROPE_SHOTS=dir で 画面を のこす */
test('ROPE-1: つなぎで ぶら下がって のぼる', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
  await installArena(page);
  const dir = process.env.ROPE_SHOTS;
  const shot = async (name: string) => {
    if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
  };
  const log = (_o: unknown) => {};
  const info = () => page.evaluate(() => { const h = (window as any).__rikkun; const s = h.player.get(); return { p: s.position, g: s.onGround, inv: h.inventory.get().slots[0] }; });
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause(); h.lock.simulate(true); h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false); h.yokai.clear(); h.time.set(12000);
    (window as any).__arena.floor(-10, -10, 40, 30);
    h.world.fill(-10, 9, -10, 12, 30, 30, 'stone');
    h.world.fill(-10, 31, -10, 12, 31, 30, 'air');
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    h.inventory.clear(); h.inventory.add('rope', 1); h.inventory.select(0);
    h.player.set({ position: { x: 6.5, y: 31, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -20 });
    h.step(10);
    h.input.press('secondary'); h.step(1); h.input.release('secondary'); h.step(1);
  });
  log(await info());
  await page.evaluate(() => { const h = (window as any).__rikkun; h.input.press('moveForward'); h.step(50); h.input.release('moveForward'); const s = h.player.get(); h.player.set({ position: s.position, velocity: { x: 0, y: 0, z: 0 }, yaw: 300, pitch: 25 }); h.step(30); });
  log(await info());
  await shot('1-tethered-flat');
  await page.evaluate(() => { const h = (window as any).__rikkun; h.player.set({ position: h.player.get().position, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -20 }); h.step(2); h.input.press('moveForward'); h.step(120); h.input.release('moveForward'); h.step(120); });
  log(await info());
  await page.evaluate(() => { const h = (window as any).__rikkun; const s = h.player.get(); h.player.set({ position: s.position, velocity: { x: 0, y: 0, z: 0 }, yaw: 300, pitch: 15 }); h.step(30); });
  const hang = await info();
  expect(hang.g).toBe(false);
  expect(hang.p.y).toBeGreaterThan(20);
  expect(hang.p.y).toBeLessThan(30);
  await shot('2-hanging');
  await page.evaluate(() => { const h = (window as any).__rikkun; h.input.press('jump'); h.step(90); h.input.release('jump'); h.step(10); });
  const up = await info();
  expect(up.p.y).toBeGreaterThan(hang.p.y + 3);
  await shot('3-climbed');
});
