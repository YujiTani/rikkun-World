import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
}

test('パッド疑似: ロック無しで primary が届き、コントローラー画面が開く', async ({ page }) => {
  await open(page);
  // パッド無しでは案内が出る想定。疑似パッドを差し込む
  await page.evaluate(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'Pro Controller (Vendor: 057e Product: 2009)',
      index: 0,
      connected: true,
      mapping: '' as GamepadMappingType,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: performance.now(),
    };
    const g = window as unknown as { __rikkunPad?: Gamepad | null; navigator: Navigator };
    g.__rikkunPad = pad as unknown as Gamepad;
    // テスト窓口があれば使う。なければ getGamepads を上書き
    const nav = navigator as Navigator & { getGamepads: () => (Gamepad | null)[] };
    nav.getGamepads = () => [g.__rikkunPad ?? null];
    window.dispatchEvent(new Event('gamepadconnected'));
  });

  // コントローラー確認ボタン
  const openBtn = page.getByTestId('gamepad-open');
  await expect(openBtn).toBeVisible({ timeout: 10_000 });
  await openBtn.click();
  await expect(page.getByTestId('gamepad-panel')).toBeVisible();

  // ZR 相当を押す
  await page.evaluate(() => {
    const g = window as unknown as { __rikkunPad?: { buttons: { pressed: boolean; value: number }[] } };
    const b = g.__rikkunPad!.buttons[7]!;
    b.pressed = true;
    b.value = 1;
  });
  await page.waitForTimeout(100);
  await page.waitForTimeout(150);
  const held = await page.evaluate(() => {
    const list = window.__rikkun!.input.held();
    return list.includes('primary');
  });
  expect(held).toBe(true);
  await expect(page.getByTestId('gp-map')).toContainText(/switch|standard|ひょう|くう/i);
});
