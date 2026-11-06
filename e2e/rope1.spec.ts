import { expect, test } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';
import { installArena } from './helpers/arena';

/**
 * ROPE-1 版 5（AC38〜AC44）。もとは 版 4（docs/design/ROPE-1.md AC31〜AC36）: たいらで つなぐ → くいから ねらった 所まで さく（まっすぐ・L 字）
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
  /** (x,z) に 立って (tx,ty,tz) の 上面を ねらって 右クリック */
  const fenceTo = (x: number, z: number, tx: number, tz: number, ty = 30) =>
    page.evaluate(([x, z, tx, tz, ty]) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x, y: 31, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(2);
      (window as any).__aim.solve(tx, ty, tz, 1);
      h.step(1);
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      h.step(1);
    }, [x, z, tx, tz, ty]);
  const view = (x: number, z: number, yaw: number, pitch: number) =>
    page.evaluate(([x, z, yaw, pitch]) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x, y: 31, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
      h.step(30);
    }, [x, z, yaw, pitch]);
  /** 足もとに くいを うって つなぐ（たいら） */
  const tieAt = (x: number, z: number) =>
    page.evaluate(([x, z]) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x, y: 31, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 180, pitch: 30 });
      h.step(3);
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      h.step(1);
    }, [x, z]);

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
    h.inventory.add('rope', 8);
    h.inventory.select(0);
  });

  // 1) たいらで つなぐ: (9,31,6) に くい
  await tieAt(9.5, 6.5);
  expect(await block(9, 31, 6)).toBe('rope_stake');
  await view(6.5, 3.5, 300, -25);
  await shot('1-tethered-flat');

  // 2) まっすぐ: くい (9,6) → (9,3)。はしは くい、間は よこの なわ。つくったら つなぎ おわり
  await fenceTo(10.5, 4.5, 9, 3);
  expect(await block(9, 31, 6)).toBe('rope_fence_post');
  expect(await block(9, 31, 5)).toBe('rope_fence');
  expect(await block(9, 31, 4)).toBe('rope_fence');
  expect(await block(9, 31, 3)).toBe('rope_fence_post');
  await view(5.5, 4.5, 90, -25);
  await shot('2-fence-straight');

  // 3) L 字: (6,31,9) に つないで (8,11) へ。かど (8,9) も くい
  await tieAt(6.5, 9.5);
  await fenceTo(6.5, 11.5, 8, 11);
  for (const [x, z, b] of [[6, 9, 'rope_fence_post'], [7, 9, 'rope_fence'], [8, 9, 'rope_fence_post'], [8, 10, 'rope_fence'], [8, 11, 'rope_fence_post']] as const) expect(await block(x, 31, z)).toBe(b);
  await view(4.5, 13.5, 45, -30);
  await shot('3-fence-L');

  // 4) くいの 上に くいを かさねて つなぎ、むこうの くいの 上を ねらう → 上の 段にも さく
  await fenceTo(10.5, 2.5, 9, 3, 31);
  expect(await block(9, 32, 3)).toBe('rope_stake');
  await fenceTo(10.5, 5.5, 9, 6, 31);
  for (const z of [3, 6]) expect(await block(9, 32, z)).toBe('rope_fence_post');
  for (const z of [4, 5]) expect(await block(9, 32, z)).toBe('rope_fence');
  await view(5.5, 4.5, 90, -15);
  await shot('4-fence-stacked');

  // 5) つないで がけ（x=13 から 先）へ 歩いて 落ちる → ゴムで ゆれる → おさまって ぶら下がる
  await tieAt(10.5, 0.5);
  const ys = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.player.set({ position: { x: 10.5, y: 31, z: 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -20 });
    h.step(2);
    h.input.press('moveForward');
    const out: number[] = [];
    for (let i = 0; i < 60; i++) {
      h.step(1);
      out.push(h.player.get().position.y);
    }
    h.input.release('moveForward');
    for (let i = 0; i < 25; i++) {
      h.step(1);
      out.push(h.player.get().position.y);
    }
    return out;
  });
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const s = h.player.get();
    h.player.set({ position: s.position, velocity: s.velocity, yaw: 300, pitch: 10 });
  });
  await shot('5-bouncing');
  const low = Math.min(...ys);
  expect(low).toBeGreaterThan(20); // 床（y=9）まで 落ちない
  await page.evaluate(() => (window as any).__rikkun.step(300));
  const hang = await info();
  expect(hang.g).toBe(false);
  expect(hang.p.y).toBeGreaterThan(24);
  expect(hang.p.y).toBeLessThan(30);
  await page.evaluate(() => (window as any).__rikkun.step(30));
  expect(Math.abs((await info()).p.y - hang.p.y), 'ぶら下がって とまって いる').toBeLessThan(0.02);
  await shot('6-hanging');
  // Shift+スペースで のぼる。くいの 高さ（y=31）より 上へは 行かない
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('run');
    h.input.press('jump');
    h.step(240);
    h.input.release('jump');
    h.input.release('run');
    h.step(5);
  });
  const up = await info();
  expect(up.p.y).toBeGreaterThan(hang.p.y + 2);
  expect(up.p.y).toBeLessThanOrEqual(31.001);
  await shot('7-climbed');
});
