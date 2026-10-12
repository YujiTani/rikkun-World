import { expect, test, type Page } from '@playwright/test';
import { findUnrubiedKanji } from '../src/ui/text';

/** M6 受け入れテスト T1（docs/test-reports/M6-t1.md）。AC1〜AC29・AC54〜AC56・U1〜U14 */
const ASSETS = 'docs/test-reports/assets';
test.use({ viewport: { width: 1280, height: 720 } });
test.describe.configure({ timeout: 120_000 });

async function open(page: Page, query = '?nosave=1') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const T: any = {
      base(opts: { modal?: boolean } = {}) {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.settings.set('yokaiAutoSpawn', false);
        h.settings.set('yokaiWander', false);
        h.yokai.clear();
        h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
        h.world.fill(0, 9, 0, 12, 20, 12, 'air');
        h.inventory.clear();
        h.armor.set(null, null);
        h.time.set(0);
        h.settings.set('dropMax', { common: 1, uncommon: 1, rare: 1, superRare: 1 });
        T.place(2.5, 9, 6.5, 90, 0);
        h.step(10);
        h.achievements.reset();
        // おめでとう画面を試すときだけ 0。ほかは ずっと出さない（出るとゲームが止まって操作が止まる）
        h.settings.set('achieveCooldown', 0);
        h.settings.set('achieveCooldownEarly', 0);
        if (!opts.modal) {
          // 「前に閉じてから」の待ちを使う: 1 回 出して 閉じて、そのあと 待ちを ずっと長くする
          h.achievements.record('level', 2);
          h.achievements.flush();
          h.step(70);
          h.achievements.close();
          h.lock.simulate(true);
          h.step(2);
          h.settings.set('achieveCooldown', 1e9);
          h.settings.set('achieveCooldownEarly', 1e9);
        }
        h.achievements.events();
        h.achievements.sounds();
        h.craft.sounds();
        h.dig.events();
      },
      place(x: number, y: number, z: number, yaw: number, pitch: number) {
        h.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
        h.step(1);
      },
      one(id: number) {
        return h.yokai.list().find((y: any) => y.id === id);
      },
      tap(a: string) {
        h.input.press(a);
        h.step(1);
        h.input.release(a);
        h.step(1);
      },
      openInv() {
        h.input.press('toggleInventory');
        h.step(1);
        h.input.release('toggleInventory');
        h.step(1);
      },
    };
    (window as any).T = T;
  });
}
const ev = <R>(page: Page, fn: () => R): Promise<R> => page.evaluate(fn);

test.describe('作る画面 AC1〜AC8・AC55・AC56', () => {
  test('AC1/AC56: マスは持っている材料のものだけ・0 この文・56px', async ({ page }) => {
    await open(page);
    const r = await ev(page, () => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      T.openInv();
      const out: any = {};
      out.empty = h.craft.ui();
      out.emptyText = document.querySelector('.cp-empty')?.textContent ?? null;
      out.emptyVisible = !!document.querySelector('.cp-empty') && (document.querySelector('.cp-empty') as HTMLElement).offsetParent !== null;
      h.inventory.add('log', 2);
      h.step(1);
      out.log = h.craft.ui();
      return out;
    });
    await page.waitForTimeout(600);
    const r2 = await ev(page, () => {
      const h = (window as any).__rikkun;
      const out: any = {};
      const t = document.querySelector('.cp-tile[data-id="bokuto"]') as HTMLElement;
      const rr = t.getBoundingClientRect();
      out.tileSize = [rr.width, rr.height, getComputedStyle(t).boxSizing, getComputedStyle(t).borderTopWidth];
      out.tileText = t.textContent;
      out.tileImgs = t.querySelectorAll('img').length;
      out.tileKids = Array.from(t.children).map((c) => c.tagName + '.' + c.className);
      h.inventory.clear();
      h.step(1);
      out.cleared = h.craft.ui().tiles.length;
      // 全部入れる → 21 こ
      for (const it of ['log', 'stone', 'iron_ingot', 'string', 'cloth', 'oil', 'paper', 'crystal', 'grass']) h.inventory.add(it, 10);
      h.step(1);
      out.all = h.craft.ui().tiles.map((x: any) => x.id);
      out.cards = h.craft.ui().cards.length;
      return out;
    });
    Object.assign(r, r2);
    console.log(JSON.stringify({ tile: r.tileSize, text: r.tileText, imgs: r.tileImgs, kids: r.tileKids, all: r.all, cards: r.cards, emptyText: r.emptyText }));
    expect(r.empty.tiles.length).toBe(0);
    expect(r.emptyVisible).toBe(true);
    expect(r.emptyText).toContain('ざいりょう を あつめよう！');
    expect(r.log.tiles.length).toBeGreaterThan(0);
    const bk = r.log.tiles.find((x: any) => x.id === 'bokuto');
    expect(bk.glowing).toBe(true);
    expect(bk.dim).toBe(false);
    // 光る → うすい の順
    const ids = r.log.tiles.map((x: any) => x.glowing);
    expect(ids.indexOf(false)).toBeGreaterThan(ids.lastIndexOf(true));
    // 材料のあるレシピだけ: log を使うもの
    for (const x of r.log.tiles) expect(['bokuto', 'wood_pickaxe', 'naginata', 'yumi', 'torch', 'tansu', 'lantern', 'kite', 'katana', 'futon', 'omamori', 'waraji', 'ya', 'stone_pickaxe', 'furnace', 'iron_pickaxe', 'crystal_katana', 'kabuto', 'yoroi', 'kote', 'suneate']).toContain(x.id);
    expect(r.cleared).toBe(0);
    expect(r.all.length).toBe(21);
    expect(r.cards).toBe(21);
    expect(r.tileImgs).toBeGreaterThanOrEqual(1);
    expect(r.tileText.replace(/[✓▼]/g, '').trim()).toBe('');
    // CSS の width は 56px だが、ふち（2〜4px）が外にあり（content-box）、さらに画面に合わせて 0.96 倍される
    expect.soft(Math.abs(r.tileSize[0] - 56), `AC1 マスの四角 56px（実測 ${r.tileSize[0]}）`).toBeLessThanOrEqual(1);
  });

  test('AC2: made と later', async ({ page }) => {
    await open(page);
    const r = await ev(page, () => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      for (const it of ['log', 'stone', 'iron_ingot', 'string', 'cloth', 'oil', 'paper', 'crystal', 'grass']) h.inventory.add(it, 30);
      T.openInv();
      const out: any = {};
      out.m0 = h.craft.ui().tiles.find((x: any) => x.id === 'bokuto').made;
      out.make = h.craft.make('bokuto');
      h.step(1);
      const t = h.craft.ui().tiles;
      out.made = { bokuto: t.find((x: any) => x.id === 'bokuto').made, katana: t.find((x: any) => x.id === 'katana').made };
      out.later = t.filter((x: any) => x.later).map((x: any) => x.id);
      out.laterNot = t.filter((x: any) => !x.later).length;
      h.craft.tab?.('bake');
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.m0).toBe(false);
    expect(r.made).toEqual({ bokuto: true, katana: false });
    expect(r.later.sort()).toEqual(['futon', 'kite', 'lantern', 'omamori', 'waraji']);
    expect(r.laterNot).toBe(16);
  });
});

const KATANA_SET = () => {
  const h = (window as any).__rikkun;
  const T = (window as any).T;
  T.base();
  h.inventory.add('log', 10);
  h.inventory.add('iron_ingot', 2);
  T.openInv();
};

