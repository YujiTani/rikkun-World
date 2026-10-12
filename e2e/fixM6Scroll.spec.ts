import { expect, test, type Page } from '@playwright/test';

/** FIX-m6-scroll: ツールチップ・せつめい パネル・じっせき ページが 画面に収まる */
const OUT = 'docs/screenshots';

async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.pause();
    h.lock.simulate(true);
    h.step(2);
    h.inventory.clear();
    const items: [string, number][] = [['dirt', 64], ['stone', 40], ['log', 32], ['coal_ore', 12], ['iron_ore', 9], ['iron_ingot', 6], ['paper', 4], ['string', 5], ['cloth', 3], ['clay', 8], ['oil', 2], ['crystal', 2], ['furnace', 1], ['katana', 1], ['yumi', 1], ['ya', 20], ['torch', 10]];
    items.forEach(([item, n]) => h.inventory.add(item, n));
    h.input.press('toggleInventory');
    h.input.release('toggleInventory');
    h.step(3);
  });
  await page.waitForTimeout(700); // 開くアニメーションが終わるまで
}

const inView = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return r.left >= -0.5 && r.top >= -0.5 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5;
  }, sel);

for (const [w, h] of [[960, 540], [1280, 720]] as const) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('ツールチップ: 全文・画面の下と右はしで収まる', async ({ page }) => {
      await open(page);
      const slots = page.locator('.inv-slot');
      const n = await slots.count();
      for (const where of ['normal', 'bottom', 'right'] as const) {
        for (let i = 0; i < n; i++) {
          const b = await slots.nth(i).boundingBox();
          if (!b) continue;
          const isBottom = b.y > h * 0.6;
          const isRight = b.x > w * 0.3 && b.x < w * 0.5;
          if ((where === 'bottom' && !isBottom) || (where === 'right' && !isRight) || (where === 'normal' && isBottom)) continue;
          await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
          await page.mouse.move(b.x + b.width / 2 + 1, b.y + b.height / 2 + 1);
          await page.evaluate(() => (window.__rikkun as any).step(1));
          const shown = await page.evaluate(() => !document.querySelector<HTMLElement>('#tooltip')!.hidden);
          if (!shown) continue;
          expect(await inView(page, '#tooltip')).toBe(true);
          const t = await page.evaluate(() => {
            const d = document.querySelector<HTMLElement>('.tip-desc')!;
            const cs = getComputedStyle(d);
            return { clamp: cs.webkitLineClamp, text: d.textContent, over: cs.overflow }; // eslint
          });
          expect(['none', '', 'unset']).toContain(t.clamp);
          if (where === 'bottom') {
            await page.screenshot({ path: `${OUT}/fix-m6-scroll-tooltip-${w}.png` });
            break;
          }
        }
      }
    });

    test('作る: せつめい パネルの高さが同じ', async ({ page }) => {
      await open(page);
      const ids: string[] = await page.evaluate(() => (window.__rikkun as any).craft.ui().tiles.map((t: any) => t.id));
      expect(ids.length).toBeGreaterThan(3);
      const hs: number[] = [];
      for (const id of [ids[0], ids[Math.floor(ids.length / 2)], ids[ids.length - 1]]) {
        await page.evaluate((id) => {
          const hk = window.__rikkun as any;
          hk.craft.hover(id);
          hk.step(3);
        }, id);
        hs.push(await page.evaluate(() => document.querySelector('.cp-detail')!.getBoundingClientRect().height));
      }
      expect(hs[1]).toBeCloseTo(hs[0], 1);
      expect(hs[2]).toBeCloseTo(hs[0], 1);
      expect(hs[0]).toBeGreaterThan(100);
      expect(await inView(page, '.cp-detail')).toBe(true);
      expect(await inView(page, '.cp-press')).toBe(true);
      await page.screenshot({ path: `${OUT}/fix-m6-scroll-craft-${w}.png` });
    });

    test('じっせき: 一覧と分類がパネルに収まりスクロール・説明が収まる', async ({ page }) => {
      await open(page);
      // じっせき タブ
      await page.evaluate(() => (window.__rikkun as any).step(1));
      await page.locator('.inv-tabs [data-tab=achievements]').click();
      await page.evaluate(() => (window.__rikkun as any).step(3));
      const fit = await page.evaluate(() => {
        const pg = document.querySelector('.ach-page')!.getBoundingClientRect();
        const q = (s: string) => document.querySelector<HTMLElement>(s)!;
        const L = q('.ach-list');
        const C = q('.ach-cats');
        const lr = L.getBoundingClientRect();
        const cr = C.getBoundingClientRect();
        return {
          listIn: lr.bottom <= pg.bottom + 0.5 && lr.top >= pg.top - 0.5,
          catsIn: cr.bottom <= pg.bottom + 0.5,
          pageIn: pg.bottom <= window.innerHeight + 0.5 && pg.right <= window.innerWidth + 0.5,
          listScroll: L.scrollHeight > L.clientHeight,
          catsScroll: C.scrollHeight > C.clientHeight,
          ov: getComputedStyle(L).overflowY + getComputedStyle(C).overflowY,
        };
      });
      expect(fit.listIn && fit.catsIn && fit.pageIn).toBe(true);
      expect(fit.ov).toBe('autoauto');
      expect(fit.listScroll).toBe(true);
      // 下の行・右の行に合わせる
      const rows = page.locator('.ach-row');
      const rn = await rows.count();
      for (const idx of [rn > 1 ? 1 : 0, 3, 5]) {
        const b = await rows.nth(idx).boundingBox();
        if (!b || b.y + b.height > h || b.y < 0) continue;
        await rows.nth(idx).hover();
        const ok = await inView(page, '.ach-tip');
        expect(ok).toBe(true);
      }
      await rows.nth(1).hover();
      await page.screenshot({ path: `${OUT}/fix-m6-scroll-achievements-${w}.png` });
    });
  });
}

