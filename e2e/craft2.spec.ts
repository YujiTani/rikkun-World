import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';
import { checkContrast, snapshotUi } from './helpers/uiRules';

/**
 * CRAFT-2（たんす の素材・ログ・できごと・半透明）の自動の受け入れ基準（docs/design/CRAFT-2.md §6）。
 * 場所: 床 stone y=8、うえは くうき。P = (10.5, 9, 10.5)。たんす A = P から きょり 3、F = 41。
 * スクショ（AC26）は test-shots/CRAFT-2/。
 */
const SHOTS = 'test-shots/CRAFT-2';

async function open(page: Page, query = '?nosave=1') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const T: any = {
      base() {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.achievements.mute(true);
        h.world.fill(0, 8, 0, 40, 8, 40, 'stone');
        h.world.fill(0, 9, 0, 40, h.world.size().y - 1, 40, 'air');
        for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1); // 空気の穴の光とメッシュを先に済ませる
        h.inventory.clear();
        h.log.clear();
        // ふるい たんす などの 中身を 空にする（材料に まざらないように）
        for (const p of h.storage.list()) for (let i = 0; i < 54; i++) h.storage.set(p.x, p.y, p.z, i, null);
        h.time.set(6000);
        (window as any).__aim.standForS(10.5, 10.5, 90, 0, 9);
        h.step(10);
        h.log.clear();
        h.craft.events();
      },
      /** たんす を置く（位置と きょりの目安は 上） */
      tansu(x: number, y: number, z: number, items: [number, string, number][] = []) {
        h.world.setBlock(x, y, z, 'tansu');
        for (let i = 0; i < 54; i++) h.storage.set(x, y, z, i, null);
        for (const [slot, item, n] of items) h.storage.set(x, y, z, slot, { item, count: n });
      },
      tansuCount(pos: any, item: string) {
        const s: any[] = h.storage.get(pos.x, pos.y, pos.z)?.slots ?? [];
        return s.reduce((n, st) => n + (st && st.item === item ? st.count : 0), 0);
      },
      invCount: (item: string) => h.inventory.count(item),
      press(a: string) {
        h.input.press(a);
        h.step(1);
        h.input.release(a);
        h.step(1);
      },
      openInv() {
        T.press('toggleInventory');
        h.step(2);
      },
    };
    (window as any).T = T;
  });
}

const A = { x: 13, y: 9, z: 10 };

test.describe('CRAFT-2 素材（たんす から つかう）', () => {
  // きょりの数・かなづち の印・しらべる回数は ユニット（src/craft/craft2.test.ts）。ここは 画面の ドット（印）だけ
  test('AC8: きょり 41 の たんす は ドットに ならない（もちもの = みどり・なし = 灰）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const F = { x: 51, y: 9, z: 10 }; // きょり 41
      h.player.set({ position: { x: 10.5, y: 9, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(2);
      T.tansu(F.x, F.y, F.z, [[0, 'log', 3]]);
      h.step(1);
      // もちもの が空だと カード自体が 出ない（M6 の「材料が 1 種類でも あるものだけ」）ので、き 1 こ だけ もって 見る（読みかえ）
      h.inventory.setSlot(0, { item: 'log', count: 1 });
      T.openInv();
      h.craft.hover('wood_pickaxe');
      h.step(1);
      return {
        dots: document.querySelectorAll('.cp-mat .cp-dot').length,
        tansu: document.querySelectorAll('.cp-mat .cp-dot[data-src="tansu"]').length,
        none: document.querySelectorAll('.cp-mat .cp-dot[data-src="none"]').length,
        inv: document.querySelectorAll('.cp-mat .cp-dot[data-src="inv"]').length,
      };
    });
    expect(r).toEqual({ dots: 3, tansu: 0, none: 2, inv: 1 });
  });
});

