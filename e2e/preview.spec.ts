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
    [3.1, 3.05],
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
    await page.getByRole('button', { name: 'まつ' }).click();
  }
});

test('AC4: こうげきから当たりまで 30 ステップ（ぬりかべ 90）、赤い線が出る', async ({ page }) => {
  await page.getByRole('button', { name: 'こうげき' }).click();
  const hits = async (): Promise<number[]> => (await page.evaluate(() => window.__preview!.yokai())).map((y) => y.hitCount);
  await page.evaluate(() => window.__preview!.step(28));
  expect(await hits()).toEqual([0, 0, 0, 0]);
  await page.evaluate(() => window.__preview!.step(3));
  expect(await hits()).toEqual([1, 1, 0, 1]);
  const ys = await page.evaluate(() => window.__preview!.yokai());
  expect(ys.map((y) => y.hitVisible)).toEqual([true, true, false, true]);
  await page.evaluate(() => window.__preview!.step(58));
  expect(await hits()).toEqual([1, 1, 0, 1]);
  await page.evaluate(() => window.__preview!.step(3));
  expect(await hits()).toEqual([1, 1, 1, 1]);
  expect(await page.evaluate(() => window.__preview!.attackView())).toBe(true);
});

test('AC5: 火の玉は 1 秒に 5.0 ブロック、8 ブロックで消える', async ({ page }) => {
  await page.getByRole('button', { name: 'こうげき' }).click();
  await page.evaluate(() => window.__preview!.step(31));
  const f0 = (await page.evaluate(() => window.__preview!.yokai()))[1]!.fireballs[0]!;
  await page.evaluate(() => window.__preview!.step(60));
  const f1 = (await page.evaluate(() => window.__preview!.yokai()))[1]!.fireballs[0]!;
  expect(Math.abs(Math.hypot(f1.x - f0.x, f1.y - f0.y, f1.z - f0.z) - 5)).toBeLessThanOrEqual(0.1);
  await page.evaluate(() => window.__preview!.step(120));
  expect((await page.evaluate(() => window.__preview!.yokai()))[1]!.fireballs).toEqual([]);
});

test('AC6: ろくろくびの首は 8 ブロックのび、怖い顔は 1.0 秒まで', async ({ page }) => {
  const rk = async () => (await page.evaluate(() => window.__preview!.yokai()))[3]!;
  await page.getByRole('button', { name: 'こうげき' }).click();
  await page.evaluate(() => window.__preview!.step(31));
  const r = await rk();
  expect(Math.abs(r.info.headDist! - 8)).toBeLessThanOrEqual(0.1);
  expect(r.info.bodyZ).toBe(0);
  expect(r.face).toBe('scary');
  await page.evaluate(() => window.__preview!.step(30));
  expect((await rk()).face).toBe('scary');
  await page.evaluate(() => window.__preview!.step(6));
  expect((await rk()).face).not.toBe('scary');
});

test('AC7: ぬりかべは当たりの 2.5 秒後に立ちなおる', async ({ page }) => {
  const nk = async () => (await page.evaluate(() => window.__preview!.yokai()))[2]!;
  await page.getByRole('button', { name: 'こうげき' }).click();
  await page.evaluate(() => window.__preview!.step(91));
  expect((await nk()).info.leanDeg!).toBeLessThan(-80);
  await page.evaluate(() => window.__preview!.step(150));
  const r = await nk();
  expect(r.motion).toBe('wait');
  expect(Math.abs(r.info.leanDeg!)).toBeLessThan(0.01);
});

test('AC8: からかさは段の上に着地する', async ({ page }) => {
  await page.getByRole('button', { name: 'うごく' }).click();
  let onStep = false;
  for (let i = 0; i < 180; i++) {
    await page.evaluate(() => window.__preview!.step(1));
    const [k, x, sx] = await page.evaluate(() => [
      window.__preview!.yokai()[0]!.info.bodyY!,
      window.__preview!.karakasaX(),
      window.__preview!.stairX(),
    ]);
    if (k! > 1.99 && Math.abs(x! - sx!) < 0.5) onStep = true;
  }
  expect(onStep).toBe(true);
});

test('AC9: たおれる', async ({ page }) => {
  await page.getByRole('button', { name: 'たおれる' }).click();
  await page.evaluate(() => window.__preview!.step(39)); // 0.65 秒
  expect((await page.evaluate(() => window.__preview!.yokai())).map((y) => y.scale)).toEqual([0, 0, 0, 0]);
  await page.evaluate(() => window.__preview!.step(60)); // 1.65 秒
  const ys = await page.evaluate(() => window.__preview!.yokai());
  expect(ys.map((y) => y.motion)).toEqual(['wait', 'wait', 'wait', 'wait']);
  expect(ys.map((y) => y.scale)).toEqual([1, 1, 1, 1]);
});

test('AC9: 回転・とめる・まえ・よこ', async ({ page }) => {
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

test('AC10: 画面の文字はひらがな・カタカナ・数字だけ', async ({ page }) => {
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
  await page.screenshot({ path: testInfo.outputPath('yokai2-color.png') });
  await page.getByRole('button', { name: 'かげ' }).click();
  await page.evaluate(() => window.__preview!.step(1));
  await page.screenshot({ path: testInfo.outputPath('yokai2-shadow.png') });
  await page.getByRole('button', { name: 'いろ' }).click();
  await page.getByRole('button', { name: 'こうげき' }).click();
  for (const [name, steps] of [
    ['a', 36],
    ['b', 55],
    ['c', 0],
  ] as const) {
    await page.evaluate((n) => window.__preview!.step(n), steps);
    // カメラが引ききるのを待つ（描画だけの動き）
    await page.waitForTimeout(1500);
    await page.screenshot({ path: testInfo.outputPath(`yokai2-attack-${name}.png`) });
  }
});
