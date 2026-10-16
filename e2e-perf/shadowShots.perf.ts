import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { open, scene, SCENES } from './shadowScenes';

/**
 * #144 影の試作の見本スクショ（docs/design/shadow/）。
 * 同じ場面を「いま（影なし）」と「試作（?shadow=1）」で撮る。オーナーに決めてほしい所（こさ・ドット・丸い影）の見くらべも撮る。
 * 走らせ方: npx playwright test --config playwright.shadow.config.ts shadowShots
 */
const OUT = process.env.SHADOW_OUT ?? 'docs/design/shadow';
test.describe.configure({ timeout: 900_000 });

const DBG = Number(process.env.SHDBG ?? 0);

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate((d) => {
    (window as any).__shadowProto?.debug(d);
    (window as any).__rikkun.step(1);
  }, DBG);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${DBG ? '_dbg-' : ''}${name}.png` });
}

test('見本: 影なし（いま）', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await open(page, '');
  for (const s of SCENES) {
    await scene(page, s);
    await shot(page, `${s}-before`);
  }
});

test('見本: 試作（太陽・月の影の地図＋たいまつ＋丸い影）', async ({ page }) => {
  await open(page, '&shadow=1' + (process.env.SHQ ?? ''));
  for (const s of SCENES) {
    await scene(page, s);
    await shot(page, `${s}-after`);
  }
});

test('見本: オーナーに決めてほしい所', async ({ page }) => {
  const variants: [string, string][] = [
    ['choice-dark-040', '&shadow=1&shDark=0.4'],
    ['choice-dark-070', '&shadow=1&shDark=0.7'],
    ['choice-nosnap', '&shadow=1&shSnap=0'],
    ['choice-bumps', '&shadow=1&shBias=0.02'],
    ['choice-hard', '&shadow=1&shSoft=0'],
    ['choice-noblob', '&shadow=1&shBlob=0'],
    ['choice-blobonly', '&shadow=1&shSprite=0&shYokai=0'],
  ];
  for (const [name, q] of variants) {
    await open(page, q);
    await scene(page, 'chara');
    await shot(page, name);
  }
  // たいまつの影に 世界も入れる（重い方）
  await open(page, '&shadow=1&shTorchWorld=1');
  await scene(page, 'night');
  await shot(page, 'choice-torchworld-night');
  await scene(page, 'cave');
  await shot(page, 'choice-torchworld-cave');
  // 地図 1 枚（近くだけ）の上空
  await open(page, '&shadow=1&shCascades=1');
  await scene(page, 'sky');
  await shot(page, 'choice-1cascade-sky');
});
