import { expect, test } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';
import { installArena } from './helpers/arena';

/**
 * ROPE-1 版 4（docs/design/ROPE-1.md AC31〜AC36）: たいらで つなぐ → くいから ねらった 所まで さく（まっすぐ・L 字）
 * → がけから 落ちると 半径 10 で ぶら下がる → スペースで のぼる。ROPE_SHOTS=dir で 画面を のこす。
 * 場所: 石の 台地（上面 y=31。x≦12）。くいは (6,31,6)。
 */
test('ROPE-1: つなぎ・さく（まっすぐ・L 字）・ぶら下がって のぼる', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
  await installArena(page);
  await installAimHelpers(page);
  const dir = process.env.ROPE_SHOTS;
  const shot = async (name: string) => {
    if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
  };
  const info = () =>
    page.evaluate(() => {
      const h = (window as any).__rikkun;
      const s = h.player.get();
      return { p: s.position, g: s.onGround, rope: h.inventory.count('rope') as number };
    });
  const block = (x: number, y: number, z: number) => page.evaluate(([x, y, z]) => (window as any).__rikkun.world.getBlock(x, y, z) as string, [x, y, z]);
  /** (x,z) に 立って (tx,30,tz) の 上面を ねらって 右クリック */
  const fenceTo = (x: number, z: number, tx: number, tz: number) =>
    page.evaluate(([x, z, tx, tz]) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x, y: 31, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(2);
      (window as any).__aim.solve(tx, 30, tz, 1);
      h.step(1);
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      h.step(1);
    }, [x, z, tx, tz]);
  const view = (yaw: number, pitch: number) =>
    page.evaluate(([yaw, pitch]) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: h.player.get().position, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
      h.step(30);
    }, [yaw, pitch]);

  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(12000);
    (window as any).__arena.floor(-10, -10, 40, 30);
    h.world.fill(-10, 9, -10, 12, 30, 30, 'stone');
    h.world.fill(-10, 31, -10, 12, 31, 30, 'air');
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    h.inventory.clear();
    h.inventory.add('rope', 5);
    h.inventory.select(0);
    h.player.set({ position: { x: 6.5, y: 31, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -20 });
    h.step(10);
    h.input.press('secondary');
    h.step(1);
    h.input.release('secondary');
    h.step(1);
    h.player.set({ position: { x: 9.5, y: 31, z: 3.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 300, pitch: 25 });
    h.step(30);
  });
  expect(await block(6, 31, 6)).toBe('rope_stake');
  expect((await info()).rope).toBe(4);
  await shot('1-tethered-flat');

  // まっすぐ: くい (6,6) → (6,2)。z=5〜2 の 4 マス、1 本
  await fenceTo(7.5, 3.5, 6, 2);
  for (const z of [5, 4, 3, 2]) expect(await block(6, 31, z)).toBe('rope_fence');
  expect((await info()).rope).toBe(3);
  await page.evaluate(() => (window as any).__rikkun.player.set({ position: { x: 1.5, y: 31, z: 3.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -40 }));
  await view(90, -40);
  await shot('2-fence-straight');

  // ななめ: くい (6,6) → (9,9)。さきに x（7〜9、z=6）、つぎに z（7〜9、x=9）の L 字
  await fenceTo(8.5, 8.5, 9, 9);
  for (const [x, z] of [[7, 6], [8, 6], [9, 6], [9, 7], [9, 8], [9, 9]]) expect(await block(x, 31, z)).toBe('rope_fence');
  expect(await block(7, 31, 7)).toBe('air');
  expect((await info()).rope).toBe(2);
  await page.evaluate(() => (window as any).__rikkun.player.set({ position: { x: 3.5, y: 31, z: 13.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 25, pitch: -40 }));
  await view(25, -40);
  await shot('3-fence-L');

  // がけ（x=13 から 先）へ 歩いて 落ちる → 半径 10 で ぶら下がる → スペースで のぼる
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.player.set({ position: { x: 8.5, y: 31, z: 3.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -20 });
    h.step(2);
    h.input.press('moveForward');
    h.step(120);
    h.input.release('moveForward');
    h.step(120);
  });
  await view(300, 15);
  const hang = await info();
  expect(hang.g).toBe(false);
  expect(hang.p.y).toBeGreaterThan(20);
  expect(hang.p.y).toBeLessThan(30);
  await shot('4-hanging');
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('jump');
    h.step(90);
    h.input.release('jump');
    h.step(10);
  });
  const up = await info();
  expect(up.p.y).toBeGreaterThan(hang.p.y + 3);
  await shot('5-climbed');
});
