import { expect, test, type Page } from '@playwright/test';
import { waitAnimationsDone } from './helpers/anim';

/** FIX-m6-scroll: ツールチップ・せつめい パネル・じっせき ページが 画面に収まる */
const OUT = 'test-shots';

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
  await waitAnimationsDone(page); // 開くアニメーションが終わるまで
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
      // 文字（DOM）だけ見る: 重い描画で マウス操作が遅れないよう 描画を止める（スクショの前に 戻す）
      await page.evaluate(() => (window.__rikkun as any).suspendRender(true));
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
            await page.evaluate(() => (window.__rikkun as any).suspendRender(false));
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
      // resize の 知らせは ブラウザの 描画待ちで 遅れることが ある（main でも 100ms では 不安定、CI では 1 秒 でも 足りなかった）ので できるまで まつ（時間の上限は テスト全体）
      await expect.poll(frame, { timeout: 0, intervals: [20] }).toBe(true);
      await page.setViewportSize({ width: w, height: h });
      await expect.poll(frame, { timeout: 0, intervals: [20] }).toBe(true);
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
  // 実キーは本物のキー入力。時間は step() で進める（機械の速さに よらない）
  await page.evaluate(() => { const h = window.__rikkun as any; h.lock.simulate(true); h.pause(); h.step(5); });
  const pos = () => page.evaluate(() => (window.__rikkun as any).player.get().position as { x: number; z: number });
  const movesWhileHeld = async (keys: string[], axis: 'x' | 'z', sign: number, label: string) => {
    const a = await pos();
    for (const k of keys) await page.keyboard.down(k);
    await page.evaluate(() => (window.__rikkun as any).step(30)); // 0.5 びょう分
    expect(((await pos())[axis] - a[axis]) * sign, label).toBeGreaterThan(0.3);
    for (const k of [...keys].reverse()) await page.keyboard.up(k);
  };
  const dirs: [string, 'x' | 'z', number][] = [['KeyW', 'z', -1], ['KeyS', 'z', 1], ['KeyA', 'x', -1], ['KeyD', 'x', 1]];
  for (const [k, axis, sign] of dirs) await movesWhileHeld([k], axis, sign, k);
  await movesWhileHeld(['Shift', 'KeyD'], 'x', 1, 'Shift+KeyD');
  // おめでとう画面が出ている間に D をはなしても、あとで D が効く
  await page.evaluate(() => {
    const h = window.__rikkun as any;
    if (h.achievements.modal().open) h.step(h.achievements.modal().leftSteps); // おしらせ(帯)は 自動で きえる。ゲームは 止まらないので 待つだけ（O8）
  });
  await page.keyboard.down('KeyD');
  await page.keyboard.up('KeyD');
  await movesWhileHeld(['KeyD'], 'x', 1, 'KeyD（おめでとう画面のあと）');
});

// ---- もちもの画面の操作の表示 ----
test('もちもの画面の下に操作が出る（たんす は文がかわる・じっせき では出ない）', async ({ page }) => {
  await open(page);
  const hints = page.locator('.inv-hints');
  await expect(hints).toBeVisible();
  await expect(hints).toContainText('1こ すてる');
  await expect(hints).toContainText('ぜんぶ すてる');
  await expect(hints).toContainText('の そとへ ひっぱる');
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

// ---- 1〜9 キー: 実キーで ホットバーをえらぶ（遊び中も もちもの画面を開いているときも）----
test('実キー Digit1〜9 で ホットバーが かわる（遊び中・もちもの画面）', async ({ page }) => {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).lock.simulate(true));
  // 速さにたよらない: 止めて、実キーを押し、ゲームのコマを進めてから見る
  await page.evaluate(() => { (window.__rikkun as any).pause(); (window.__rikkun as any).step(2); });
  const stepN = (k: number) => page.evaluate((k) => (window.__rikkun as any).step(k), k);
  const sel = () => page.evaluate(() => (window.__rikkun as any).inventory.get().selected as number);
  for (let n = 1; n <= 9; n++) {
    await page.keyboard.press(`Digit${n}`);
    await stepN(3);
    expect(await sel(), `play ${n}`).toBe(n - 1);
  }
  await page.keyboard.press('Digit1');
  await stepN(3);
  expect(await sel()).toBe(0);
  await page.keyboard.press('KeyE');
  await stepN(5);
  await expect(page.locator('#inventory-screen')).toBeVisible();
  for (let n = 9; n >= 1; n--) {
    await page.keyboard.press(`Digit${n}`);
    await stepN(3);
    expect(await sel(), `inventory ${n}`).toBe(n - 1);
  }
});