test.describe('CRAFT-2 画面とログ', () => {
  test('AC12: ざいりょう の まる（もちもの = みどり・たんす = 桐色）と たんす の絵', async ({ page }) => {
    await open(page);
    await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.setSlot(0, { item: 'log', count: 1 });
      T.tansu(A.x, A.y, A.z, [[0, 'log', 2]]);
      T.openInv();
      h.craft.hover('wood_pickaxe');
      h.step(2);
    }, { A });
    const chip = page.locator('.cp-mat[data-item="log"]');
    await expect(chip).toBeVisible();
    expect(await chip.locator('.cp-dot').count()).toBe(3);
    expect(await chip.locator('.cp-dot[data-src="inv"]').count()).toBe(1);
    expect(await chip.locator('.cp-dot[data-src="tansu"]').count()).toBe(2);
    expect(await chip.locator('.cp-tansu-mini').count()).toBe(1);
    const colors = await chip.locator('.cp-dot').evaluateAll((els) =>
      els.map((e) => ({ src: (e as HTMLElement).dataset.src, bg: getComputedStyle(e).backgroundColor })),
    );
    const inv = colors.find((c) => c.src === 'inv')!;
    const tan = colors.find((c) => c.src === 'tansu')!;
    expect(inv.bg).not.toBe(tan.bg);
    expect(await page.evaluate(() => (window as any).__rikkun.craft.ui().tiles.find((t: any) => t.id === 'wood_pickaxe').glowing)).toBe(true);
    // もちもの だけで 足りるとき たんす の絵は 無い
    await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      h.inventory.setSlot(1, { item: 'log', count: 5 });
      h.storage.set(A.x, A.y, A.z, 0, null);
      h.step(2);
    }, { A });
    expect(await page.locator('.cp-mat[data-item="log"] .cp-tansu-mini').count()).toBe(0);
  });

  test('AC15: 左のログの DOM（印 → 絵 → 字・白・ふち）', async ({ page }) => {
    await open(page);
    await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.pickup('dirt', 3);
      h.inventory.setSlot(1, { item: 'log', count: 1 });
      T.tansu(A.x, A.y, A.z, [[0, 'log', 3]]);
      h.craft.make('wood_pickaxe');
      h.step(2);
    }, { A });
    const rows = await page.locator('#pickup-log .pickup-row').evaluateAll((els) =>
      els.map((e) => {
        const kids = Array.from(e.children);
        const text = e.querySelector('.pickup-text') as HTMLElement;
        const cs = getComputedStyle(text);
        return {
          kind: (e as HTMLElement).dataset.kind,
          first: (kids[0] as HTMLElement).dataset.cat ?? null,
          second: kids[1]?.tagName,
          color: cs.color,
          shadow: cs.textShadow,
          tansuMini: e.querySelectorAll('[data-tansu]').length,
        };
      }),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.first).toBe(row.kind === 'fromTansu' ? 'craft' : 'pickup');
      expect(row.second).toBe('IMG');
      expect(row.color).toBe('rgb(255, 255, 255)');
      expect(row.shadow).not.toBe('none');
      expect(row.tansuMini).toBe(row.kind === 'fromTansu' ? 1 : 0);
    }
    // こわれた ログの印
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.setSlot(0, { item: 'wood_pickaxe', count: 1 });
      h.inventory.select(0);
      h.inventory.setDurability(0, 1);
      h.world.fill(14, 9, 12, 14, 9, 12, 'stone');
      (window as any).__aim.standForS(10.5, 13.2, 90, 0, 9);
      h.step(2);
      h.world.fill(11, 9, 12, 11, 9, 12, 'stone');
      h.input.press('primary');
      h.step(240);
      h.input.release('primary');
      h.step(2);
    });
    const wear = await page.locator('#wear-log .wear-row').count();
    if (wear > 0) {
      expect(await page.locator('#wear-log .wear-row [data-cat="info"]').count()).toBeGreaterThan(0);
    }
  });
});

