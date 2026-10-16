import { expect, test, type Page } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';

/**
 * CRAFT-2 テスト係の 足し分（e2e/craft2.spec.ts が ゆるい／足りない AC だけ）。
 * 場所は craft2.spec.ts と同じ。P = (10.5, 9, 10.5)、たんす A = (13, 9, 10)。
 */
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
        h.world.fill(0, 9, 0, 40, 20, 40, 'air');
        h.inventory.clear();
        for (const p of h.storage.list()) for (let i = 0; i < 54; i++) h.storage.set(p.x, p.y, p.z, i, null);
        h.time.set(6000);
        (window as any).__aim.standForS(10.5, 10.5, 90, 0, 9);
        h.step(10);
        h.log.clear();
        h.craft.events();
      },
      tansu(x: number, y: number, z: number, items: [number, string, number][] = []) {
        h.world.setBlock(x, y, z, 'tansu');
        for (let i = 0; i < 54; i++) h.storage.set(x, y, z, i, null);
        for (const [slot, item, n] of items) h.storage.set(x, y, z, slot, { item, count: n });
      },
      press(a: string) {
        h.input.press(a);
        h.step(1);
        h.input.release(a);
        h.step(1);
      },
    };
    (window as any).T = T;
  });
}
const A = { x: 13, y: 9, z: 10 };

test('AC10: たんす から つかった 結果が 保存される', async ({ page }) => {
  await open(page, '');
  await page.evaluate(({ A }) => {
    const h = (window as any).__rikkun;
    const T = (window as any).T;
    T.base();
    T.tansu(A.x, A.y, A.z, [[0, 'log', 5]]);
    h.storage.open(A.x, A.y, A.z);
    h.step(2);
    h.craft.make('bokuto'); // き 2
    h.step(2);
    h.storage.close();
    h.step(2);
    h.save.now();
  }, { A });
  await page.reload();
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  const left = await page.evaluate(({ A }) => {
    const s: any[] = (window as any).__rikkun.storage.get(A.x, A.y, A.z)?.slots ?? [];
    return s.reduce((n, st) => n + (st && st.item === 'log' ? st.count : 0), 0);
  }, { A });
  expect(left).toBe(3);
});

test('AC13: ひとつの行に まとめる と ticksLeft 180・もちもの だけは ふえない', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(({ A }) => {
    const h = (window as any).__rikkun;
    const T = (window as any).T;
    T.base();
    h.inventory.setSlot(0, { item: 'log', count: 2 });
    T.tansu(A.x, A.y, A.z, [[0, 'log', 9]]);
    h.craft.make('wood_pickaxe');
    h.step(1);
    const first = h.log.live().filter((e: any) => e.kind === 'fromTansu');
    h.step(60);
    const mid = h.log.live().filter((e: any) => e.kind === 'fromTansu')[0].ticksLeft;
    h.inventory.clear();
    h.craft.make('wood_pickaxe'); // たんす から 3 こ
    h.step(1);
    const second = h.log.live().filter((e: any) => e.kind === 'fromTansu');
    return { first, mid, second };
  }, { A });
  expect(r.first).toEqual([{ kind: 'fromTansu', category: 'craft', item: 'log', count: 1, text: 'たんす から き ×1', ticksLeft: expect.any(Number) }]);
  expect(r.first[0].ticksLeft).toBeGreaterThanOrEqual(179);
  expect(r.mid).toBeLessThanOrEqual(120);
  expect(r.second.length).toBe(1);
  expect(r.second[0].ticksLeft).toBeGreaterThanOrEqual(179);
  expect(r.second[0]).toMatchObject({ count: 4, text: 'たんす から き ×4' });
});

test('AC14: pickupLog は たんす から の行を ふくまない', async ({ page }) => {
  await open(page);
  const pl = await page.evaluate(({ A }) => {
    const h = (window as any).__rikkun;
    const T = (window as any).T;
    T.base();
    h.inventory.pickup('dirt', 1);
    T.tansu(A.x, A.y, A.z, [[0, 'log', 3]]);
    h.craft.make('wood_pickaxe');
    h.step(1);
    return h.inventory.pickupLog().map((e: any) => e.item);
  }, { A });
  expect(pl).not.toContain('log');
  expect(pl).toContain('dirt');
});