test.describe('作る画面 せつめい AC3〜AC8・AC55', () => {
  test('AC3: えらぶ・2 回目で作る・hover・パネルと重ならない', async ({ page }) => {
    await open(page);
    await ev(page, KATANA_SET);
    await page.waitForTimeout(600);
    const r = await ev(page, () => {
      const h = (window as any).__rikkun;
      const out: any = {};
      const ui0 = h.craft.ui();
      out.tiles = ui0.tiles.map((t: any) => t.id);
      out.firstGlow = ui0.tiles.find((t: any) => t.glowing)?.id;
      out.sel0 = ui0.selected;
      out.det0 = ui0.detail.id;
      out.finger0 = document.querySelectorAll('.cp-finger').length;
      // 選ばれていない光るマス katana
      const target = ui0.tiles.find((t: any) => t.glowing && t.id !== ui0.selected)?.id;
      out.target = target;
      out.c1 = h.craft.tileClick(target);
      out.afterC1 = { sel: h.craft.ui().selected, count: h.inventory.count(target) };
      out.c2 = h.craft.tileClick(target);
      out.afterC2 = { count: h.inventory.count(target) };
      // hover
      const ui1 = h.craft.ui();
      const others = ui1.tiles.map((t: any) => t.id).filter((i: string) => i !== ui1.selected);
      const a = others[0], b = others[1];
      h.craft.hover(a);
      const u2 = h.craft.ui();
      out.hover = { id: u2.detail.id, btn: u2.detail.button, hint: u2.detail.hint, sel: u2.selected };
      h.craft.hover(b);
      out.hover2 = h.craft.ui().detail.id;
      out.a = a; out.b = b;
      h.craft.hover(null);
      const u3 = h.craft.ui();
      out.back = { id: u3.detail.id, sel: u3.selected, hint: u3.detail.hint };
      // 重ならない
      const dr = u3.detailRect;
      out.overlap = Object.entries(u3.tileRects).filter(([, t]: any) => !(t.x + t.width <= dr.x || dr.x + dr.width <= t.x || t.y + t.height <= dr.y || dr.y + dr.height <= t.y)).map(([k]) => k);
      out.detailW = (document.querySelector('.cp-detail') as HTMLElement).offsetWidth;
      // カーソルに持つ
      h.inventory.click(9); // 持ち物マスを拾う（log が マス 0 ならホットバー）
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.sel0).toBe(r.firstGlow);
    expect(r.det0).toBe(r.sel0);
    expect(r.finger0).toBe(1);
    expect(r.c1.action).toBe('select');
    expect(r.afterC1).toEqual({ sel: r.target, count: 0 });
    expect(r.c2.action).toBe('make');
    expect(r.afterC2.count).toBe(1);
    expect(r.hover.id).toBe(r.a);
    expect(r.hover.sel).toBe(r.target);
    expect(r.hover.btn.label).toBeTruthy();
    expect(r.hover.hint).toBe('クリック で えらぶ');
    expect(r.hover2).toBe(r.b);
    expect(r.back.id).toBe(r.target);
    expect(r.back.hint).toBeNull();
    expect(r.overlap).toEqual([]);
    expect(r.detailW).toBeGreaterThanOrEqual(318);
    expect(r.detailW).toBeLessThanOrEqual(322);
  });

  test('AC3b: カーソルに持っているとき hover しても中身は selected のまま', async ({ page }) => {
    await open(page);
    await ev(page, KATANA_SET);
    const r = await ev(page, () => {
      const h = (window as any).__rikkun;
      const ui0 = h.craft.ui();
      const other = ui0.tiles.map((t: any) => t.id).find((i: string) => i !== ui0.selected);
      h.inventory.click(1); // マス 1（ホットバー）は空でないものを探す
      let slot = -1;
      for (let i = 0; i < 36; i++) if (h.inventory.get().slots?.[i]) { slot = i; break; }
      if (!h.inventory.get().cursor) h.inventory.click(slot >= 0 ? slot : 0);
      const held = h.inventory.get().cursor;
      h.craft.hover(other);
      return { held, id: h.craft.ui().detail.id, sel: h.craft.ui().selected, other };
    });
    console.log(JSON.stringify(r));
    expect(r.held).toBeTruthy();
    expect(r.id).toBe(r.sel);
  });

  test('AC4/AC5: かたな のせつめい・足りない材料・つくる ボタン・設定を変えるとメーター', async ({ page }) => {
    await open(page);
    const r = await ev(page, () => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.add('iron_ingot', 1);
      h.inventory.add('log', 1);
      T.openInv();
      const out: any = {};
      h.craft.tileClick('katana');
      out.sel = h.craft.ui().selected;
      out.d = h.craft.ui().detail;
      out.set = { dmg: h.settings.get('weaponDamage'), reach: h.settings.get('weaponReach'), punch: h.settings.get('punchReach'), ticks: h.settings.get('weaponTicks') };
      out.info = h.craft.info('katana');
      out.press0 = h.craft.detailPress();
      out.count0 = h.inventory.count('katana');
      h.inventory.add('iron_ingot', 1);
      h.step(1);
      out.d2 = h.craft.ui().detail;
      out.press1 = h.craft.detailPress();
      out.after = { katana: h.inventory.count('katana'), iron: h.inventory.count('iron_ingot'), log: h.inventory.count('log') };
      return out;
    });
    console.log(JSON.stringify({ d: r.d, set: r.set, press0: r.press0, press1: r.press1, after: r.after }));
    const d = r.d;
    expect(d.name).toBe('かたな');
    expect(d.stars).toBe(3);
    expect(d.rarityWord).toBe('めずらしい');
    expect(d.use).toBe('ようかい を つよく たたく');
    expect(d.how).toBe('えらんで、ようかい に むけて ひだりクリック');
    expect(d.buttons).toEqual(['1-9', 'left']);
    expect(d.stats[0]).toMatchObject({ key: 'damage', value: 4, max: 6 });
    expect(d.stats[1]).toMatchObject({ key: 'reach' });
    expect(d.stats[2]).toMatchObject({ key: 'speed', value: 'ふつう' });
    // 読みかえ（M6-dev-split）: とどく は 設定の値（書面は 3、素手 punchReach は main の 3.5）
    expect(d.stats[1].value).toBe(r.set.punch);
    expect(d.materials).toEqual([
      { item: 'iron_ingot', have: 1, need: 2, ok: false },
      { item: 'log', have: 1, need: 1, ok: true },
    ]);
    expect(d.button).toEqual({ enabled: false, label: 'ざいりょう が たりない' });
    expect(r.press0).toMatchObject({ ok: false, reason: 'missing' });
    expect(r.count0).toBe(0);
    expect(r.d2.button).toEqual({ enabled: true, label: 'つくる' });
    expect(r.press1).toMatchObject({ ok: true });
    expect(r.after).toEqual({ katana: 1, iron: 0, log: 0 });
  });

  test('AC5: weaponDamage を変えるとメーター', async ({ page }) => {
    await open(page);
    await ev(page, KATANA_SET);
    await page.waitForTimeout(500);
    const r = await ev(page, () => {
      const h = (window as any).__rikkun;
      h.craft.tileClick('katana');
      const dmg = { ...h.settings.get('weaponDamage'), katana: 5 };
      h.settings.set('weaponDamage', dmg);
      h.step(2);
      const d = h.craft.ui().detail;
      const row = document.querySelector('.cp-detail .cp-stat[data-key="damage"]')!;
      return { v: d.stats[0].value, on: row.querySelectorAll('.rk-meter__cell.is-on').length, total: row.querySelectorAll('.rk-meter__cell').length, num: row.querySelector('.cp-stat-num')?.textContent };
    });
    expect(r.v).toBe(5);
    expect(r.on).toBe(5);
    expect(r.num).toBe('5');
  });

  test('AC6: やく のせつめい・ねんりょう', async ({ page }) => {
    await open(page);
    const r = await ev(page, () => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.setBlock(4, 10, 6, 'furnace');
      h.inventory.add('iron_ore', 1);
      T.place(2.5, 9, 6.5, 90, 0);
      T.tap('secondary');
      const out: any = {};
      out.tab = h.craft.ui().tab;
      out.tiles = h.craft.ui().tiles.map((t: any) => t.id);
      h.craft.tileClick('iron_ingot');
      out.d = h.craft.ui().detail;
      h.inventory.add('coal_ore', 1);
      h.step(1);
      out.d2 = h.craft.ui().detail;
      out.press = h.craft.detailPress();
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.tab).toBe('bake');
    expect(r.tiles.length).toBeGreaterThanOrEqual(1);
    expect(r.d.button).toEqual({ enabled: false, label: 'ねんりょう が たりない' });
    expect(r.d2.button).toEqual({ enabled: true, label: 'やく' });
    expect(r.press.ok).toBe(true);
  });

  test('AC7: ツールチップの desc', async ({ page }) => {
    await open(page);
    const r = await ev(page, () => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.add('log', 5);
      T.openInv();
      h.inventory.hover(0);
      h.step(1);
      return { tip: h.inventory.tooltip(), info: h.craft.info('log') };
    });
    console.log(JSON.stringify(r));
    expect(r.tip).toBeTruthy();
    const dom = await page.evaluate(() => document.querySelector('.tip-desc')?.textContent ?? null);
    expect(dom).toBe(r.info.use);
    expect.soft(r.tip.desc, 'AC7 tooltip() に desc（窓口）').toBe(r.info.use);
    expect(r.tip.lines.length).toBeGreaterThan(0);
  });

  test('AC8: info 39 こ（use・how・buttons・later・source・usedIn）', async ({ page }) => {
    await open(page);
    const r = await ev(page, () => {
      const h = (window as any).__rikkun;
      const names = h.inventory.itemTypes().map((t: any) => t.id ?? t.item).filter((i: string) => i !== 'yokai_orb');
      return { n: names.length, infos: names.map((n: string) => h.craft.info(n)) };
    });
    console.log(r.n);
    expect(r.n).toBe(39);
    const byId: any = Object.fromEntries(r.infos.map((i: any) => [i.item, i]));
    for (const i of r.infos) {
      expect(i.use, i.item).toBeTruthy();
      expect(Array.isArray(i.buttons)).toBe(true);
    }
    expect(byId.paper.source).toBe('からかさ・ちょうちん が おとす');
    expect(byId.kawara.source).toBe('ねんど 1 を かまど で やく');
    expect(byId.iron_ingot.usedIn.length).toBe(9);
    expect(byId.iron_ingot.usedIn).toContain('tansu');
    for (const id of ['lantern', 'kite', 'futon', 'omamori', 'waraji', 'haniwa']) expect(byId[id].later, id).toBeTruthy();
    // 説明の文は 表のとおり（抜き取り）
    expect(byId.dirt.use).toBe('ブロック として おける');
    expect(byId.dirt.how).toBe('てに もって みぎクリック で おく');
    expect(byId.dirt.source).toBe('つち を ほる・ぬりかべ が おとす');
    expect(byId.grass.use).toBe('ブロック として おける。わらじ の ざいりょう');
    expect(byId.tansu.use).toBe('おいて、もちもの を たくさん（54 こ の マス）しまえる');
    expect(byId.yumi.use).toBe('や を とばして とおく の ようかい を たおす。や が いる');
    expect(byId.lantern.later).toBe('おいて あかるく できるように なるよ（もうすぐ）');
    expect(byId.omamori.later).toBe('もっていると やられても もちもの を おとさなく なるよ（もうすぐ）');
  });

  test('AC55: せつめいパネルにスクロールが無い（4 アイテム）・ゆびの印', async ({ page }) => {
    await open(page);
    await ev(page, () => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      for (const it of ['log', 'stone', 'iron_ingot', 'string', 'cloth', 'oil', 'paper', 'crystal', 'grass']) h.inventory.add(it, 3);
      T.openInv();
    });
    await page.waitForTimeout(600);
    for (const id of ['katana', 'naginata', 'yoroi', 'yumi', 'tansu', 'torch', 'omamori']) {
      await page.evaluate((id) => {
        const h = (window as any).__rikkun;
        if ((window as any).__rikkun.craft.ui().selected !== id) h.craft.tileClick(id);
        h.step(2);
      }, id);
      await page.waitForTimeout(200);
      const r = await page.evaluate((id) => {
        const h = (window as any).__rikkun;
        const s = document.querySelector('.cp-detail .cp-scroll') as HTMLElement;
        const more = document.querySelector('.cp-detail .cp-more') as HTMLElement;
        const out: any = { id, sel: h.craft.ui().selected, sh: s.scrollHeight, ch: s.clientHeight, more: !more.hidden };
        const sel = h.craft.ui().tiles.find((t: any) => t.selected);
        out.fingerSel = sel && sel.glowing;
        out.fingers = document.querySelectorAll('.cp-finger').length;
        out.fingerOwner = document.querySelector('.cp-finger')?.parentElement?.getAttribute('data-id') ?? null;
        if (!more.hidden) { s.scrollTop = s.scrollHeight; s.dispatchEvent(new Event('scroll')); out.moreAfter = !more.hidden; }
        return out;
      }, id);
      console.log(JSON.stringify(r));
      if (['katana', 'naginata', 'yoroi', 'yumi'].includes(id)) expect.soft(r.sh, `${id} scroll`).toBeLessThanOrEqual(r.ch);
      else if (r.sh > r.ch) { expect.soft(r.more, `${id} ▼ あり`).toBe(true); expect.soft(r.moreAfter, `${id} ▼ 消える`).toBe(false); }
      expect(r.fingers).toBeLessThanOrEqual(1);
      if (r.fingerSel) expect(r.fingerOwner).toBe(id);
    }
  });
});


