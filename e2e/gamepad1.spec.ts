import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
}


test('パッド疑似: 確認画面が開き、ロック無しで primary が届く', async ({ page }) => {
  await open(page);

  const openBtn = page.getByTestId('gamepad-open');
  await expect(openBtn).toBeVisible({ timeout: 10_000 });
  await openBtn.click();
  await expect(page.getByTestId('gamepad-panel')).toBeVisible();

  // 偽パッド注入（テスト窓口）。案内のまま poll（idle）が回る
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
    const g = window as unknown as { __rikkunPad?: typeof pad; __rikkun?: { gamepad?: { injectPad(p: Gamepad | null): void }; step(n: number): void; input: { held(): string[] } } };
    g.__rikkunPad = pad;
    const api = g.__rikkun?.gamepad;
    if (api) api.injectPad(pad as unknown as Gamepad);
    else {
      const nav = navigator as Navigator & { getGamepads: () => (Gamepad | null)[] };
      nav.getGamepads = () => [pad as unknown as Gamepad];
      window.dispatchEvent(new Event('gamepadconnected'));
    }
  });

  // 数フレーム進めて prev=false を覚える
  await page.evaluate(() => {
    const h = window.__rikkun!;
    h.step(3);
  });
  await page.waitForTimeout(50);

  // ZR（buttons[7]）を押す → primary
  await page.evaluate(() => {
    const g = window as unknown as { __rikkunPad?: { buttons: { pressed: boolean; value: number }[] } };
    const b = g.__rikkunPad!.buttons[7]!;
    b.pressed = true;
    b.value = 1;
  });
  await page.evaluate(() => window.__rikkun!.step(5));
  await page.waitForTimeout(100);

  const held = await page.evaluate(() => window.__rikkun!.input.held());
  expect(held).toContain('primary');

  // mapping 表示（パネルが親 hidden でも DOM に残る想定。見えなければ snapshot 経由）
  const mapText = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="gp-map"]');
    return el?.textContent ?? '';
  });
  // パネルが閉じられていても inject 後の snapshot を見る
  const kind = await page.evaluate(() => {
    const g = (window as unknown as { __rikkun?: { gamepad?: { snapshot(): { kind: string } | null } } }).__rikkun;
    return g?.gamepad?.snapshot()?.kind ?? mapText;
  });
  expect(String(kind)).toMatch(/switch|standard|fallback|ひょう|くう/i);
});

test('パッド疑似: standard マッピングでも primary', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'Xbox Wireless Controller',
      index: 0,
      connected: true,
      mapping: 'standard' as GamepadMappingType,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: performance.now(),
    };
    (window as unknown as { __rikkunPad?: typeof pad }).__rikkunPad = pad;
    const api = (window as unknown as { __rikkun?: { gamepad?: { injectPad(p: Gamepad | null): void } } }).__rikkun?.gamepad;
    api?.injectPad(pad as unknown as Gamepad);
  });
  await page.evaluate(() => window.__rikkun!.step(3));
  await page.evaluate(() => {
    const b = (window as unknown as { __rikkunPad: { buttons: { pressed: boolean; value: number }[] } }).__rikkunPad.buttons[7]!;
    b.pressed = true;
    b.value = 1;
  });
  await page.evaluate(() => window.__rikkun!.step(5));
  const held = await page.evaluate(() => window.__rikkun!.input.held());
  expect(held).toContain('primary');
});