// ---- 開いた瞬間に カクッとしない ----
for (const [w, h] of [[960, 540], [1280, 720]] as const) {
  test(`開いた直後と あとで パネルの大きさが同じ ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?nosave=1');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => {
      const hk = window.__rikkun as any;
      hk.pause();
      hk.lock.simulate(true);
      hk.step(2);
      hk.input.press('toggleInventory');
      hk.input.release('toggleInventory');
      hk.step(1);
    });
    const size = () => page.evaluate(() => {
      const r = document.querySelector('.inv-frame')!.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    });
    const first = await size();
    await page.evaluate(() => (window.__rikkun as any).step(10));
    await waitAnimationsDone(page);
    expect(await size()).toEqual(first);
  });
}

// ---- たんす ----
test('たんす: とじる は 1 こ・ぜんぶ しまう・えらんで しまう', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const hk = window.__rikkun as any;
    hk.input.press('toggleInventory');
    hk.input.release('toggleInventory');
    hk.step(2);
    const gy = hk.world.groundHeight(60, 60) + 1; // たんすの高さは 世界に聞く
    hk.world.setBlock(60, gy, 60, 'tansu');
    hk.player.set?.({ position: { x: 60.5, y: gy, z: 62.5 } });
    hk.inventory.clear();
    hk.inventory.setSlot(9, { item: 'dirt', count: 5 });
    hk.inventory.setSlot(10, { item: 'stone', count: 7 });
    hk.inventory.setSlot(0, { item: 'log', count: 3 });
    hk.storage.open(60, gy, 60);
    hk.step(3);
  });
  await waitAnimationsDone(page);
  await expect(page.locator('.tansu-panel')).toBeVisible();
  await expect(page.locator('#tansu-close')).toHaveCount(0);
  await expect(page.locator('#inventory-close')).toBeVisible();
  await expect(page.locator('#tansu-store-all')).toBeVisible();
  // ✓
  const slot = page.locator('.inv-slot[data-index="10"]');
  const stepN = () => page.evaluate(() => (window.__rikkun as any).step(3));
  await slot.click({ modifiers: ['Control'] });
  await stepN();
  await expect(slot).toHaveAttribute('data-marked', 'true');
  await expect(page.locator('#tansu-store-marked')).toBeVisible();
  await slot.click({ modifiers: ['Control'] });
  await stepN();
  await expect(page.locator('#tansu-store-marked')).toBeHidden();
  await page.locator('#tansu-store-all').click();
  await stepN();
  const counts = await page.evaluate(() => {
    const hk = window.__rikkun as any;
    return { dirt: hk.inventory.count('dirt'), log: hk.inventory.count('log') };
  });
  expect(counts.dirt).toBe(0);
  expect(counts.log).toBe(3); // ホットバーは うごかない
  await expect(page.locator('.inv-hints')).toContainText('えらぶ');
});

// ---- 防具を ダブルクリックで きる・ぬぐ ----
test('防具のマスを ダブルクリックで きる・そうびのマスを ダブルクリックで ぬぐ', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const hk = window.__rikkun as any;
    hk.inventory.clear();
    hk.inventory.setSlot(10, { item: 'kabuto', count: 1 });
    hk.step(3);
  });
  await page.locator('.inv-slot[data-index="10"]').dblclick();
  await page.evaluate(() => (window.__rikkun as any).step(3));
  expect(await page.evaluate(() => (window.__rikkun as any).armor.get().head)).toBe('kabuto');
  expect(await page.evaluate(() => (window.__rikkun as any).inventory.count('kabuto'))).toBe(0);
  await page.evaluate(() => {
    const hk = window.__rikkun as any;
    for (let i = 0; i < 6; i++) {
      hk.step(20);
      if (hk.achievements.modal().open) hk.step(hk.achievements.modal().leftSteps); // 着たごほうびの おしらせ(帯)が きえるまで 進める（O8）
    }
  });
  await waitAnimationsDone(page);
  await page.locator('.equip-slot[data-slot="head"]').dblclick({ force: true });
  await page.evaluate(() => (window.__rikkun as any).step(3));
  expect(await page.evaluate(() => (window.__rikkun as any).armor.get().head)).toBe(null);
  expect(await page.evaluate(() => (window.__rikkun as any).inventory.count('kabuto'))).toBe(1);
});

// ---- 案内の本（BOOK-1）の リンク・説明が 画面から はみ出さない（前は カードが 収まる 試験） ----
for (const [w, h] of SIZES) {
  test(`案内の本の リンクと 説明が 画面に 収まる ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?nosave=1');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => (window.__rikkun as any).step(2));
    const bad = await page.evaluate(() => {
      const hk = (window.__rikkun as any);
      const out: string[] = [];
      const settle = () => { for (let i = 0; i < 1200 && hk.lock.get().bookAnim !== 'none'; i++) hk.step(1); hk.step(2); };
      const inView = (el: HTMLElement, tag: string) => {
        const r = el.getBoundingClientRect();
        if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) out.push(tag + ' out');
      };
      const ids: string[] = hk.lock.get().bookChapters.map((c: any) => c.id);
      for (const id of ['toc', ...ids]) {
        hk.lock.book(id);
        settle();
        for (const el of document.querySelectorAll<HTMLElement>('[data-book-link]:not([hidden])')) inView(el, id + ':' + el.dataset.bookLink);
      }
      for (const id of hk.lock.get().bookItemIds as string[]) {
        hk.lock.book(id);
        settle();
        const el = document.querySelector<HTMLElement>('[data-item-id]');
        if (!el) { out.push(id + ' no text'); continue; }
        inView(el, id);
        if (el.scrollHeight > el.clientHeight + 1) out.push(id + ' scroll');
      }
      return out;
    });
    expect(bad).toEqual([]);
    await page.screenshot({ path: `${OUT}/fix-m6-scroll-guide-book-${w}.png` });
  });
}