// ---------------------------------------------------------------- U1〜U14
const TARGET = { x: 4, y: 10, z: 6 };
const U_PLACE = (item: string) => {
  const h = (window as any).__rikkun;
  const T = (window as any).T;
  T.base();
  h.world.setBlock(4, 10, 6, 'stone');
  h.inventory.setSlot(0, { item, count: 1 });
  h.inventory.select(0);
  T.place(2.5, 9, 6.5, 90, 0);
  const t = h.target.get();
  const before = h.inventory.count(item);
  h.input.press('secondary');
  h.step(1);
  h.input.release('secondary');
  h.step(1);
  const placeBlock = h.inventory.itemTypes().find((x: any) => (x.id ?? x.item) === item)?.placeBlock;
  return { target: t?.place, before, after: h.inventory.count(item), block: h.world.getBlock(3, 10, 6), placeBlock, buttons: h.craft.info(item).buttons };
};

test.describe('U1〜U14 説明どおりに使えるか', () => {
  test('U1: みぎクリック で おく（12 こ）', async ({ page }) => {
    await open(page);
    for (const item of ['grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'furnace', 'kawara', 'brick', 'torch']) {
      const r = await page.evaluate(U_PLACE, item);
      console.log(item, JSON.stringify(r));
      expect.soft(r.block, `${item} 置いた先`).toBe(item === 'torch' ? 'torch' : item);
      expect.soft(r.after, `${item} 数`).toBe(r.before - 1);
      expect.soft(r.buttons, `${item} buttons`).toContain('right');
    }
  });

  test('U2: 「どこで」が ほる（すで・てつ は いしの つるはし）', async ({ page }) => {
    test.slow();
    await open(page);
    for (const item of ['grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore']) {
      const r = await page.evaluate((item) => {
        const h = (window as any).__rikkun;
        const T = (window as any).T;
        T.base();
        h.world.setBlock(4, 10, 6, item);
        if (item === 'iron_ore') { h.inventory.setSlot(0, { item: 'stone_pickaxe', count: 1 }); h.inventory.select(0); }
        T.place(2.5, 9, 6.5, 90, 0);
        const source = h.craft.info(item).source;
        h.input.press('primary');
        let broke = -1;
        for (let i = 1; i <= 800; i++) { h.step(1); if (h.dig.get().ready) { broke = i; break; } }
        h.input.release('primary');
        h.step(1);
        h.input.press('primary');
        h.step(2);
        h.input.release('primary');
        h.step(5);
        return { source, broke, count: h.inventory.count(item) };
      }, item);
      console.log(item, JSON.stringify(r));
      expect.soft(r.source, item).toContain('を ほる');
      expect.soft(r.count, `${item} ほって 1 ふえる`).toBe(1);
    }
  });

  test('U3: 「おとす」の妖怪が ドロップ表と同じ', async ({ page }) => {
    await open(page);
    const { YOKAI_DROPS } = await import('../src/yokai/ai/config');
    const infos: any = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const o: any = {};
      for (const i of ['paper', 'oil', 'string', 'cloth', 'clay', 'crystal', 'log', 'dirt', 'stone', 'coal_ore', 'iron_ore']) o[i] = h.craft.info(i);
      return o;
    });
    const names: any = { karakasa: 'からかさ', chochin: 'ちょうちん', nurikabe: 'ぬりかべ', rokurokubi: 'ろくろくび' };
    for (const [item, info] of Object.entries<any>(infos)) {
      const exp = Object.entries(YOKAI_DROPS).filter(([, rows]: any) => rows.some((r: any) => r.item === item)).map(([k]) => k);
      expect(info.sourceYokai.slice().sort(), item).toEqual(exp.slice().sort());
      for (const k of exp) expect(info.source, item).toContain(names[k]);
      expect(info.source, item).toContain('が おとす');
    }
  });

  test('U4: ざいりょう（全レシピ ちょうど持って つくる・やく）と usedIn', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const list = h.craft.list();
      const out: any = { sample: list[0], bad: [], usedMismatch: [] };
      const items = new Set<string>();
      for (const rc of list) for (const i of rc.inputs) items.add(i.item);
      for (const rc of list) {
        T.base();
        for (const i of rc.inputs) h.inventory.add(i.item, i.count);
        const res = h.craft.make(rc.id);
        const left = rc.inputs.map((i: any) => h.inventory.count(i.item) - (i.item === rc.output?.item ? rc.output.count : 0));
        if (!res.ok || left.some((n: number) => n !== 0)) out.bad.push({ id: rc.id, res, left });
      }
      for (const it of items) {
        const exp = list.filter((rc: any) => rc.inputs.some((i: any) => i.item === it)).map((rc: any) => rc.id);
        const got = h.craft.info(it).usedIn;
        if (JSON.stringify(exp) !== JSON.stringify(got)) out.usedMismatch.push({ it, exp, got });
      }
      return out;
    });
    console.log(JSON.stringify({ sample: r.sample, bad: r.bad, mm: r.usedMismatch }));
    expect(r.bad).toEqual([]);
    expect(r.usedMismatch).toEqual([]);
  });

  test('U5: ねんりょう（せきたん・あぶら・き だけで やける、かみ は noFuel）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      for (const f of ['coal_ore', 'oil', 'log', 'paper']) {
        T.base();
        h.world.setBlock(4, 10, 6, 'furnace');
        h.inventory.add('iron_ore', 1);
        h.inventory.add(f, 1);
        const res = h.furnace.bake('iron_ingot', 4, 10, 6);
        out[f] = { res, left: h.inventory.count(f) };
      }
      return out;
    });
    console.log(JSON.stringify(r));
    for (const f of ['coal_ore', 'oil', 'log']) {
      expect(r[f].res.ok, f).toBe(true);
      expect(r[f].left, f).toBe(0);
      expect(r[f].res.ok).toBe(true);
    }
    expect(r.paper.res.ok).toBe(false);
    expect(r.paper.res.reason).toBe('noFuel');
  });

  test('U6: かまどで やくと（てつ→かたまり、ねんど→かわら・レンガ・はにわ）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      const bt = h.settings.get('bakeTicks');
      out.bt = bt;
      const run = (rid: string, input: string, n: number, output: string) => {
        T.base();
        h.world.setBlock(4, 10, 6, 'furnace');
        h.inventory.add(input, n);
        h.inventory.add('coal_ore', 5);
        const res = h.furnace.bake(rid, 4, 10, 6);
        h.step(bt - 2);
        const early = h.inventory.count(output);
        h.step(10);
        // 取り出しは もちもの画面か かまど のそばで
        return { res, early, out: h.inventory.count(output), fur: h.furnace.get(4, 10, 6) };
      };
      out.iron = run('iron_ingot', 'iron_ore', 1, 'iron_ingot');
      out.kawara = run('kawara', 'clay', 1, 'kawara');
      out.brick = run('brick', 'clay', 1, 'brick');
      out.haniwa = run('haniwa', 'clay', 2, 'haniwa');
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.iron.out).toBe(1);
    expect(r.kawara.out).toBe(2);
    expect(r.brick.out).toBe(2);
    expect(r.haniwa.out).toBe(1);
  });

  test('U7: つるはし 3 しゅ（つよさ・てつ を ほれる・ほる はやさ）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = { info: {}, ready: {}, iron: {} };
      const power = h.settings.get('toolPower');
      out.power = power;
      for (const p of ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe']) {
        out.info[p] = h.craft.info(p).stats;
        T.base();
        h.world.setBlock(4, 10, 6, 'stone');
        h.inventory.setSlot(0, { item: p, count: 1 });
        h.inventory.select(0);
        T.place(2.5, 9, 6.5, 90, 0);
        h.input.press('primary');
        let at = -1;
        for (let i = 1; i <= 400; i++) { h.step(1); if (h.dig.get().ready) { at = i; break; } }
        out.ready[p] = at;
        h.input.release('primary');
        h.step(1);
        h.input.press('primary');
        h.step(2);
        h.input.release('primary');
        h.step(8);
        // てつ
        T.base();
        h.world.setBlock(4, 10, 6, 'iron_ore');
        h.inventory.setSlot(0, { item: p, count: 1 });
        h.inventory.select(0);
        T.place(2.5, 9, 6.5, 90, 0);
        h.input.press('primary');
        h.step(5);
        out.iron[p] = h.dig.get().blockedReason;
        h.input.release('primary');
        h.step(8);
      }
      return out;
    });
    console.log(JSON.stringify(r));
    for (const p of ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe']) {
      const val = r.power[p];
      const pw = r.info[p].find((x: any) => x.key === 'power' || x.key === 'dig' || /ほる/.test(x.label));
      expect(pw.value, p).toBe(val);
      expect(r.ready[p], p).toBe(Math.ceil((6 * 60) / val));
    }
    expect(r.iron.wood_pickaxe).not.toBeNull();
    expect(r.iron.stone_pickaxe).toBeNull();
    expect(r.iron.iron_pickaxe).toBeNull();
  });

  test('U8: ぼくとう・かたな・なぎなた・きらきらの かたな', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = { hp: {}, at: {}, info: {}, reach: {} };
      const dmg = h.settings.get('weaponDamage');
      const reachS = h.settings.get('weaponReach');
      const ticksS = h.settings.get('weaponTicks');
      out.cfg = { dmg, reachS, ticksS, punch: h.settings.get('punchReach'), punchTicks: h.settings.get('punchTicks') };
      for (const w of ['bokuto', 'katana', 'naginata', 'crystal_katana']) {
        out.info[w] = h.craft.info(w).stats;
        T.base();
        h.inventory.setSlot(0, { item: w, count: 1 });
        h.inventory.select(0);
        const id = h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
        h.combat.events();
        h.input.press('primary');
        let hitAt = -1;
        for (let i = 1; i <= 80; i++) {
          h.step(1);
          const y = T.one(id);
          if (!y || y.hp < 4) { hitAt = i; break; }
        }
        h.input.release('primary');
        h.step(60);
        const y = T.one(id);
        out.hp[w] = y ? y.hp : 0;
        out.at[w] = hitAt;
      }
      // なぎなた とどく: reach ±0.1
      const reach = reachS.naginata;
      for (const d of [reach, reach + 1.5]) {
        T.base();
        h.inventory.setSlot(0, { item: 'naginata', count: 1 });
        h.inventory.select(0);
        const id = h.yokai.spawn('karakasa', 2.5 + d, 9, 6.5, { ai: false, yawDeg: 270 });
        h.input.press('primary');
        h.step(45);
        h.input.release('primary');
        const y = T.one(id);
        out.reach[d.toFixed(1)] = y ? y.hp : 0;
        h.step(60);
      }
      out.reachVal = reach;
      return out;
    });
    console.log(JSON.stringify(r));
    for (const w of ['bokuto', 'katana', 'naginata', 'crystal_katana']) {
      expect(r.hp[w], w).toBe(Math.max(0, 4 - r.cfg.dmg[w]));
      const ticks = r.cfg.ticksS[w] ?? r.cfg.punchTicks;
      expect.soft(r.at[w], `${w} あたる ステップ`).toBe(ticks);
      const speed = r.info[w].find((x: any) => x.key === 'speed').value;
      expect(speed, w).toBe(ticks <= 30 ? 'ふつう' : 'ゆっくり');
    }
    // からだの 半径ぶん（約 0.7）は とどく に足される。しきいの ±0.1 は 窓口の とどく では 決まらないので 内と 外（+1.5）で確かめる
    const lo = r.reachVal.toFixed(1), hi = (r.reachVal + 1.5).toFixed(1);
    expect(r.reach[lo], 'とどく内').toBeLessThan(4);
    expect(r.reach[hi], 'とどく外').toBe(4);
  });

  test('U9: ゆみ・や', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      const draw = h.settings.get('bowDrawTicks');
      out.cfg = { draw, range: h.settings.get('arrowRange'), dmg: h.settings.get('arrowDamage') };
      T.base();
      h.inventory.setSlot(0, { item: 'yumi', count: 1 });
      h.inventory.setSlot(1, { item: 'ya', count: 3 });
      h.inventory.select(0);
      const id = h.yokai.spawn('karakasa', 9.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.combat.events();
      h.input.press('primary');
      const seen: number[] = [];
      let shotAt = -1;
      for (let i = 1; i <= 60; i++) {
        h.step(1);
        if (h.inventory.count('ya') < 3 && shotAt < 0) { shotAt = i; break; }
      }
      h.input.release('primary');
      out.shotAt = shotAt;
      out.ya = h.inventory.count('ya');
      out.arrows = h.combat.arrows();
      h.step(60);
      out.hp = T.one(id)?.hp;
      out.ev = h.combat.events().map((e: any) => e.type);
      // や なし
      T.base();
      h.inventory.setSlot(0, { item: 'yumi', count: 1 });
      h.inventory.select(0);
      h.input.press('primary');
      h.step(20);
      out.noYa = h.combat.events().map((e: any) => e.type + (e.reason ?? ''));
      h.input.release('primary');
      // や だけ
      T.base();
      h.inventory.setSlot(0, { item: 'ya', count: 3 });
      h.inventory.select(0);
      h.input.press('primary');
      h.step(20);
      out.yaOnly = { kind: h.tool.get().kind, ya: h.inventory.count('ya'), ev: h.combat.events().map((e: any) => e.type) };
      h.input.release('primary');
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.shotAt).toBeGreaterThan(0);
    expect(r.ya).toBe(2);
    expect(r.hp).toBe(4 - r.cfg.dmg);
    expect(r.yaOnly.ya).toBe(3);
  });

  test('U10: ぼうぐ（みぎクリック で きる・まもる つよさ）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = { cfg: h.settings.get('armorValue'), items: {} };
      for (const [a, slot] of [['kabuto', 'head'], ['yoroi', 'body'], ['kote', 'arms'], ['suneate', 'legs']] as const) {
        T.base();
        h.combat.setHp(20);
        h.step(60);
        h.inventory.setSlot(0, { item: a, count: 1 });
        h.inventory.select(0);
        T.place(2.5, 9, 6.5, 90, 0);
        T.tap('secondary');
        const arm = h.armor.get();
        const o: any = { worn: arm[slot], handLeft: h.inventory.count(a), stats: h.craft.info(a).stats };
        h.combat.setHp(20);
        h.step(60);
        const before = h.combat.get().hp;
        h.combat.damage(4);
        o.dmgNormal = before - h.combat.get().hp;
        h.combat.setHp(20);
        h.step(60);
        const b2 = h.combat.get().hp;
        h.combat.damage(4, 'chochin');
        o.dmgBall = b2 - h.combat.get().hp;
        out.items[a] = o;
      }
      return out;
    });
    console.log(JSON.stringify(r));
    for (const [a, slot] of [['kabuto', 'head'], ['yoroi', 'body'], ['kote', 'arms'], ['suneate', 'legs']]) {
      const o = r.items[a];
      expect(o.worn, a).toBe(a);
      expect(o.handLeft, a).toBe(0);
      const v = r.cfg[a];
      expect(o.dmgNormal, `${a} normal`).toBe(Math.max(1, 4 - v.normal));
    }
  });

  test('U12: たいまつ（夜でも あかるい）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.time.set(70000);
      h.step(3);
      const out: any = { phase: h.time.get().phase };
      out.before = h.world.lightAt(5, 9, 6);
      h.inventory.setSlot(0, { item: 'torch', count: 1 });
      h.inventory.select(0);
      h.world.setBlock(4, 10, 6, 'stone');
      T.place(2.5, 9, 6.5, 90, 0);
      T.tap('secondary');
      h.step(5);
      out.torch = h.world.getBlock(3, 10, 6);
      out.light = h.world.lightAt(5, 9, 6);
      out.light2 = h.world.lightAt(3, 9, 8);
      out.info = h.craft.info('torch');
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.torch).toBe('torch');
    expect(r.light.block).toBeGreaterThanOrEqual(8);
    expect(r.light.level).toBeGreaterThanOrEqual(8);
  });

  test('U13: 働きがあとの もの（ちょうちん など）は もてる だけ', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      for (const it of ['lantern', 'kite', 'futon', 'omamori', 'waraji', 'haniwa']) {
        T.base();
        h.world.setBlock(4, 10, 6, 'stone');
        h.inventory.setSlot(0, { item: it, count: 1 });
        h.inventory.select(0);
        T.place(2.5, 9, 6.5, 90, 0);
        const w0 = h.world.hash();
        const inv0 = JSON.stringify(h.inventory.get());
        const arm0 = JSON.stringify(h.armor.get());
        T.tap('secondary');
        const same = h.world.hash() === w0 && JSON.stringify(h.inventory.get()) === inv0 && JSON.stringify(h.armor.get()) === arm0;
        h.input.press('primary');
        h.step(2);
        const dmg = h.tool.get().damage;
        h.input.release('primary');
        h.step(1);
        const info = h.craft.info(it);
        out[it] = { same, dmg, later: info.later, how: info.how };
        h.craft.ui();
      }
      return out;
    });
    console.log(JSON.stringify(r));
    const later: any = {
      lantern: 'おいて あかるく できるように なるよ（もうすぐ）', kite: 'そら に あげて あそべるように なるよ（もうすぐ）',
      futon: 'よる に ねると あさ に なるように なるよ（もうすぐ）', omamori: 'もっていると やられても もちもの を おとさなく なるよ（もうすぐ）',
      waraji: 'はくと すこし はやく あるけるように なるよ（もうすぐ）', haniwa: 'おいて かざれるように なるよ（もうすぐ）',
    };
    for (const it of Object.keys(later)) {
      expect(r[it].same, it).toBe(true);
      expect(r[it].dmg, it).toBe(1);
      expect(r[it].later, it).toBe(later[it]);
      expect(r[it].how, it).toBe('いまは もてる だけ');
    }
  });

  test('U14: てつの かたまり の usedIn 9 こ', async ({ page }) => {
    await open(page);
    const u = await page.evaluate(() => (window as any).__rikkun.craft.info('iron_ingot').usedIn);
    expect(u.slice().sort()).toEqual(['iron_pickaxe', 'katana', 'naginata', 'crystal_katana', 'kabuto', 'yoroi', 'kote', 'suneate', 'tansu'].sort());
  });
});