test('AC15: こわれた ログ(#wear-log)の 行に [data-cat=info] の印', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    (window as any).T.base();
    h.inventory.setSlot(0, { item: 'wood_pickaxe', count: 1 });
    h.inventory.select(0);
    h.inventory.setDurability(0, 1);
    h.world.setBlock(14, 10, 10, 'stone');
    h.input.press('primary');
    h.step(240);
    h.input.release('primary');
    h.step(2);
    h.input.press('primary');
    h.step(3);
    h.input.release('primary');
    h.step(2);
  });
  expect(await page.locator('#wear-log .wear-row').count()).toBeGreaterThan(0);
  expect(await page.locator('#wear-log .wear-row [data-cat="info"]').count()).toBeGreaterThan(0);
});

test('AC16: 文・カテゴリー・item・「履歴だけ」は 左のログに出ない・もうすぐ こわれる', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(({ A }) => {
    const h = (window as any).__rikkun;
    const T = (window as any).T;
    T.base();
    const out: any = {};
    const top = (kind: string) => h.log.history().find((e: any) => e.kind === kind) ?? null;
    h.inventory.setSlot(0, { item: 'log', count: 1 });
    T.tansu(A.x, A.y, A.z, [[0, 'log', 5]]);
    h.craft.make('wood_pickaxe');
    h.step(1);
    out.fromTansu = top('fromTansu');
    out.craft = top('craft');
    h.step(200);
    h.world.setBlock(11, 9, 12, 'furnace');
    h.inventory.clear();
    h.inventory.add('iron_ore', 1);
    h.inventory.add('log', 3);
    h.furnace.bake('iron_ingot', 11, 9, 12);
    h.step(1);
    out.bake = top('bakeStart');
    out.liveKinds = h.log.live().map((e: any) => e.kind);
    out.liveItems = h.log.live().map((e: any) => e.item);
    // もうすぐ こわれる
    h.step(200);
    h.world.setBlock(14, 10, 10, 'stone');
    h.inventory.clear();
    h.inventory.setSlot(0, { item: 'wood_pickaxe', count: 1 });
    h.inventory.select(0);
    h.inventory.setDurability(0, 7);
    (window as any).__aim.standForS(10.5, 10.5, 90, 0, 9);
    h.step(2);
    h.input.press('primary');
    h.step(200);
    h.input.release('primary');
    h.step(2);
    h.input.press('primary');
    h.step(3);
    h.input.release('primary');
    h.step(2);
    out.blk = h.world.getBlock ? h.world.getBlock(14, 10, 10) : 'n/a';
    out.low = top('wearLow');
    out.dbg = h.log.history().map((e: any) => e.kind + ':' + e.text);
    out.dur = h.inventory.get().slots?.[0] ?? null;
    // たおした は live に出ない
    h.step(200);
    h.log.clear();
    const id = h.yokai.spawn('karakasa', 12.5, 9, 10.5, { ai: false });
    h.yokai.setHp(id, 1);
    h.inventory.clear();
    h.inventory.setSlot(0, { item: 'katana', count: 1 });
    h.inventory.select(0);
    h.input.press('primary');
    h.step(20);
    h.input.release('primary');
    h.step(5);
    out.defeat = top('defeat');
    out.liveAfterDefeat = h.log.live().map((e: any) => e.kind);
    return out;
  }, { A });
  expect(r.fromTansu).toMatchObject({ category: 'craft', item: 'log', text: 'たんす から き ×2', positions: [{ ...A, count: 2 }] });
  expect(r.craft).toMatchObject({ category: 'craft', item: 'wood_pickaxe', count: 1, text: 'きの つるはし ×1 を つくった' });
  expect(r.bake).toMatchObject({ category: 'craft', item: 'iron_ingot', text: 'かまど で てつの かたまり を やく' });
  expect(r.liveKinds).not.toContain('craft');
  expect(r.liveKinds).not.toContain('bakeStart');
  console.log(JSON.stringify(r.dbg), JSON.stringify(r.dur), r.blk);
  expect(r.low).toMatchObject({ category: 'info', item: 'wood_pickaxe' });
  expect(r.low?.text).toContain('もうすぐ こわれるよ');
  expect(r.defeat).toMatchObject({ category: 'fight', item: null, text: 'からかさ を たおした' });
  expect(r.liveAfterDefeat).toEqual([]);
});