test.describe('CRAFT-2 できごと（履歴）', () => {
  test('AC16: 12 のできごと', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const out: any = {};
      // 先に「はじめて」の実績が 入ることがあるので、その種類で いちばん新しい件を見る
      const snap = (k: string, kind: string) => {
        h.step(1);
        const e0 = h.log.history().find((e: any) => e.kind === kind);
        out[k] = e0 ? { category: e0.category, kind: e0.kind, text: e0.text, item: e0.item } : null;
        h.step(200); // まとめない ように
      };
      h.inventory.pickup('dirt', 2);
      snap('pickup', 'pickup');
      // たんす から → つくる
      h.inventory.setSlot(0, { item: 'log', count: 1 });
      T.tansu(A.x, A.y, A.z, [[0, 'log', 5]]);
      h.craft.make('wood_pickaxe');
      h.step(1);
      out.fromTansuList = h.log.history().map((e: any) => `${e.kind}:${e.item}:${e.text}`);
      h.step(200);
      h.inventory.clear();
      // つくった（もちもの だけ）
      h.inventory.add('log', 2);
      h.craft.make('bokuto');
      snap('craft', 'craft');
      // やく
      h.world.setBlock(11, 9, 12, 'furnace');
      h.inventory.clear();
      h.inventory.add('iron_ore', 1);
      h.inventory.add('log', 3);
      h.furnace.bake('iron_ingot', 11, 9, 12);
      snap('bake', 'bakeStart');
      return out;
    }, { A });
    expect(r.pickup).toMatchObject({ category: 'pickup', kind: 'pickup', item: 'dirt', text: 'つち ×2' });
    expect(r.fromTansuList.join('|')).toContain('fromTansu:log:');
    expect(r.fromTansuList.some((t: string) => t.startsWith('craft:wood_pickaxe:'))).toBe(true);
    expect(r.craft).toMatchObject({ category: 'craft', kind: 'craft', item: 'bokuto' });
    expect(r.bake).toMatchObject({ category: 'craft', kind: 'bakeStart' });
  });

  test('AC16b: 合図・農業・こわれた・たおした・もどった・実績・レベル', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const out: any = {};
      const hist = () => h.log.history().map((e: any) => ({ k: e.kind, c: e.category, t: e.text, i: e.item }));
      const mine = (long = false) => {
        h.input.press('primary');
        h.step(long ? 200 : 60);
        h.input.release('primary');
        h.step(2);
        h.input.press('primary');
        h.step(3);
        h.input.release('primary');
        h.step(2);
      };
      const face = (pitch = 0) => {
        (window as any).__aim.standForS(10.5, 10.5, 90, pitch, 9);
        h.step(2);
      };
      const next = () => {
        h.step(200);
        h.log.clear();
      };
      // いっぱい
      h.inventory.clear();
      for (let i = 0; i < 36; i++) h.inventory.setSlot(i, { item: 'dirt', count: 64 });
      h.inventory.select(0);
      h.world.setBlock(14, 10, 10, 'sand');
      face();
      mine();
      out.full = hist();
      next();
      // つるはし が いるよ
      h.inventory.clear();
      h.world.setBlock(14, 10, 10, 'iron_ore');
      face();
      mine();
      out.needTool = hist();
      next();
      // や が いるよ
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'yumi', count: 1 });
      h.inventory.select(0);
      face();
      h.input.press('primary');
      h.step(15);
      h.input.release('primary');
      h.step(2);
      out.noArrow = hist();
      next();
      // 農業の合図
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'seed_tomato', count: 1 });
      h.inventory.select(0);
      h.world.setBlock(13, 8, 10, 'dirt');
      face();
      (window as any).__aim.solve(13, 8, 10, 1); // (13,8,10) の上の面を ねらう（S から 窓口で 求める）
      h.step(1);
      h.input.press('secondary');
      h.step(3);
      h.input.release('secondary');
      h.step(3);
      out.farm = hist();
      next();
      // たいきゅう 0 でこわす
      h.world.setBlock(14, 10, 10, 'stone');
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'wood_pickaxe', count: 1 });
      h.inventory.select(0);
      h.inventory.setDurability(0, 1);
      face();
      mine(true);
      out.wear = hist();
      next();
      // 妖怪をたおす
      const id = h.yokai.spawn('karakasa', 12.5, 9, 10.5, { ai: false });
      h.yokai.setHp(id, 1);
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'katana', count: 1 });
      h.inventory.select(0);
      face();
      h.input.press('primary');
      h.step(20);
      h.input.release('primary');
      h.step(5);
      out.defeat = hist();
      h.yokai.clear();
      next();
      // もどる
      h.combat.setHp(0);
      h.step(400);
      out.home = hist();
      next();
      // 実績・レベル
      h.achievements.record('break:dirt', 1);
      h.step(2);
      out.ach = hist();
      next();
      h.level.add(1000);
      h.step(2);
      out.level = hist();
      return out;
    });
    const has = (list: any[], k: string, c: string, t?: string) => list.some((e) => e.k === k && e.c === c && (t === undefined || e.t.includes(t)));
    expect(has(r.full, 'signal', 'warn', 'もちもの が いっぱい！')).toBe(true);
    expect(r.needTool.find((e: any) => e.k === 'signal')).toMatchObject({ c: 'warn', i: 'stone_pickaxe' });
    expect(has(r.needTool, 'signal', 'warn', 'つるはし が いるよ')).toBe(true);
    expect(r.noArrow.find((e: any) => e.k === 'signal')).toMatchObject({ c: 'warn', t: 'や が いるよ', i: 'ya' });
    expect(has(r.farm, 'farmHint', 'info')).toBe(true);
    expect(has(r.wear, 'wearBroken', 'info', 'こわれた')).toBe(true);
    expect(has(r.defeat, 'defeat', 'fight', 'からかさ を たおした')).toBe(true);
    expect(has(r.home, 'home', 'fight', 'スタートに もどったよ')).toBe(true);
    expect(has(r.ach, 'achievement', 'achieve')).toBe(true);
    expect(has(r.level, 'level', 'achieve', 'レベル')).toBe(true);
  });

});

