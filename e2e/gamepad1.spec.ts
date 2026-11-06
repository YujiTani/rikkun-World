import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
}


test('パッド疑似: 確認画面が開き、ロック無しで primary が届く', async ({ page }) => {
  await open(page);

  const openBtn = page.getByTestId('settings-open');
  await expect(openBtn).toBeVisible({ timeout: 10_000 });
  await openBtn.click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();

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

test('パッド疑似: もちもの → つくる で 十字で レシピを えらび、B 2 回で つくれる', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const k = window.__rikkun! as any;
    k.pause();
    k.lock.simulate(true);
    for (const item of ['log', 'oil', 'coal_ore', 'stone', 'iron_ingot', 'plank', 'stick', 'string', 'fiber']) {
      try {
        k.inventory.add(item, 60);
      } catch {
        /* 無い id は とばす */
      }
    }
    // どの レシピが えらばれても つくれるように、全レシピの 材料を 先に もちものへ（開く前。あとで 画面が 作りなおされない）
    const need = new Map<string, number>();
    for (const r of k.craft.list()) for (const i of r.inputs) need.set(i.item, Math.max(need.get(i.item) ?? 0, i.count));
    for (const [item, n] of need) k.inventory.add(item, n * 2);
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { id: 'Xbox Wireless Controller', index: 0, connected: true, mapping: 'standard' as GamepadMappingType, axes: [0, 0, 0, 0], buttons, timestamp: performance.now() };
    (window as any).__rikkunPad = pad;
    k.gamepad.injectPad(pad);
    k.step(3);
  });
  const tap = async (idx: number) => {
    await page.evaluate((i) => {
      const k = window.__rikkun! as any;
      const b = (window as any).__rikkunPad.buttons[i];
      b.pressed = true;
      b.value = 1;
      k.step(2);
      b.pressed = false;
      b.value = 0;
      k.step(2);
    }, idx);
  };
  await tap(2); // Y（faceLeft）= もちもの
  await expect(page.locator('#inventory-screen')).toBeVisible();
  await expect(page.locator('.cp-tile').first()).toBeVisible();
  // 十字で .cp-tile まで うごく（右・下）
  let onTile = false;
  for (let i = 0; i < 24 && !onTile; i++) {
    await tap(i % 3 === 2 ? 13 : 15);
    onTile = await page.evaluate(() => document.activeElement?.classList.contains('cp-tile') ?? false);
  }
  expect(onTile).toBe(true);
  const before = await page.evaluate(() => {
    const k = window.__rikkun! as any;
    const id = (document.activeElement as HTMLElement).dataset.id!;
    const r = k.craft.list().find((x: any) => x.id === id);
    const out = r.output.item as string;
    return { id, out, n: k.inventory.count(out) as number, input: r.inputs[0].item as string, m: k.inventory.count(r.inputs[0].item) as number };
  });
  // つくる前に、このレシピが 本当に つくれる状態か
  expect(await page.evaluate((id) => (window.__rikkun! as any).craft.sources(id).ok, before.id)).toBe(true);
  await tap(0); // B（きめる）= えらぶ。右に せつめい
  await expect(page.locator('.cp-detail')).toBeVisible();
  expect(await page.evaluate((o) => window.__rikkun!.inventory.count(o as never), before.out)).toBe(before.n);
  await tap(0); // もう 1 回 = つくる
  const after = await page.evaluate((b) => {
    const k = window.__rikkun! as any;
    return { n: k.inventory.count(b.out) as number, m: k.inventory.count(b.input) as number };
  }, before);
  expect(after.n).toBeGreaterThan(before.n);
  if (before.input !== before.out) expect(after.m).toBeLessThan(before.m);
});