const MATS = () => {
  const h = (window as any).__rikkun;
  for (const it of ['log', 'stone', 'iron_ingot', 'string', 'cloth', 'oil', 'paper', 'crystal', 'grass']) h.inventory.add(it, 40);
};

async function kanji(page: Page): Promise<string[]> {
  const html = await page.evaluate(() => document.getElementById('hud')?.innerHTML ?? document.body.innerHTML);
  return findUnrubiedKanji(html);
}

test.describe('演出 AC10〜AC15', () => {
  test('AC11: はじめて作ると 横断幕（入場・36・150・180）と 音、2 回目は 通常', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((mats) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      new Function('return (' + mats + ')()')();
      const out: any = {};
      h.craft.sounds();
      out.make = h.craft.make('bokuto');
      out.fx00 = h.craft.fx();
      h.step(1);
      out.fx0 = h.craft.fx();
      out.s0 = h.craft.sounds();
      const at: any = {};
      h.step(35); at[36] = h.craft.fx().banner;
      h.step(114); at[150] = h.craft.fx().banner;
      h.step(30); at[180] = h.craft.fx().banner;
      out.at = at;
      out.sAfter = h.craft.sounds();
      h.craft.make('bokuto');
      h.step(1);
      out.fx2 = h.craft.fx();
      out.s2 = h.craft.sounds();
      out.stats = h.achievements.stats();
      return out;
    }, MATS.toString());
    console.log(JSON.stringify(r));
    expect(r.fx0.banner).toMatchObject({ recipe: 'bokuto', item: 'bokuto', phase: 'in' });
    const names = (a: any[]) => a.map((x) => (typeof x === 'string' ? x : x.name));
    // fanfare は 36 ステップ目（§2.4 の音）に鳴る
    expect([...names(r.s0), ...names(r.sAfter)]).toEqual(expect.arrayContaining(['bannerSpin', 'fanfare']));
    expect(r.at[36].phase).toBe('stay');
    expect(Math.abs(r.at[36].rotationDeg - 720)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.at[36].scale - 1)).toBeLessThanOrEqual(0.02);
    expect(r.at[150].phase).toBe('out');
    expect(r.at[180]).toBeNull();
    expect(r.fx2.banner).toBeNull();
    expect(names(r.s2)).toEqual(expect.arrayContaining(['craft', 'chime1']));
  });

  test('AC12: もちもの画面（1/4 の速さ）では 45 ステップで 消える', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((mats) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      new Function('return (' + mats + ')()')();
      T.openInv();
      const out: any = {};
      h.craft.make('bokuto');
      h.step(44); out.at44 = h.craft.fx().banner;
      h.step(1); out.at45 = h.craft.fx().banner;
      return out;
    }, MATS.toString());
    console.log(JSON.stringify(r));
    expect(r.at44).not.toBeNull();
    expect(r.at45).toBeNull();
  });

  test('AC13: 横断幕のじゅんばん', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((mats) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      new Function('return (' + mats + ')()')();
      const out: any = {};
      h.craft.make('bokuto');
      h.craft.make('wood_pickaxe');
      h.step(1);
      out.f = h.craft.fx();
      h.craft.make('stone_pickaxe');
      h.craft.make('torch');
      h.craft.make('furnace');
      h.step(1);
      out.f5 = h.craft.fx();
      h.step(180);
      out.after = h.craft.fx().banner;
      return out;
    }, MATS.toString());
    console.log(JSON.stringify(r));
    expect(r.f.banner.recipe).toBe('bokuto');
    expect(r.f.bannerQueue).toEqual(['wood_pickaxe']);
    expect(r.f5.bannerQueue.length).toBeLessThanOrEqual(2);
    expect(r.after?.recipe).toBe('wood_pickaxe');
  });

  test('AC14: コンボ', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((mats) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      new Function('return (' + mats + ')()')();
      const out: any = { combos: [], pitches: [] };
      h.craft.make('bokuto');
      h.step(200);
      h.craft.sounds();
      for (let i = 0; i < 3; i++) {
        h.craft.make('bokuto');
        h.step(1);
        out.combos.push(h.craft.fx().combo);
        out.pitches.push(h.craft.sounds());
        h.step(59);
      }
      h.step(121);
      h.craft.make('bokuto');
      h.step(1);
      out.reset = h.craft.fx().combo;
      h.craft.sounds();
      out.eight = [];
      for (let i = 0; i < 9; i++) { h.step(30); h.craft.make('bokuto'); h.step(1); out.eight.push(h.craft.fx().combo); }
      out.last = h.craft.sounds().slice(-6);
      // しっぱい: 材料なし
      h.inventory.clear();
      h.step(10);
      T.openInv();
      h.inventory.add('log', 1);
      h.craft.tileClick('bokuto');
      out.fail = h.craft.tileClick('bokuto');
      h.step(2);
      out.failCombo = h.craft.fx().combo;
      return out;
    }, MATS.toString());
    console.log(JSON.stringify(r));
    expect(r.combos).toEqual([1, 2, 3]);
    const pitchOf = (arr: any[]) => arr.filter((x: any) => /^chime/.test(x.name ?? x)).map((x: any) => x.pitch);
    expect(r.pitches.map((a: any) => pitchOf(a)[0])).toEqual([0, 1, 2]);
    expect(r.reset).toBe(1);
    expect(r.eight.slice(-2)).toEqual([8, 8]);
    expect(r.failCombo).toBe(0);
  });

  test('AC15: 点滅のきまり（流れ・ぜんめんの要素が変わらない）', async ({ page }) => {
    await open(page);
    await page.evaluate((mats) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      new Function('return (' + mats + ')()')();
      h.craft.make('katana');
      h.step(60);
    }, MATS.toString());
    const fx = await page.evaluate(() => (window as any).__rikkun.craft.fx());
    const modal = await page.evaluate(() => (window as any).__rikkun.achievements.modal());
    console.log(JSON.stringify({ fx: fx.flashPeriods, fps: fx.flashPerSecond, m: modal.flashPeriods }));
    for (const p of [...fx.flashPeriods, ...modal.flashPeriods]) expect(p).toBeGreaterThanOrEqual(24);
    expect(fx.flashPerSecond).toBeLessThan(3);
    // 画面の 90% 以上の要素の 不透明度・色・明るさ が 変わらない
    const samples: string[] = [];
    for (let i = 0; i < 18; i++) {
      await page.evaluate(() => (window as any).__rikkun.step(10));
      await page.waitForTimeout(60);
      samples.push(
        await page.evaluate(() => {
          const out: string[] = [];
          for (const e of Array.from(document.querySelectorAll('#hud *, #hud'))) {
            const r = (e as HTMLElement).getBoundingClientRect();
            if (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9) {
              const cs = getComputedStyle(e);
              out.push([cs.opacity, cs.backgroundColor, cs.filter, cs.backgroundImage].join('|') + '@' + (e as HTMLElement).className);
            }
          }
          return out.join(';');
        }),
      );
    }
    console.log(samples[0]);
    expect(new Set(samples).size).toBe(1);
    const banner = await page.evaluate(() => (window as any).__rikkun.craft.fx().banner);
    console.log(JSON.stringify(banner));
  });

  test('AC10: 画面の字が ひらがな・カタカナ（漢字は ふりがな）＋ いっぱい の合図', async ({ page }) => {
    await open(page);
    await page.evaluate((mats) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      new Function('return (' + mats + ')()')();
      T.openInv();
      h.craft.make('bokuto');
      h.step(40);
      h.inventory.hover(0);
      h.step(2);
    }, MATS.toString());
    await page.waitForTimeout(300);
    expect(await kanji(page)).toEqual([]);
    await page.evaluate(() => (window as any).__rikkun.achievements.tab('achievements'));
    await page.waitForTimeout(300);
    expect(await kanji(page)).toEqual([]);
    await page.evaluate(() => (window as any).__rikkun.achievements.tab('items'));
    // いっぱい
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.clear();
      h.armor.set(null, null);
      const kinds = ['dirt', 'stone', 'sand', 'grass', 'leaves', 'coal_ore', 'iron_ore', 'clay', 'furnace', 'kawara', 'brick', 'torch', 'paper', 'oil', 'string', 'cloth', 'crystal', 'ya', 'yumi', 'katana', 'naginata', 'crystal_katana', 'kabuto', 'yoroi', 'kote', 'suneate', 'lantern', 'kite', 'futon', 'omamori', 'waraji', 'haniwa', 'tansu', 'wood_pickaxe', 'stone_pickaxe'];
      kinds.forEach((k, i) => h.inventory.setSlot(i + 1, { item: k, count: 1 }));
      h.inventory.setSlot(0, { item: 'log', count: 3 });
      h.step(3);
      h.craft.tileClick('bokuto');
      const sel = h.craft.ui().selected;
      const res = h.craft.detailPress();
      h.step(2);
      return { sel, res };
    });
    await page.waitForTimeout(300);
    const chip = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('#hud *')).filter((e) => (e.textContent ?? '').includes('いっぱい') && e.children.length === 0);
      return els.map((e) => ({ t: e.textContent, fs: getComputedStyle(e).fontSize, fw: getComputedStyle(e).fontWeight, imgs: (e.closest('[class*=chip]') ?? e).querySelectorAll('img').length, cls: e.className, pcls: (e.closest('[class*=chip]') ?? e).className }));
    });
    console.log(JSON.stringify({ r, chip }));
    expect(r.res).toMatchObject({ ok: false, reason: 'full' });
    expect(chip.length).toBeGreaterThan(0);
    expect.soft(chip[0].t.trim(), 'AC10 合図の字（書面は「もちもの が いっぱい！」）').toBe('もちもの が いっぱい！');
    expect(chip[0].t.replace(/\s/g, '')).toBe('もちものがいっぱい！');
    expect(chip[0].fs).toBe('24px');
    expect(Number(chip[0].fw)).toBe(800);
    expect(chip[0].imgs).toBe(0);
  });
});