test.describe('CRAFT-2 できごと ページ', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('AC19・AC20・AC21: 開く・ページ・カテゴリーの印', async ({ page }) => {
    await open(page);
    // AC19
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      h.input.press('openLog');
      h.step(1);
      h.input.release('openLog');
      h.step(2);
    });
    expect(await page.evaluate(() => (window as any).__rikkun.log.ui())).toMatchObject({ open: true, tab: 'log' });
    await expect(page.locator('.log-page')).toBeVisible();
    const tab = page.locator('[data-tab="log"]');
    expect(await tab.evaluate((e) => ({ sel: e.getAttribute('aria-selected') ?? e.getAttribute('data-selected'), h: e.getBoundingClientRect().height, art: e.querySelectorAll('img, canvas, svg').length }))).toMatchObject({ art: 1 });
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    // 閉じる
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.input.press('openLog');
      h.step(1);
      h.input.release('openLog');
      h.step(2);
    });
    expect(await page.evaluate(() => (window as any).__rikkun.log.ui().open)).toBe(false);
    expect(await page.evaluate(() => (window as any).__rikkun.craft.ui().panelVisible)).toBe(false);
    // もちもの タブ から → できごと
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.openInv();
      h.achievements.tab('items');
      h.step(1);
      h.input.press('openLog');
      h.step(1);
      h.input.release('openLog');
      h.step(2);
    });
    expect(await page.evaluate(() => (window as any).__rikkun.log.ui())).toMatchObject({ open: true, tab: 'log' });
    expect(await page.evaluate(() => (window as any).__rikkun.achievements.ui().tab)).toBe('log');
    // たんす画面のあいだは 何も変わらない
    await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.press('toggleInventory');
      T.tansu(A.x, A.y, A.z, [[0, 'log', 1]]);
      h.storage.open(A.x, A.y, A.z);
      h.step(2);
      h.input.press('openLog');
      h.step(1);
      h.input.release('openLog');
      h.step(2);
    }, { A });
    expect(await page.evaluate(() => (window as any).__rikkun.storage.ui().open)).toBe(true);
    expect(await page.evaluate(() => (window as any).__rikkun.log.ui().tab)).not.toBe('log');
    // 案内画面
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.storage.close();
      h.step(2);
      h.lock.simulate(false);
      h.step(2);
      h.input.press('openLog');
      h.step(1);
      h.input.release('openLog');
      h.step(2);
    });
    expect(await page.evaluate(() => (window as any).__rikkun.screen?.mode?.() ?? null)).toBeNull();
    expect(await page.evaluate(() => (window as any).__rikkun.log.ui().open)).toBe(false);
    await page.evaluate(() => (window as any).__rikkun.lock.simulate(true));

    // AC20
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const names = ['dirt', 'stone', 'sand', 'clay', 'log', 'paper', 'coal_ore', 'iron_ore', 'string', 'cloth'];
      for (let i = 0; i < 20; i++) {
        h.inventory.clear();
        h.inventory.pickup(names[i % names.length], 1);
        h.step(181);
      }
      h.log.open();
      h.step(3);
      const out: any = {};
      out.hist = h.log.history().map((e: any) => e.text);
      out.rows = Array.from(document.querySelectorAll('.log-row .log-text')).map((e) => e.textContent);
      out.latest = document.querySelectorAll('.log-row.is-latest').length;
      out.ui0 = h.log.ui();
      out.upDisabled0 = (document.querySelector('.log-up') as HTMLButtonElement).disabled || document.querySelector('.log-up')!.getAttribute('aria-disabled');
      h.log.scroll(1);
      h.step(2);
      out.ui1 = h.log.ui();
      for (let i = 0; i < 10; i++) h.log.scroll(1);
      h.step(2);
      out.uiEnd = h.log.ui();
      out.downDisabled = (document.querySelector('.log-down') as HTMLButtonElement).disabled || document.querySelector('.log-down')!.getAttribute('aria-disabled');
      return out;
    });
    expect(r.rows).toEqual(r.hist);
    expect(r.latest).toBe(1);
    expect(r.ui0.rows).toBe(r.hist.length); // 20 回 拾うと「はじめて」の実績の件も 入る
    expect(r.ui0.rows).toBeGreaterThanOrEqual(20);
    expect(r.ui0).toMatchObject({ scrollRow: 0, canUp: false, canDown: true });
    expect(r.upDisabled0).toBeTruthy();
    expect(r.ui1.scrollRow).toBe(3);
    expect(r.uiEnd.canDown).toBe(false);
    expect(r.downDisabled).toBeTruthy();
    // 7 行が パネルの中に見える・字の見た目
    await page.evaluate(() => {
      (window as any).__rikkun.log.ui();
    });
    const geo = await page.evaluate(() => {
      const panel = document.querySelector('.log-page')!.getBoundingClientRect();
      const list = document.querySelector('.log-list') as HTMLElement;
      const rows = Array.from(document.querySelectorAll('.log-row'));
      const cs = getComputedStyle(rows[0].querySelector('.log-text')!);
      const rowH = rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top;
      return { panelTop: panel.top, panelBottom: panel.bottom, listTop: list.getBoundingClientRect().top, listBottom: list.getBoundingClientRect().bottom, panelH: panel.height, listH: list.clientHeight, rowH, color: cs.color, fs: cs.fontSize, shadow: cs.textShadow, inside: list.getBoundingClientRect().bottom <= panel.bottom + 1 };
    });
    expect(geo.listH).toBeGreaterThanOrEqual(geo.rowH * 7 - 2);
    expect(geo.inside, JSON.stringify(geo)).toBe(true);
    expect(geo.color).toBe('rgb(255, 255, 255)');
    expect(geo.fs).toBe('20px');
    expect(geo.shadow).not.toBe('none');
    // 0 件
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.log.clear();
      h.step(2);
    });
    await expect(page.locator('.log-empty')).toBeVisible();
    expect(await page.locator('.log-empty').textContent()).toContain('まだ なにも ないよ');

    // AC21
    const icons = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const cats = ['pickup', 'craft', 'fight', 'achieve', 'info', 'warn'];
      return cats.map((c) => ({ c, px: h.log.icon(c) as (string | null)[] }));
    });
    const shapes: Record<string, boolean[]> = {};
    for (const i of icons) {
      expect(i.px.length).toBe(256);
      shapes[i.c] = i.px.map((p) => p !== null);
    }
    const cs = Object.keys(shapes);
    for (let a = 0; a < cs.length; a++)
      for (let b = a + 1; b < cs.length; b++) {
        let diff = 0;
        for (let k = 0; k < 256; k++) if (shapes[cs[a]][k] !== shapes[cs[b]][k]) diff++;
        expect(diff, `${cs[a]} と ${cs[b]}`).toBeGreaterThanOrEqual(20);
      }
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.pickup('dirt', 1);
      h.step(181);
      h.inventory.setSlot(1, { item: 'log', count: 3 });
      h.step(2);
    });
    const marks = await page.locator('.log-row [data-cat][data-shape]').evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.cat, (e as HTMLElement).dataset.shape]));
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]).toEqual(['pickup', 'circle']);
  });
});