test.describe('できごと タブ・印', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('AC19: できごと タブが えらばれている・タブの高さ', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      (window as any).T.press('openLog');
      h.step(2);
    });
    const sel = await page.evaluate(() => {
      const tabs = (Array.from(document.querySelectorAll('[data-tab]')) as HTMLElement[]).filter((t) => t.getBoundingClientRect().height > 0);
      return tabs.map((t) => ({ tab: t.dataset.tab, aria: t.getAttribute('aria-selected'), cls: t.className, sel: t.getAttribute('data-selected'), h: t.getBoundingClientRect().height }));
    });
    const log = sel.find((t) => t.tab === 'log')!;
    const items = sel.find((t) => t.tab === 'items')!;
    const isSel = (t: any) => t.aria === 'true' || t.sel === 'true' || /is-(on|sel|active)|selected|active/.test(t.cls);
    expect(isSel(log), JSON.stringify(sel)).toBe(true);
    expect(isSel(items), JSON.stringify(sel)).toBe(false);
    for (const t of sel) expect(t.h).toBeGreaterThanOrEqual(56);
  });

  test('AC21: 6 つの印の data-shape と 外の形の色', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const cats = ['pickup', 'craft', 'fight', 'achieve', 'info', 'warn'];
      const cv = (v: string) => {
        const d = document.createElement('div');
        d.style.color = `var(${v})`;
        document.body.append(d);
        const m = getComputedStyle(d).color.match(/\d+/g)!.map(Number);
        d.remove();
        return m;
      };
      const want: Record<string, string> = { pickup: '--rk-ok', craft: '--rk-accent', fight: '--rk-accent-2', achieve: '--rk-rarity-3', info: '--rk-info', warn: '--rk-ng' };
      const out: any = {};
      for (const c of cats) {
        const px: (string | null)[] = h.log.icon(c);
        const cnt = new Map<string, number>();
        for (const p of px) if (p && p.toLowerCase() !== '#ffffff' && p.toLowerCase() !== '#10141f') cnt.set(p, (cnt.get(p) ?? 0) + 1);
        const dom = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const rgb = [1, 3, 5].map((i) => parseInt(dom.slice(i, i + 2), 16));
        const w = cv(want[c]);
        out[c] = { dom, want: w, diff: Math.max(...rgb.map((v, i) => Math.abs(v - w[i]))), opaque: px.filter((p) => p).length, white: px.filter((p) => p && p.toLowerCase() === '#ffffff').length, edge: px.filter((p) => p && p.toLowerCase() === '#10141f').length };
      }
      // DOM: 6 種を 履歴に
      h.inventory.pickup('dirt', 1);
      h.log.open();
      h.step(2);
      return out;
    });
    for (const c of Object.keys(r)) {
      expect(r[c].diff, `${c} ${JSON.stringify(r[c])}`).toBeLessThanOrEqual(1);
      expect(r[c].white, `${c} 白い絵`).toBeGreaterThan(0);
      expect(r[c].edge, `${c} ふち`).toBeGreaterThan(0);
    }
    // 6 つの形の名前（DOM）
    const shapes = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      T.tansu(13, 9, 10, [[0, 'log', 3]]);
      h.inventory.setSlot(0, { item: 'log', count: 1 });
      const out: [string, string][] = [];
      h.inventory.pickup('dirt', 1);
      h.step(181);
      h.craft.make('wood_pickaxe');
      h.step(181);
      const id = h.yokai.spawn('karakasa', 12.5, 9, 10.5, { ai: false });
      h.yokai.setHp(id, 1);
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'katana', count: 1 });
      h.inventory.select(0);
      h.input.press('primary');
      h.step(20);
      h.input.release('primary');
      h.step(5);
      h.yokai.clear();
      h.step(181);
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'yumi', count: 1 });
      h.inventory.select(0);
      h.input.press('primary');
      h.step(15);
      h.input.release('primary');
      h.step(2);
      h.level.add(1000);
      h.step(2);
      h.world.setBlock(14, 10, 10, 'stone');
      h.inventory.setSlot(1, { item: 'wood_pickaxe', count: 1 });
      h.inventory.select(1);
      h.inventory.setDurability(1, 1);
      h.input.press('primary');
      h.step(200);
      h.input.release('primary');
      h.step(2);
      h.input.press('primary');
      h.step(3);
      h.input.release('primary');
      h.log.open();
      h.step(3);
      for (const e of Array.from(document.querySelectorAll('.log-row [data-cat][data-shape]')) as HTMLElement[]) out.push([e.dataset.cat!, e.dataset.shape!]);
      return out;
    });
    const map: Record<string, string> = { pickup: 'circle', craft: 'square', fight: 'hexagon', achieve: 'star', info: 'diamond', warn: 'triangle' };
    const seen = new Set<string>();
    for (const [c, s] of shapes) {
      expect(s).toBe(map[c]);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});