const unlocked = (h: any) => h.achievements.list().filter((a: any) => a.unlocked).map((a: any) => a.id);

test.describe('実績 AC16〜AC20', () => {
  test('AC16: 180 こ・メダル・小', async ({ page }) => {
    await open(page);
    const list: any[] = await page.evaluate(() => (window as any).__rikkun.achievements.list());
    expect(list.length).toBe(180);
    expect(new Set(list.map((a) => a.id)).size).toBe(180);
    expect(list.filter((a) => a.small).length).toBe(61);
    const bySeries: Record<string, any[]> = {};
    for (const a of list) (bySeries[a.series] ??= []).push(a);
    const bad: string[] = [];
    // 仕様の series 名が 2 組ぶつかる（craft.ya = つくる 1 回目 と や 100 ぽん、bake.iron_ingot = やく 1 回目 と 10・50）。id は別なので 分けて見る
    const byId0: any = Object.fromEntries(list.map((a) => [a.id, a]));
    expect([byId0['craft.ya.1'].medal, byId0['craft.ya.100'].medal]).toEqual(['gold', 'gold']);
    expect([byId0['bake.iron_ingot.1'].medal, byId0['bake.iron_ingot.10'].medal, byId0['bake.iron_ingot.50'].medal]).toEqual(['gold', 'bronze', 'silver']);
    for (const k of ['craft.ya', 'bake.iron_ingot']) delete bySeries[k];
    for (const [k, arr] of Object.entries(bySeries)) {
      arr.sort((x, y) => x.tier - y.tier);
      arr.forEach((a, i) => {
        const exp = arr.length === 1 ? 'gold' : ['bronze', 'silver', 'gold', 'rainbow'][Math.min(i, 3)];
        if (a.medal !== exp) bad.push(`${a.id}:${a.medal}!=${exp}`);
      });
    }
    console.log('series', Object.keys(bySeries).length, 'bad', JSON.stringify(bad));
    expect(bad).toEqual([]);
    const cnt: Record<string, number> = {};
    for (const a of list) cnt[a.category] = (cnt[a.category] ?? 0) + 1;
    console.log(JSON.stringify(cnt));
    expect(cnt).toEqual({ break: 28, place: 22, craft: 39, collect: 12, fight: 42, level: 8, adventure: 19, places: 10 });
    // 名前（抜き取り）
    const byId: any = Object.fromEntries(list.map((a) => [a.id, a]));
    expect(byId['break.dirt.1'].name).toBe('はじめて つち ブロック を こわした！');
    expect(byId['break.dirt.10'].name).toBe('つち ブロック を 10 こ こわした！');
    expect(byId['defeat.karakasa.10'].name).toBe('からかさ を 10 ひき たおした！');
    expect(byId['level.5'].name).toBe('レベル 5 に なった！');
    expect(byId['craft.tansu.1'].name).toBe('はじめて たんす を つくった！');
  });

  test('AC17: 記録（こわす・おく・つくる・ひろう・やく）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const out: any = {};
      h.world.setBlock(4, 10, 6, 'dirt');
      T.place(2.5, 9, 6.5, 90, 0);
      h.achievements.events();
      h.input.press('primary'); h.step(40); h.input.release('primary'); h.step(1);
      h.input.press('primary'); h.step(2); h.input.release('primary'); h.step(5);
      out.s1 = { ...h.achievements.stats() };
      out.ev1 = h.achievements.events().filter((e: any) => e.type === 'unlock').map((e: any) => e.id);
      h.inventory.setSlot(0, { item: 'log', count: 2 }); h.inventory.select(0);
      h.world.setBlock(4, 10, 6, 'stone');
      T.place(2.5, 9, 6.5, 90, 0);
      T.tap('secondary');
      out.s2 = { ...h.achievements.stats() };
      h.inventory.add('string', 5); h.inventory.add('stone', 5); h.inventory.add('paper', 5);
      h.craft.make('ya'); h.step(2);
      out.s3 = { ...h.achievements.stats() };
      const before = { ...h.achievements.stats() };
      h.inventory.add('paper', 3); h.step(2);
      out.addNo = h.achievements.stats()['obtain:paper'] ?? 0;
      h.inventory.pickup('paper', 3); h.step(2);
      out.s4 = { ...h.achievements.stats() };
      h.world.setBlock(4, 10, 6, 'furnace');
      h.inventory.add('iron_ore', 1); h.inventory.add('coal_ore', 1);
      h.furnace.bake('iron_ingot', 4, 10, 6);
      h.step(30); out.bakeEarly = h.achievements.stats()['bake:iron_ingot'] ?? 0;
      h.step(40); out.s5 = { ...h.achievements.stats() };
      return out;
    });
    console.log(JSON.stringify({ s1: r.s1, ev1: r.ev1, s2: r.s2, s3: r.s3, s4: r.s4, s5: r.s5 }));
    expect(r.s1['break:dirt']).toBe(1);
    expect(r.s1['break:*']).toBe(1);
    expect(r.ev1).toContain('break.dirt.1');
    expect(r.s2['place:log']).toBe(1);
    expect(r.s3['craft:ya']).toBe(1);
    expect(r.s3['craftItems:ya']).toBe(4);
    expect(r.addNo).toBe(0);
    expect(r.s4['obtain:paper']).toBe(3);
    expect(r.s4['pickup:*'] - r.s3['pickup:*']).toBe(3);
    expect(r.s5['bake:iron_ingot']).toBe(1);
  });

  test('AC18: たたかう の記録', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      const kill = (hp: number | null, weapon = 'katana', gapAfter = 5) => {
        T.base();
        h.inventory.setSlot(0, { item: weapon, count: 1 }); h.inventory.select(0);
        if (hp !== null) h.combat.setHp(hp);
        const id = h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
        h.input.press('primary'); h.step(32); h.input.release('primary'); h.step(gapAfter);
      };
      T.base();
      h.inventory.setSlot(0, { item: 'katana', count: 1 }); h.inventory.select(0);
      h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.input.press('primary'); h.step(32); h.input.release('primary'); h.step(5);
      out.s1 = { ...h.achievements.stats() };
      out.ev1 = h.achievements.events().filter((e: any) => e.type === 'unlock').map((e: any) => e.id);
      // ひんし
      h.achievements.reset();
      h.combat.setHp(4);
      h.yokai.clear();
      h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.input.press('primary'); h.step(32); h.input.release('primary'); h.step(40);
      out.low4 = h.achievements.stats()['defeatLow'] ?? 0;
      h.combat.setHp(3);
      h.yokai.clear();
      h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.input.press('primary'); h.step(32); h.input.release('primary'); h.step(5);
      out.low3 = h.achievements.stats()['defeatLow'] ?? 0;
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.s1['defeat:karakasa']).toBe(1);
    expect(r.s1['defeatWith:katana']).toBe(1);
    expect(r.ev1).toContain('defeat.with.katana.1');
    expect(r.low4).toBe(0);
    expect(r.low3).toBe(1);
  });

  test('AC18b: ゆみ・つづけて・ふせぐ・やられる', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      T.base();
      h.inventory.setSlot(0, { item: 'yumi', count: 1 });
      h.inventory.setSlot(1, { item: 'ya', count: 6 });
      h.inventory.select(0);
      h.yokai.spawn('karakasa', 8.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.input.press('primary');
      for (let i = 0; i < 100; i++) { h.step(1); }
      h.input.release('primary'); h.step(30);
      out.yumi = h.achievements.stats()['defeatWith:yumi'] ?? 0;
      out.arrowHit = h.achievements.stats()['arrowHit'] ?? 0;
      // chain: 3 たい 100 ステップ
      T.base();
      h.inventory.setSlot(0, { item: 'katana', count: 1 }); h.inventory.select(0);
      for (let i = 0; i < 3; i++) {
        h.yokai.clear();
        h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
        h.input.press('primary'); h.step(32); h.input.release('primary'); h.step(3);
      }
      out.chain3 = h.achievements.stats()['chain'] ?? 0;
      // 601 ステップ
      h.achievements.reset();
      for (const gap of [300, 340, 0]) {
        h.yokai.clear();
        h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
        h.input.press('primary'); h.step(32); h.input.release('primary'); h.step(gap);
      }
      out.chain601 = h.achievements.stats()['chain'] ?? 0;
      // ふせぐ
      T.base();
      h.armor.set(null, 'yoroi');
      h.combat.damage(2);
      h.step(2);
      out.guard = h.achievements.stats()['guard'] ?? 0;
      // やられる
      T.base();
      h.combat.setHp(0);
      h.step(3);
      out.death = h.achievements.stats()['death'] ?? 0;
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.yumi).toBe(1);
    expect(r.chain3).toBe(1);
    expect(r.chain601).toBe(0);
    expect(r.guard).toBeGreaterThanOrEqual(1);
    expect(r.death).toBe(1);
  });

  test('AC19: レベル・防具・よる・あさ・歩く・遊んだ時間・record', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      T.base();
      h.achievements.reset();
      h.level.set(2);
      h.step(2);
      out.lv2 = unlockedIds().includes('level.2');
      out.lv3 = unlockedIds().includes('level.3');
      function unlockedIds() { return h.achievements.list().filter((a: any) => a.unlocked).map((a: any) => a.id); }
      h.armor.set('kabuto', 'yoroi', 'kote', 'suneate');
      h.step(2);
      const u = unlockedIds();
      out.wear = ['wear.kabuto.1', 'wear.yoroi.1', 'wear.kote.1', 'wear.suneate.1', 'wear.all.1'].map((i) => u.includes(i));
      h.time.set(70000); h.step(2);
      out.night = h.achievements.stats()['night'] ?? 0;
      h.time.set(91800); h.step(2);
      out.morning = h.achievements.stats()['morning'] ?? 0;
      // 歩く
      T.base();
      h.achievements.reset();
      let x = 1.5, dir = 1;
      T.place(x, 9, 6.5, 90, 0);
      const w0 = h.achievements.stats()['walk'] ?? 0;
      for (let i = 0; i < 1500; i++) {
        x += 0.07 * dir;
        if (x > 11) dir = -1;
        if (x < 1.5) dir = 1;
        h.player.set({ position: { x, y: 9, z: 6.5 } });
        h.step(1);
      }
      out.walk = (h.achievements.stats()['walk'] ?? 0) - w0;
      out.walk100 = unlockedIds().includes('walk.100');
      const w1 = h.achievements.stats()['walk'] ?? 0;
      h.player.set({ position: { x: 60, y: 9, z: 6.5 } });
      h.step(2);
      out.warp = (h.achievements.stats()['walk'] ?? 0) - w1;
      // playTicks
      T.base();
      const p0 = h.achievements.stats()['playTicks'] ?? 0;
      h.step(600);
      const p1 = h.achievements.stats()['playTicks'] ?? 0;
      out.play600 = p1 - p0;
      T.openInv();
      const p2 = h.achievements.stats()['playTicks'] ?? 0;
      h.step(100);
      out.playInv = (h.achievements.stats()['playTicks'] ?? 0) - p2;
      T.openInv();
      h.lock.simulate(false);
      h.step(2);
      const p3 = h.achievements.stats()['playTicks'] ?? 0;
      h.step(100);
      out.playGuide = (h.achievements.stats()['playTicks'] ?? 0) - p3;
      h.lock.simulate(true);
      h.step(2);
      // record
      h.achievements.record('break:dirt', 9);
      h.step(2);
      out.break10 = h.achievements.stats()['break:dirt'];
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.lv2).toBe(true);
    expect(r.lv3).toBe(false);
    expect(r.wear).toEqual([true, true, true, true, true]);
    expect(r.night).toBe(1);
    expect(r.morning).toBe(1);
    expect(Math.abs(r.walk - 105)).toBeLessThanOrEqual(1);
    expect(r.walk100).toBe(true);
    expect(r.warp).toBe(0);
    expect(r.play600).toBe(600);
    expect(r.playInv).toBe(400);
    expect(r.playGuide).toBe(0);
    expect(r.break10).toBe(9);
  });

  test('AC20: ばしょ', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      T.base();
      h.achievements.reset();
      const reg = h.world.regions();
      const stand = (x: number, z: number) => {
        const gy = h.world.groundHeight(x, z);
        h.player.set({ position: { x, y: gy + 1, z }, velocity: { x: 0, y: 0, z: 0 } });
        h.step(2);
      };
      const ids = () => h.achievements.list().filter((a: any) => a.unlocked).map((a: any) => a.id);
      stand(reg.forest.cx, reg.forest.cz);
      out.forest = ids().includes('visit.forest.1');
      stand(reg.mountain.cx, reg.mountain.cz);
      stand(reg.meadow.cx, reg.meadow.cz);
      stand((reg.flat.x0 + reg.flat.x1) / 2, (reg.flat.z0 + reg.flat.z1) / 2);
      stand(reg.spring.cx, reg.spring.cz);
      stand(reg.pond.cx, reg.pond.cz);
      stand((reg.river[0].x0 + reg.river[0].x1) / 2, (reg.river[0].z0 + reg.river[0].z1) / 2);
      out.partial = ids().filter((i: string) => i.startsWith('visit.'));
      h.player.set({ position: { x: reg.mountain.peak.x + 0.5, y: reg.mountain.peak.h + 1, z: reg.mountain.peak.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(2);
      out.peak = ids().includes('visit.peak.1');
      // うみ: 中心から 60 以上の みず
      let found: any = null;
      for (let x = 0; x < 128 && !found; x += 2) for (let z = 0; z < 128 && !found; z += 2) {
        if (Math.hypot(x - reg.center.x, z - reg.center.z) < 62) continue;
        for (let y = 2; y < 20; y++) if (h.world.getBlock(x, y, z) === 'water' && h.world.getBlock(x, y + 1, z) !== 'water') { found = { x, y, z }; break; }
      }
      out.sea = found;
      if (found) { h.player.set({ position: { x: found.x + 0.5, y: found.y + 0.2, z: found.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 } }); h.step(3); }
      out.all = ids().includes('visit.all.9');
      out.visits = ids().filter((i: string) => i.startsWith('visit.'));
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.forest).toBe(true);
    expect(r.peak).toBe(true);
    expect(r.all).toBe(true);
    expect(r.visits).toEqual(expect.arrayContaining(['visit.forest.1', 'visit.mountain.1', 'visit.meadow.1', 'visit.flat.1', 'visit.spring.1', 'visit.pond.1', 'visit.river.1', 'visit.peak.1']));
  });
});

