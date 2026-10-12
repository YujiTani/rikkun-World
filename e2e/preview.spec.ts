import { expect, test } from '@playwright/test';
import { ALLOWED_TEXT } from '../src/preview/texts';

test.beforeEach(async ({ page }) => {
  await page.goto('/preview.html');
  await page.waitForFunction(() => window.__preview?.ready === true);
  await page.evaluate(() => window.__preview!.pause());
});

test('AC1/AC2: 4 体と人形が出て、大きさが合う', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('#game canvas')).toBeVisible();
  const ys = await page.evaluate(() => window.__preview!.yokai());
  expect(ys.map((y) => y.id)).toEqual(['karakasa', 'chochin', 'nurikabe', 'rokurokubi']);
  const want = [
    [1.5, 1.6],
    [0.74, 1.7],
    [2.2, 2.35],
    [1.1, 2.9],
  ];
  ys.forEach((y, i) => {
    expect(Math.abs(y.width - want[i]![0]!)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(y.height - want[i]![1]!)).toBeLessThanOrEqual(0.05);
  });
  expect(Math.abs(ys[1]!.minY - 0.5)).toBeLessThanOrEqual(0.1);
  const doll = await page.evaluate(() => window.__preview!.doll());
  expect(doll.visible).toBe(true);
  expect(doll.height).toBeCloseTo(1.8, 1);
  expect(errors).toEqual([]);
});

test('AC3: かげ・いろ', async ({ page }) => {
  await page.getByRole('button', { name: 'かげ' }).click();
  let ys = await page.evaluate(() => window.__preview!.yokai());
  for (const y of ys) expect(y.colors).toEqual(['#000000']);
  expect(await page.evaluate(() => window.__preview!.labels())).toEqual({ names: false, numbers: true });
  await expect(page.locator('.label.num:visible')).toHaveText(['1', '2', '3', '4']);
  await expect(page.locator('.label:not(.num):visible')).toHaveCount(0);
  await page.getByRole('button', { name: 'いろ' }).click();
  ys = await page.evaluate(() => window.__preview!.yokai());
  for (const y of ys) expect(y.colors.length).toBeGreaterThan(1);
  await expect(page.locator('.label:not(.num):visible')).toHaveText(['プレイヤー', 'からかさおばけ', 'ちょうちんおばけ', 'ぬりかべ', 'ろくろくび']);
});

test('AC4: 動きのボタン', async ({ page }) => {
  const motions = async (): Promise<string[]> =>
    (await page.evaluate(() => window.__preview!.yokai())).map((y) => y.motion);
  for (const [label, motion] of [
    ['うごく', 'move'],
    ['こうげき', 'attack'],
    ['たたかれた', 'hit'],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    expect(new Set(await motions())).toEqual(new Set([motion]));
  }
  await page.getByRole('button', { name: 'まつ' }).click();
  await page.getByRole('button', { name: 'たおれる' }).click();
  await page.evaluate(() => window.__preview!.step(39)); // 0.65 秒
  expect((await page.evaluate(() => window.__preview!.yokai())).map((y) => y.scale)).toEqual([0, 0, 0, 0]);
  await page.evaluate(() => window.__preview!.step(60)); // 1.65 秒
  const ys = await page.evaluate(() => window.__preview!.yokai());
  expect(ys.map((y) => y.motion)).toEqual(['wait', 'wait', 'wait', 'wait']);
  expect(ys.map((y) => y.scale)).toEqual([1, 1, 1, 1]);
});

test('AC5: 回転・とめる・まえ・よこ', async ({ page }) => {
  const yaw = (): Promise<number> => page.evaluate(() => window.__preview!.yawDeg());
  const start = await yaw();
  await page.evaluate(() => window.__preview!.step(60));
  expect((await yaw()) - start).toBeCloseTo(45, 1); // 8 秒で 360 度
  await page.getByRole('button', { name: 'とめる' }).click();
  const y0 = await yaw();
  await page.evaluate(() => window.__preview!.step(60));
  expect(await yaw()).toBe(y0);
  await page.getByRole('button', { name: 'よこ' }).click();
  expect(await yaw()).toBeCloseTo(90, 3);
  await page.getByRole('button', { name: 'まえ' }).click();
  expect(await yaw()).toBe(0);
  await page.getByRole('button', { name: 'まわす' }).click();
  await page.evaluate(() => window.__preview!.step(30));
  expect(await yaw()).toBeGreaterThan(0);
});

test('AC6: 画面の文字はひらがな・カタカナ・数字だけ', async ({ page }) => {
  for (const shadow of [false, true]) {
    if (shadow) await page.getByRole('button', { name: 'かげ' }).click();
    const texts = await page.evaluate(() => window.__preview!.texts());
    for (const t of texts) expect(t).toMatch(ALLOWED_TEXT);
    expect(await page.evaluate(() => document.body.innerText)).toMatch(ALLOWED_TEXT);
  }
});

test('スクリーンショット', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'まえ' }).click();
  await page.evaluate(() => window.__preview!.step(1));
  await page.screenshot({ path: testInfo.outputPath('yokai-color.png') });
  await page.getByRole('button', { name: 'かげ' }).click();
  await page.evaluate(() => window.__preview!.step(1));
  await page.screenshot({ path: testInfo.outputPath('yokai-shadow.png') });
});