test.describe('半透明（足し分）', () => {
  test('AC22: HUD 0.6・うしろの暗さ・マス・ボタン・やられた画面', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const a = (el: Element | null) => {
        if (!el) return null;
        const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[,/ ]+/).filter(Boolean).map(parseFloat);
        return p.length >= 4 ? p[3] : 1;
      };
      const out: any = {};
      h.inventory.pickup('dirt', 1);
      h.inventory.setSlot(1, { item: 'log', count: 1 });
      T.tansu(A.x, A.y, A.z, [[0, 'log', 3]]);
      h.craft.make('wood_pickaxe');
      h.step(3);
      out.logRow = a(document.querySelector('#pickup-log .pickup-row'));
      out.clock = a(document.querySelector('#clock'));
      out.self = a(document.querySelector('#hud-self'));
      out.hotbarEmpty = a(document.querySelector('#hotbar .slot:not([data-cat])'));
      out.hotbarFull = a(document.querySelector('#hotbar .slot[data-cat]'));
      T.press('toggleInventory');
      h.step(2);
      out.invFull = a(document.querySelector('#inventory-screen .slot[data-cat]'));
      out.btn = a(document.querySelector('#inventory-screen .rk-btn, #inventory-screen button'));
      out.card = a(document.querySelector('#inventory-screen .cp-detail, #inventory-screen .cp-card'));
      T.press('toggleInventory');
      h.lock.simulate(false);
      h.step(3);
      out.guide = a(document.querySelector('.play-overlay'));
      h.lock.simulate(true);
      h.step(2);
      h.combat.setHp(0);
      h.step(30);
      return out;
    }, { A });
    expect(r.logRow).toBeCloseTo(0.6, 1);
    expect(r.clock).toBeCloseTo(0.6, 1);
    expect(r.self).toBeCloseTo(0.6, 1);
    expect(r.hotbarEmpty).toBeCloseTo(0.6, 1);
    expect(r.hotbarFull).toBe(1);
    expect(r.invFull).toBe(1);
    expect(r.btn).toBe(1);
    expect(r.guide).toBeCloseTo(0.2, 1);
    await page.waitForTimeout(1500); // やられた画面の ふわっと出る 動き（実時間）が おわるのを まつ
    const death = await page.evaluate(() => {
      const d = document.querySelector('.rk-scrim') as HTMLElement;
      const m = getComputedStyle(d).backgroundColor.match(/rgba?\(([^)]+)\)/)!;
      const p = m[1].split(/[,/ ]+/).filter(Boolean).map(parseFloat);
      return { visible: !d.hidden, alpha: p.length >= 4 ? p[3] : 1, op: getComputedStyle(d).opacity, bg: getComputedStyle(d).backgroundColor };
    });
    // やられた画面には 暗いうしろが 無く（白いフラッシュ + カード）、モーダルの うしろ（.rk-scrim）が 0.50 のまま
    expect(death.alpha * parseFloat(death.op), JSON.stringify(death)).toBeCloseTo(0.5, 1);
  });

  test('AC24: すける下地の上の字は 白＋ふち（HUD・もちもの・できごと・たんす・案内）', async ({ page }) => {
    await open(page);
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
    const scan = async (label: string) =>
      page.evaluate((label) => {
        const bad: string[] = [];
        const alphaOf = (el: Element) => {
          const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
          if (!m) return 0;
          const p = m[1].split(/[,/ ]+/).filter(Boolean).map(parseFloat);
          return p.length >= 4 ? p[3] : 1;
        };
        let n = 0;
        for (const el of Array.from(document.querySelectorAll('body *')) as HTMLElement[]) {
          const own = Array.from(el.childNodes).some((x) => x.nodeType === 3 && (x.textContent ?? '').trim());
          if (!own) continue;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') continue;
          if (el.closest('[hidden]') || el.closest('rt') || el.closest('#title, .title-screen')) continue;
          if (parseFloat(cs.opacity) === 0) continue;
          let a: number | null = null;
          for (let p: HTMLElement | null = el; p; p = p.parentElement) {
            const al = alphaOf(p);
            if (al > 0) { a = al; break; }
          }
          n++;
          if (a !== null && a >= 0.99) continue; // 不透明な 下地の上
          const big = parseFloat(cs.fontSize) >= 24 && parseInt(cs.fontWeight) >= 700;
          if (big) continue;
          const name = `${label} ${el.tagName}.${el.className}「${(el.textContent ?? '').trim().slice(0, 12)}」`;
          if (cs.color !== 'rgb(255, 255, 255)') bad.push(`${name} color ${cs.color}`);
          if (cs.textShadow === 'none') bad.push(`${name} shadow none`);
        }
        return { bad, n };
      }, label);
    const results: any[] = [];
    results.push(await scan('HUD'));
    await page.evaluate(() => {
      (window as any).T.press('toggleInventory');
      (window as any).__rikkun.craft.hover('wood_pickaxe');
      (window as any).__rikkun.step(2);
    });
    results.push(await scan('もちもの'));
    await page.evaluate(() => { (window as any).__rikkun.achievements.tab('achievements'); (window as any).__rikkun.step(2); });
    results.push(await scan('じっせき'));
    await page.evaluate(() => { (window as any).__rikkun.log.open(); (window as any).__rikkun.step(2); });
    results.push(await scan('できごと'));
    await page.evaluate(() => { (window as any).__rikkun.log.clear(); (window as any).__rikkun.step(2); });
    results.push(await scan('0件'));
    await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      h.achievements.tab('items');
      (window as any).T.press('toggleInventory');
      h.storage.open(A.x, A.y, A.z);
      h.step(3);
    }, { A });
    results.push(await scan('たんす'));
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.storage.close();
      h.step(2);
      h.lock.simulate(false);
      h.step(2);
    });
    results.push(await scan('案内'));
    const bad = results.flatMap((x) => x.bad);
    console.log('AC24 scanned', results.map((x) => x.n));
    expect(bad).toEqual([]);
  });
});