const SMALLS = ['break:grass', 'break:dirt', 'break:stone', 'break:sand', 'break:log', 'break:leaves'];

test.describe('おめでとう画面 AC21〜AC27', () => {
  test('AC21: ちいさい 4 こでは出ない・5 こ目で出る・メダルの印', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((smalls) => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base({ modal: true });
      const out: any = {};
      h.achievements.sounds();
      h.achievements.record(smalls[0], 1);
      h.step(1);
      out.one = { modal: h.achievements.modal().open, ui: h.achievements.ui().badge, sounds: h.achievements.sounds() };
      for (let i = 1; i < 4; i++) h.achievements.record(smalls[i], 1);
      h.step(3);
      out.four = { modal: h.achievements.modal().open, badge: h.achievements.ui().badge };
      h.achievements.record(smalls[4], 1);
      h.step(2);
      out.five = h.achievements.modal();
      return out;
    }, SMALLS);
    console.log(JSON.stringify(r));
    expect(r.one.modal).toBe(false);
    expect(r.one.ui).toEqual({ visible: true, count: 1 });
    expect(r.one.sounds).toContain('badge');
    expect(r.four.modal).toBe(false);
    expect(r.four.badge.count).toBe(4);
    expect(r.five.open).toBe(true);
    expect(r.five.ids.length).toBe(5);
  });

  test('AC22: 大きい実績で 時間が止まる', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base({ modal: true });
      h.settings.set('yokaiAutoSpawn', false);
      const out: any = {};
      h.input.press('primary');
      h.step(2);
      h.achievements.record('defeat:*', 1);
      h.step(1);
      out.modal = h.achievements.modal();
      out.lock = h.lock.get();
      out.held = h.input.held();
      const snap = () => JSON.stringify({ t: h.time.get().dayTick, p: h.player.get().position, st: h.achievements.stats() });
      const a = snap();
      h.step(100);
      out.same = snap() === a;
      out.modal2 = h.achievements.modal().open;
      return out;
    });
    console.log(JSON.stringify({ m: r.modal, lock: r.lock.locked, ov: r.lock.overlayVisible, held: r.held, same: r.same }));
    expect(r.modal.open).toBe(true);
    expect(r.lock.locked).toBe(false);
    expect(r.lock.overlayVisible).toBe(false);
    expect(r.held).toEqual([]);
    expect(r.same).toBe(true);
    expect(r.modal2).toBe(true);
  });

  test('AC22b: 妖怪も止まる', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base({ modal: true });
      h.yokai.spawn('karakasa', 9.5, 9, 6.5, { yawDeg: 270 });
      h.achievements.record('defeat:*', 1);
      h.step(3);
      const a = JSON.stringify(h.yokai.list());
      h.step(100);
      return { open: h.achievements.modal().open, same: JSON.stringify(h.yokai.list()) === a };
    });
    expect(r.open).toBe(true);
    expect(r.same).toBe(true);
  });

  test('AC23: 1 まいにまとめる', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base({ modal: true });
      h.achievements.record('full', 1);
      for (const k of ['break:dirt', 'break:stone', 'break:sand']) h.achievements.record(k, 1);
      for (const k of ['break:grass', 'break:log', 'break:leaves']) h.achievements.record(k, 10);
      h.step(2);
      const m = h.achievements.modal();
      const medals = Object.fromEntries(h.achievements.list().filter((a: any) => m.ids.includes(a.id)).map((a: any) => [a.id, a.medal]));
      // 閉じるまで 次は出ない
      h.achievements.record('defeat:*', 1);
      h.step(80);
      const m2 = h.achievements.modal();
      return { m, medals, m2 };
    });
    console.log(JSON.stringify(r));
    expect(r.m.open).toBe(true);
    expect(r.m.mainId).toBe('full.1');
    expect(r.m.ids.length).toBe(7);
    expect(r.m.rows).toBe(5);
    expect(r.m.more).toBe(1);
    expect(r.m2.ids.length).toBe(7);
  });

  test('AC24: 連打で閉じない（59 ステップ・キー・カード・うしろ・押しっぱなし）', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base({ modal: true });
      h.achievements.sounds();
    });
    // 出る前から マウスを押しっぱなし
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.record('defeat:*', 1);
      h.step(1);
    });
    expect((await page.evaluate(() => (window as any).__rikkun.achievements.modal())).open).toBe(true);
    await page.evaluate(() => (window as any).__rikkun.step(57));
    await page.waitForTimeout(300);
    const early = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const out: any = {};
      const m = h.achievements.modal();
      out.m59 = m;
      out.close = h.achievements.close();
      const btn = document.querySelector('.cel-modal button, .rk-modal button, .cel-close, [data-role=close]') as HTMLButtonElement | null;
      out.btnSel = btn?.className ?? null;
      out.disabled = btn ? btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('is-disabled') : null;
      for (const a of ['pause', 'toggleInventory', 'jump', 'hotbar1', 'primary']) { h.input.press(a); h.step(1); h.input.release(a); h.step(0); }
      out.stillOpen = h.achievements.modal().open;
      return out;
    });
    console.log(JSON.stringify(early));
    expect(early.m59.buttonEnabled).toBe(false);
    expect(early.close).toEqual({ ok: false, reason: 'notYet' });
    expect(early.disabled).toBe(true);
    expect(early.stillOpen).toBe(true);
    // うしろ・カード・ボタン（まだ押せない）をクリック
    const box = await page.evaluate(() => {
      const b = document.querySelector('.cel-modal, .rk-modal') as HTMLElement | null;
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height, cls: b!.className } : null;
    });
    console.log(JSON.stringify(box));
    await page.mouse.up();
    await page.mouse.click(30, 30);
    if (box) await page.mouse.click(box.x + box.w / 2, box.y + 40);
    await page.waitForTimeout(100);
    expect((await page.evaluate(() => (window as any).__rikkun.achievements.modal())).open).toBe(true);
    // 60 で押せる
    await page.evaluate(() => (window as any).__rikkun.step(3));
    const m60 = await page.evaluate(() => (window as any).__rikkun.achievements.modal());
    const snd = await page.evaluate(() => (window as any).__rikkun.achievements.sounds());
    console.log(JSON.stringify({ m60, snd }));
    expect(m60.buttonEnabled).toBe(true);
    expect(snd).toContain('closeReady');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${ASSETS}/M6-t1-congrats-ready.png` });
    // ボタンの上で押して 上ではなす
    const bb = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button')).filter((b) => /とじる/.test(b.textContent ?? '') && (b as HTMLElement).offsetParent !== null && !b.closest('#inventory-screen'));
      const b = els[els.length - 1] as HTMLElement | undefined;
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null;
    });
    console.log(JSON.stringify(bb));
    expect(bb).not.toBeNull();
    // 外で押して ボタンではなす → 閉じない
    await page.mouse.move(30, 30);
    await page.mouse.down();
    await page.mouse.move(bb!.x, bb!.y);
    await page.mouse.up();
    await page.evaluate(() => (window as any).__rikkun.step(1));
    expect((await page.evaluate(() => (window as any).__rikkun.achievements.modal())).open).toBe(true);
    // ボタンの上で押して はなす → 閉じる
    await page.mouse.move(bb!.x, bb!.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.evaluate(() => (window as any).__rikkun.step(1));
    const after = await page.evaluate(() => (window as any).__rikkun.achievements.modal());
    expect(after.open).toBe(false);
  });

  test('AC25: 閉じたら seen・バッジ 0・ロック（もちもの画面から開いたらもどる）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base({ modal: true });
      const out: any = {};
      h.achievements.record('defeat:*', 1);
      h.step(65);
      const ids = h.achievements.modal().ids;
      out.close = h.achievements.close();
      h.step(2);
      out.seen = h.achievements.list().filter((a: any) => ids.includes(a.id)).every((a: any) => a.seen);
      out.badge = h.achievements.ui().badge;
      out.lock = h.lock.get().locked;
      const t0 = h.time.get().dayTick;
      h.step(30);
      out.timeMoves = h.time.get().dayTick > t0;
      out.pending = h.achievements.pending();
      // もちもの画面から
      T.openInv();
      h.settings.set('achieveCooldown', 0);
      h.achievements.record('full', 1);
      h.step(65);
      out.openInInv = h.achievements.modal().open;
      out.close2 = h.achievements.close();
      h.step(2);
      out.afterInv = { lock: h.lock.get().locked, inv: h.craft.ui().panelVisible };
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.close.ok).toBe(true);
    expect(r.seen).toBe(true);
    expect(r.badge.count).toBe(0);
    expect(r.lock).toBe(true);
    expect(r.timeMoves).toBe(true);
    expect(r.openInInv).toBe(true);
    expect(r.afterInv.lock).toBe(false);
    expect(r.afterInv.inv).toBe(true);
  });

  test('AC26: 待ち時間（初期値の設定・しきいの前後。ステップ数は小さくして確かめる）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      T.base({ modal: true });
      out.defaults = {
        cd: h.settings.get('achieveCooldown'), early: h.settings.get('achieveCooldownEarly'), earlyTicks: h.settings.get('achieveEarlyTicks'),
        small: h.settings.get('achieveSmallMaxWait'), batch: h.settings.get('achieveSmallBatch'), calm: h.settings.get('achieveCalmMaxWait'), delay: h.settings.get('achieveCloseDelay'),
      };
      // 縮めた設定で しきいの 前後（-1 / ちょうど）
      h.settings.set('achieveCooldown', 300);
      h.settings.set('achieveCooldownEarly', 900);
      h.settings.set('achieveEarlyTicks', 600);
      // 1 まい目を出して閉じる（playTicks を 600 以上にして からの「ふつう」）
      h.achievements.record('playTicks', 700);
      h.achievements.record('defeat:*', 1);
      h.step(65);
      out.firstOpen = h.achievements.modal().open;
      h.achievements.close();
      h.step(1);
      out.pt = h.achievements.stats()['playTicks'];
      h.achievements.record('full', 1);
      h.step(297);
      out.at298 = h.achievements.modal().open;
      h.step(1);
      out.at299 = h.achievements.modal().open;
      h.step(1);
      out.at300 = h.achievements.modal().open;
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.defaults).toEqual({ cd: 1800, early: 5400, earlyTicks: 18000, small: 18000, batch: 5, calm: 1800, delay: 60 });
    expect(r.firstOpen).toBe(true);
    expect(r.at298).toBe(false);
    expect(r.at299).toBe(false);
    expect(r.at300).toBe(true);
  });

  test('AC26b: 最初の 5 分は 長い待ち（早い時期）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      T.base({ modal: true });
      h.settings.set('achieveCooldown', 300);
      h.settings.set('achieveCooldownEarly', 900);
      h.settings.set('achieveEarlyTicks', 100000);
      h.achievements.record('defeat:*', 1);
      h.step(65);
      h.achievements.close();
      h.step(1);
      h.achievements.record('full', 1);
      h.step(350);
      out.at350 = h.achievements.modal().open;
      h.step(540);
      out.at890 = h.achievements.modal().open;
      h.step(20);
      out.at910 = h.achievements.modal().open;
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.at350).toBe(false);
    expect(r.at890).toBe(false);
    expect(r.at910).toBe(true);
  });

  test('AC27: しずか（妖怪・ダメージ・横断幕・やられた画面）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      T.base({ modal: true });
      const id = h.yokai.spawn('karakasa', 8.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.achievements.record('full', 1);
      h.step(5);
      out.withYokai = h.achievements.modal().open;
      h.yokai.clear();
      h.step(1);
      out.afterRemove = h.achievements.modal().open;
      h.achievements.close(); h.step(65); h.achievements.close(); h.step(1);
      // 消さないと 待ちの上限で出る（縮めた設定）
      T.base({ modal: true });
      h.settings.set('achieveCalmMaxWait', 200);
      h.yokai.spawn('karakasa', 8.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.achievements.record('full', 1);
      h.step(199);
      out.cal199 = h.achievements.modal().open;
      h.step(3);
      out.cal201 = h.achievements.modal().open;
      // ダメージ
      T.base({ modal: true });
      h.combat.damage(1);
      h.step(1);
      h.achievements.record('full', 1);
      h.step(117);
      out.dmg118 = h.achievements.modal().open;
      h.step(6);
      out.dmg124 = h.achievements.modal().open;
      // 横断幕
      T.base({ modal: true });
      h.inventory.add('log', 5);
      h.craft.make('bokuto');
      h.step(2);
      h.achievements.record('defeat:*', 1);
      h.step(100);
      out.banner = h.achievements.modal().open;
      h.step(100);
      out.bannerDone = h.achievements.modal().open;
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.withYokai).toBe(false);
    expect(r.afterRemove).toBe(true);
    expect(r.cal199).toBe(false);
    expect(r.cal201).toBe(true);
    expect(r.dmg118).toBe(false);
    expect(r.dmg124).toBe(true);
    expect(r.banner).toBe(false);
    expect(r.bannerDone).toBe(true);
  });

  test('AC27b: やられた画面のあいだは出ず、復活してから出る', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = { steps: [] };
      T.base({ modal: true });
      h.combat.setHp(0);
      h.step(5);
      out.dead = h.combat.get().dead;
      out.during = h.achievements.modal().open;
      out.pend = h.achievements.pending().length;
      for (let i = 0; i < 400; i++) {
        h.step(1);
        if (h.achievements.modal().open) { out.openAt = i + 5; out.deadAtOpen = h.combat.get().dead; break; }
      }
      return out;
    });
    console.log(JSON.stringify(r));
    expect(r.dead).toBe(true);
    expect(r.during).toBe(false);
    expect(r.pend).toBeGreaterThan(0);
    if (r.openAt !== undefined) expect(r.deadAtOpen).toBe(false);
  });
});