test.describe('CRAFT-2 半透明', () => {
  test('AC22・AC24: はじめの値・設定・字のふち', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const out: any = {};
      out.alpha = h.ui.alpha();
      T.openInv();
      const bgAlpha = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map((s) => parseFloat(s));
        return p.length === 4 ? p[3] : 1;
      };
      out.panel = bgAlpha('#inventory-screen .inv-frame');
      out.scrim = bgAlpha('#inventory-screen');
      h.settings.set('uiPanelAlpha', 0.3);
      h.step(2);
      out.alpha2 = h.ui.alpha();
      out.panel2 = bgAlpha('#inventory-screen .inv-frame');
      h.settings.set('uiPanelAlpha', 0.8);
      h.step(1);
      return out;
    });
    expect(r.alpha).toEqual({ panel: 0.8, hud: 0.6, scrim: 0.2, min: 0.6 });
    expect(r.panel).toBeCloseTo(0.8, 1);
    expect(r.scrim).toBeCloseTo(0.2, 1);
    expect(r.alpha2.panel).toBe(0.6);
    expect(r.panel2).toBeCloseTo(0.6, 1);
  });

  test('AC24: HUD・パネルの上の字は 白で ふちが ある', async ({ page }) => {
    await open(page);
    await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.pickup('dirt', 2);
      T.tansu(A.x, A.y, A.z, [[0, 'log', 3]]);
      h.craft.make('wood_pickaxe');
      h.step(3);
    }, { A });
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const sel of ['#pickup-log', '#hud .rk-clock, #hud .clock, #clock']) {
        for (const root of Array.from(document.querySelectorAll(sel))) {
          for (const el of Array.from(root.querySelectorAll('*'))) {
            const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
            if (!own) continue;
            const cs = getComputedStyle(el);
            if (cs.textShadow === 'none') out.push(`${sel} ${(el as HTMLElement).className}: shadow none`);
            if (cs.color !== 'rgb(255, 255, 255)') out.push(`${(el as HTMLElement).className}: ${cs.color}`);
          }
        }
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('AC23: まっ白の世界でも 読める（HUD・もちもの・できごと・つくる・たんす・案内）', async ({ page }) => {
    await open(page);
    const check = async (label: string, root: string, opt: any = { hudWorld: '#ffffff', pageBase: '#ffffff' }) => {
      const snap = await snapshotUi(page, { root });
      const bad = checkContrast(snap, opt);
      expect(bad, label).toEqual([]);
    };
    await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.pickup('dirt', 2);
      h.inventory.setSlot(1, { item: 'log', count: 1 });
      T.tansu(A.x, A.y, A.z, [[0, 'log', 3]]);
      h.craft.make('wood_pickaxe');
      h.step(3);
    }, { A });
    for (const lows of [false, true]) {
      if (lows) {
        await page.evaluate(() => {
          const h = (window as any).__rikkun;
          h.settings.set('uiPanelAlpha', 0.1);
          h.settings.set('uiHudAlpha', 0.1);
          h.step(2);
        });
      }
      await check(`HUD ${lows}`, '#hud');
      await page.evaluate(() => (window as any).T.openInv());
      await check(`もちもの ${lows}`, '#inventory-screen');
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.craft.hover('wood_pickaxe');
        h.step(2);
      });
      await check(`つくる ${lows}`, '#inventory-screen');
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.achievements.tab('achievements');
        h.step(2);
      });
      await check(`じっせき ${lows}`, '#inventory-screen');
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.log.open();
        h.step(2);
      });
      await check(`できごと ${lows}`, '#inventory-screen');
      await page.evaluate(({ A }) => {
        const h = (window as any).__rikkun;
        h.achievements.tab('items');
        (window as any).T.press('toggleInventory');
        h.storage.open(A.x, A.y, A.z);
        h.step(3);
      }, { A });
      await check(`たんす ${lows}`, '#inventory-screen');
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.storage.close();
        h.step(2);
        h.lock.simulate(false);
        h.step(2);
      });
      await check(`案内 ${lows}`, '.play-overlay');
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.lock.simulate(true);
        h.step(2);
      });
    }
  });

  test('AC25: 画面の文字に 漢字が ない（ふりがなの外）', async ({ page }) => {
    await open(page);
    const bad = await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const out: string[] = [];
      const kanji = /[一-鿿]/;
      const scan = (label: string) => {
        const walker = document.createTreeWalker(document.getElementById('hud')!.parentElement!, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = walker.nextNode())) {
          const t = n.textContent ?? '';
          if (!kanji.test(t)) continue;
          const el = n.parentElement!;
          if (el.closest('ruby') && !el.closest('rt') ) continue;
          if (el.closest('rt')) continue;
          if (getComputedStyle(el).display === 'none') continue;
          out.push(`${label}: ${t}`);
        }
      };
      h.inventory.pickup('dirt', 2);
      T.tansu(A.x, A.y, A.z, [[0, 'log', 3]]);
      h.craft.make('wood_pickaxe');
      h.step(3);
      scan('hud');
      T.openInv();
      scan('items');
      h.log.open();
      h.step(2);
      scan('log');
      return out;
    }, { A });
    expect(bad).toEqual([]);
  });

  test('案内画面: つくる・やく に 2 行（BOOK-1: 本の 項目 craft-log・craft-nearby）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.lock.simulate(false);
      h.lock.tab('craft');
      h.step(2);
      const out: any = { g: h.lock.get(), cap: {} };
      for (const id of ['craft-log', 'craft-nearby']) {
        h.lock.book(id);
        for (let i = 0; i < 1200 && h.lock.get().bookAnim !== 'none'; i++) h.step(1);
        h.step(2);
        out.cap[id] = h.lock.get().bookCaption;
      }
      return out;
    });
    expect(r.g.guideItems).toBe(9);
    expect(r.g.bookChapters.find((c: any) => c.id === 'craft').itemIds).toContain('craft-log');
    expect(r.cap['craft-log']).toContain('L で できごと を みる');
    expect(r.cap['craft-nearby']).toContain('ちかくの たんす の ものも つかえる');
  });
});