test.describe('AC26 撮り直し（足りない画面だけ）', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  const SHOTS = 'docs/test-reports/CRAFT-2/shots';

  test('b 夜のもちもの（動きが おわるのを まつ）・e 6 カテゴリーが 7 行に入る・f 0 件', async ({ page }) => {
    await open(page);
    await page.evaluate(({ A }) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.fill(0, 8, 0, 40, 8, 40, 'grass');
      h.time.set(70000);
      h.inventory.setSlot(0, { item: 'wood_pickaxe', count: 1 });
      h.inventory.setSlot(1, { item: 'log', count: 1 });
      h.inventory.setSlot(2, { item: 'dirt', count: 12 });
      T.tansu(A.x, A.y, A.z, [[0, 'log', 2]]);
      h.step(60);
      T.press('toggleInventory');
      h.step(3);
      h.craft.hover('wood_pickaxe');
      h.step(3);
    }, { A });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/b-night-inventory.png` });

    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.press('toggleInventory');
      h.step(2);
    });
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.fill(0, 8, 0, 40, 8, 40, 'grass');
      h.time.set(6000);
      const face = () => {
        (window as any).__aim.standForS(10.5, 10.5, 90, 0, 9);
        h.step(2);
      };
      const kill = () => {
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
      };
      const round = (lv: number) => {
        // 古い → 新しい: いしを ほる（こわれた） → つくった → や が いるよ → たおした（ひろう いと）。7 行に 6 カテゴリー
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
        h.inventory.add('log', 3);
        h.craft.make('wood_pickaxe');
        h.step(181);
        h.inventory.clear();
        h.inventory.setSlot(0, { item: 'yumi', count: 1 });
        h.inventory.select(0);
        face();
        h.input.press('primary');
        h.step(15);
        h.input.release('primary');
        h.step(2);
        h.step(181);
        kill();
        // 2 回目は ちょうど つぎのレベルに とどく だけ足す（たおした経験値で ずれても レベルの件が かならず出る）
        h.level.add(lv > 1 ? lv : Math.max(1, h.level.get().next - h.level.get().xp));
        h.step(2);
      };
      round(1000); // はじめての 実績・レベルの 実績の件を すませる
      h.step(300);
      h.log.clear();
      round(1);
      h.inventory.clear();
      T.press('openLog');
      h.step(3);
    });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/e-log-page.png` });
    const cats = await page.evaluate(() => {
      const list = document.querySelector('.log-list') as HTMLElement;
      const lr = list.getBoundingClientRect();
      return (Array.from(document.querySelectorAll('.log-row')) as HTMLElement[])
        .filter((e) => { const r = e.getBoundingClientRect(); return r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1; })
        .map((e) => e.dataset.cat!);
    });
    console.log('見えている行の カテゴリー', cats, await page.evaluate(() => (window as any).__rikkun.log.history().slice(0, 12).map((e: any) => e.category + ':' + e.text)));
    expect(new Set(cats).size).toBe(6);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.log.clear();
      h.step(3);
    });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/f-log-empty.png` });
  });
});