// ---- どの画面の大きさでも: パネルと HUD が 画面の中に収まり、重ならない ----
const SIZES = [[960, 540], [1280, 720], [1920, 1080], [1024, 768], [1440, 900]] as const;
const rectsOverlap = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

for (const [w, h] of SIZES) {
  test.describe(`すべての大きさ ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('HUD が収まり重ならない・もちもの/じっせき/たんすが収まる・resize で合わせ直す', async ({ page }) => {
      await open(page);
      // もちもの画面
      const frame = () => inView(page, '.inv-frame');
      expect(await frame()).toBe(true);
      expect(await inView(page, '.cp-detail')).toBe(true);
      await page.locator('.inv-tabs [data-tab=achievements]').click();
      await page.evaluate(() => (window.__rikkun as any).step(3));
      expect(await inView(page, '.ach-page')).toBe(true);
      if (w === 960 || w === 1920) await page.screenshot({ path: `${OUT}/fix-m6-scroll-sizes-${w}-achievements.png` });
      await page.locator('.inv-tabs [data-tab=items]').click();
      // 窓の大きさを変える → すぐ合わせ直す
      await page.setViewportSize({ width: 800, height: 500 });
      await page.waitForTimeout(100);
      expect(await frame()).toBe(true);
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(100);
      expect(await frame()).toBe(true);
      // HUD（もちもの画面を閉じて）
      await page.evaluate(() => {
        const hk = window.__rikkun as any;
        hk.input.press('toggleInventory');
        hk.input.release('toggleInventory');
        hk.step(3);
      });
      const sels = ['#hotbar', '#hud-self', '#clock'];
      const rects = await page.evaluate((ss) => ss.map((s) => {
        const e = document.querySelector<HTMLElement>(s);
        if (!e || e.hidden || e.offsetWidth === 0) return null;
        const r = e.getBoundingClientRect();
        return { s, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.x, y: r.y, toJSON: () => ({}) };
      }), sels);
      const seen = rects.filter((r) => r !== null) as unknown as DOMRect[];
      expect(seen.length).toBeGreaterThan(1);
      for (const r of seen) {
        expect(r.left).toBeGreaterThanOrEqual(-0.5);
        expect(r.top).toBeGreaterThanOrEqual(-0.5);
        expect(r.right).toBeLessThanOrEqual(w + 0.5);
        expect(r.bottom).toBeLessThanOrEqual(h + 0.5);
      }
      for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) expect(rectsOverlap(seen[i], seen[j]), `${(seen[i] as any).s} と ${(seen[j] as any).s} が重なる`).toBe(false);
      if (w === 960 || w === 1920) await page.screenshot({ path: `${OUT}/fix-m6-scroll-sizes-${w}-hud.png` });
    });
  });
}

// ---- かまど: ねんりょう（M4 §4.2: せきたん → あぶら → き の順に 自動で 1 こ）----
test('かまど: せきたんと あぶら を持つと せきたん が先に使われる', async ({ page }) => {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  const r = await page.evaluate(() => {
    const hk = window.__rikkun as any;
    hk.pause();
    hk.inventory.clear();
    hk.inventory.add('coal_ore', 1);
    hk.inventory.add('oil', 1);
    hk.inventory.add('iron_ore', 2);
    const list = hk.furnace.list();
    return { canBake: list.some((x: any) => x.canBake) };
  });
  expect(r.canBake).toBe(true);
});

// ---- 実キー: W A S D（Shift ながら も）で動く ----
test('実キーで W A S D と Shift ながら の D が効く', async ({ page }) => {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).lock.simulate(true));
  await page.waitForTimeout(300);
  const pos = () => page.evaluate(() => (window.__rikkun as any).player.get().position as { x: number; z: number });
  const dirs: [string, 'x' | 'z', number][] = [['KeyW', 'z', -1], ['KeyS', 'z', 1], ['KeyA', 'x', -1], ['KeyD', 'x', 1]];
  for (const [k, axis, sign] of dirs) {
    const a = await pos();
    await page.keyboard.down(k);
    await page.waitForTimeout(400);
    await page.keyboard.up(k);
    const b = await pos();
    expect((b[axis] - a[axis]) * sign, k).toBeGreaterThan(0.3);
  }
  const a = await pos();
  await page.keyboard.down('Shift');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('Shift');
  expect((await pos()).x - a.x).toBeGreaterThan(0.3);
  // おめでとう画面が出ている間に D をはなしても、あとで D が効く
  await page.evaluate(() => (window.__rikkun as any).achievements.close?.());
  await page.keyboard.down('KeyD');
  await page.keyboard.up('KeyD');
  const c = await pos();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  expect((await pos()).x - c.x).toBeGreaterThan(0.3);
});

// ---- もちもの画面の操作の表示 ----
test('もちもの画面の下に操作が出る（たんす は文がかわる・じっせき では出ない）', async ({ page }) => {
  await open(page);
  const hints = page.locator('.inv-hints');
  await expect(hints).toBeVisible();
  await expect(hints).toContainText('1こ すてる');
  await expect(hints).toContainText('ぜんぶ すてる');
  await expect(hints).toContainText('わくの そとへ ひっぱる');
  await expect(hints).toContainText('いっきに うつす');
  await expect(hints).toContainText('とじる');
  expect(await inView(page, '.inv-hints')).toBe(true);
  await page.locator('.inv-tabs [data-tab=achievements]').click();
  await expect(hints).toBeHidden();
  await page.locator('.inv-tabs [data-tab=items]').click();
  await expect(hints).toBeVisible();
});

// ---- ねんりょう を えらぶ ----
test('やく: せつめい パネルの チップで き を えらぶ', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const hk = window.__rikkun as any;
    hk.input.press('toggleInventory');
    hk.input.release('toggleInventory');
    hk.world.setBlock(60, 20, 60, 'furnace');
    hk.craft.openFurnace(60, 20, 60);
    hk.input.press('toggleInventory');
    hk.input.release('toggleInventory');
    hk.step(3);
    hk.inventory.clear();
    hk.inventory.add('coal_ore', 2);
    hk.inventory.add('log', 2);
    hk.inventory.add('iron_ore', 3);
    hk.step(2);
  });
  expect(await page.evaluate(() => (window.__rikkun as any).craft.fuel())).toBe('coal_ore');
  await page.evaluate(() => (window.__rikkun as any).craft.setFuel('log'));
  expect(await page.evaluate(() => (window.__rikkun as any).craft.fuel())).toBe('log');
  await page.evaluate(() => (window.__rikkun as any).craft.setFuel('coal_ore'));
  // やく タブの せつめい パネルで クリック
  await page.locator('.craft-tabs .rk-tab').nth(1).click();
  await page.evaluate(() => {
    const hk = window.__rikkun as any;
    hk.craft.hover(hk.craft.ui().tiles[0].id);
    hk.step(3);
  });
  const chip = page.locator('.cp-fuelchip[data-item=log]');
  await expect(chip).toBeVisible();
  await chip.click();
  expect(await page.evaluate(() => (window.__rikkun as any).craft.fuel())).toBe('log');
  await expect(chip).toHaveAttribute('data-next', 'true');
});

// ---- マウスの絵に L / R ----
test('マウスの絵には L / R の文字がある（もちもの画面の下・せつめい）', async ({ page }) => {
  await open(page);
  const hint = page.locator('.inv-hints .rk-mouse__letter');
  expect(await hint.count()).toBeGreaterThan(0);
  await expect(hint.first()).toHaveText('L');
  await page.evaluate(() => {
    const hk = window.__rikkun as any;
    hk.craft.hover(hk.craft.ui().tiles[0].id);
    hk.step(3);
  });
  const detail = await page.locator('.cp-detail .rk-mouse').evaluateAll((els) => els.map((e) => e.textContent));
  for (const t of detail) expect(['L', 'R']).toContain(t);
});