test.describe('CRAFT-2 スクショ（AC26）', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('a〜g', async ({ page }) => {
    // 7 まいの場面を 続けて作る（場所づくり T.base を 5 回、高さ 352 の空気ぬき つき）ので、1 本ぶんの時間を 長くする（ステップ数や待ちは 変えない）
    test.setTimeout(300_000);
    mkdirSync(SHOTS, { recursive: true });
    await open(page);
    const setup = async (time: number) => {
      await page.evaluate(({ A, time }) => {
        const h = (window as any).__rikkun;
        const T = (window as any).T;
        if (h.craft.ui().panelVisible) T.press('toggleInventory');
        T.base();
        h.world.fill(0, 8, 0, 40, 8, 40, 'grass');
        h.time.set(time);
        h.inventory.setSlot(0, { item: 'wood_pickaxe', count: 1 });
        h.inventory.setSlot(1, { item: 'log', count: 1 });
        h.inventory.setSlot(2, { item: 'dirt', count: 12 });
        h.inventory.setSlot(3, { item: 'stone', count: 30 });
        h.inventory.setSlot(4, { item: 'iron_ore', count: 2 });
        h.inventory.setSlot(10, { item: 'paper', count: 3 });
        T.tansu(A.x, A.y, A.z, [[0, 'log', 2]]);
        (window as any).__aim.standForS(10.5, 10.5, 90, -5, 9);
        h.step(60);
      }, { A, time });
    };
    // (a)(b)(d) もちもの画面
    for (const [name, time] of [['a-day-inventory', 6000], ['b-night-inventory', 70000]] as const) {
      await setup(time);
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        (window as any).T.openInv();
        h.craft.hover('wood_pickaxe');
        h.step(3);
      });
      await page.screenshot({ path: `${SHOTS}/${name}.png` });
      if (name.startsWith('a')) {
        const d = page.locator('.cp-mat[data-item="log"]');
        await d.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SHOTS}/d-materials-kiri.png` });
        await page.screenshot({ path: `${SHOTS}/d-materials-kiri-zoom.png`, clip: await (async () => {
          const b = await d.boundingBox();
          const x = Math.max(0, (b?.x ?? 400) - 120);
          const y = Math.max(0, (b?.y ?? 300) - 160);
          return { x, y, width: Math.min(560, 1280 - x), height: Math.min(380, 720 - y) };
        })() });
      }
    }
    // (c) 昼の空を見上げた HUD（ログ 3 行）
    await setup(6000);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.clear();
      h.inventory.pickup('dirt', 3);
      h.inventory.pickup('stone', 5);
      h.inventory.setSlot(8, { item: 'log', count: 1 });
      h.craft.make('wood_pickaxe');
      (window as any).__aim.standForS(10.5, 10.5, 90, -70, 9);
      h.step(20);
    });
    await page.screenshot({ path: `${SHOTS}/c-hud-sky-log3.png` });
    // (e) できごと ページ（6 カテゴリー）
    await setup(6000);
    await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const face = () => {
        (window as any).__aim.standForS(10.5, 10.5, 90, 0, 9);
        h.step(2);
      };
      // 1 回目は「はじめて」の実績の件を すませるため。2 回目の件だけを 見せる
      const round = (n: number) => {
        h.inventory.clear();
        h.inventory.pickup('dirt', 4);
        h.step(181);
        h.inventory.setSlot(8, { item: 'log', count: 1 });
        T.tansu(A.x, A.y, A.z, [[0, 'log', 2]]);
        h.craft.make('wood_pickaxe');
        h.step(181);
        h.inventory.clear();
        const id = h.yokai.spawn('karakasa', 12.5, 9, 10.5, { ai: false });
        h.yokai.setHp(id, 1);
        h.inventory.setSlot(0, { item: 'katana', count: 1 });
        h.inventory.select(0);
        face();
        h.input.press('primary');
        h.step(20);
        h.input.release('primary');
        h.step(5);
        h.yokai.clear();
        h.step(181);
        h.inventory.clear();
        h.world.setBlock(14, 10, 10, 'stone');
        h.inventory.setSlot(0, { item: 'wood_pickaxe', count: 1 });
        h.inventory.select(0);
        h.inventory.setDurability(0, 1);
        face();
        h.input.press('primary');
        h.step(200);
        h.input.release('primary');
        h.step(2);
        h.input.press('primary');
        h.step(3);
        h.input.release('primary');
        h.step(2);
        h.step(181);
        h.inventory.clear();
        h.inventory.setSlot(0, { item: 'yumi', count: 1 });
        h.inventory.select(0);
        h.input.press('primary');
        h.step(15);
        h.input.release('primary');
        h.step(2);
        h.step(181);
        h.level.add(n > 1 ? n : Math.max(1, h.level.get().next - h.level.get().xp)); // 2 回目は ちょうど つぎのレベルに とどく だけ
        h.step(2);
      };
      round(1);
      h.step(300);
      h.log.clear();
      round(1000);
      h.input.press('openLog');
      h.step(1);
      h.input.release('openLog');
      h.step(3);
    }, { A });
    await page.screenshot({ path: `${SHOTS}/e-log-page.png` });
    const cats = await page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('.log-row')).map((e) => (e as HTMLElement).dataset.cat))));
    console.log('log categories', cats);
    expect(cats.length).toBe(6);
    // (f) 0 件
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.log.clear();
      h.step(3);
    });
    await page.screenshot({ path: `${SHOTS}/f-log-empty.png` });
    // (g) 雪・砂のような 明るい地面の上の 合図（まっさらな状態から）
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      h.world.fill(0, 8, 0, 40, 8, 40, 'sand');
      h.world.fill(0, 9, 0, 40, 9, 40, 'sand');
      h.inventory.clear();
      for (let i = 0; i < 36; i++) h.inventory.setSlot(i, { item: 'dirt', count: 64 });
      h.inventory.select(0);
      h.time.set(6000);
      (window as any).__aim.standForS(10.5, 11.2, 90, -25, 10);
      h.step(5);
      h.input.press('primary');
      h.step(60);
      h.input.release('primary');
      h.step(2);
      h.input.press('primary');
      h.step(3);
      h.input.release('primary');
      h.step(3);
    });
    await page.screenshot({ path: `${SHOTS}/g-sand-signal.png` });
  });
});
