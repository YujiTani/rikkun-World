import { expect, test } from '@playwright/test';
import { openLive3 } from './helpers/live3';

/**
 * LIVE-3 E2E その 1（docs/design/LIVE-3.md 版 1.1 §2.1〜§2.3・§6 AC1〜AC5）: えらべる 子・右クリック 1b・とりごや の メニュー 3 ページ。
 * 準備: そだてた 大人 = `A.kid(c, { stage: 'adult', raised: true })`。窓口は §6.1（`animals.meatList`・`ui.coopMenu`・`ui.coopMenuPress`・`animals.fx().marks[].pick`）。
 * 数え方・DOM の 約束は e2e/helpers/live3.ts の 先頭。
 */
test.describe('LIVE-3 メニュー', () => {
  test.describe.configure({ timeout: 150_000 });

  test('AC1 えらべる 子の 一覧（窓口 meatList）: (a)(b) だけ。(c) 野原の 大人・(d) ひよこ・(e) だっこ中・(f) 演出中・べつの 小屋の 子 は 入らない', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const { cid, c, ids } = L.farm(0);
      const out: any = {};
      const a = A.kid(c, { stage: 'adult', raised: true }, -1, -1);
      const b = A.kid(c, { stage: 'adult', raised: true, breed: 'macho' }, 0, -1);
      const cc = A.kid(c, { stage: 'adult', raised: false }, 1, -1);
      const d = A.kid(c, { stage: 'chick', raised: false }, -1, 1);
      const e = A.kid(c, { stage: 'adult', raised: true }, 0, 1);
      const f = A.kid(c, { stage: 'adult', raised: true }, 1, 1);
      const cid2 = A.coop(34, 20);
      const c2 = A.cinfo(cid2);
      const other = A.kid(c2, { stage: 'adult', raised: true });
      out.ids = { a, b, cc, d, e, f, other, cid, cid2 };
      out.all = h.animals.meatList(cid).slice().sort((x: number, y: number) => x - y);
      out.other = h.animals.meatList(cid2);
      // (e) だっこ中: 小屋の 中から だっこ する
      h.player.set({ position: { x: c.x + 0.5 - 1.5, y: 9, z: c.z + 0.5 + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
      out.lift = A.lift(e);
      out.carried = h.animals.meatList(cid).slice().sort((x: number, y: number) => x - y);
      // (f) 演出中
      out.meat = h.animals.meat(cid, f);
      out.busy = h.animals.meatList(cid).slice().sort((x: number, y: number) => x - y);
      out.row = A.one(f)?.state;
      out.again = h.animals.meat(cid, a);
      out.bad = h.animals.meat(cid, cc);
      out.bad2 = h.animals.meat(cid, d);
      out.bad3 = h.animals.meat(cid, other);
      out.busyIds = h.animals.coops().map((x: any) => ({ id: x.id, busy: x.meatBusy }));
      out.ids0 = ids;
      return out;
    });
    const { a, b, cc, d, e, f, other, cid, cid2 } = r.ids;
    expect(r.all, '一覧は (a)(b)(e)(f)').toEqual([a, b, e, f].sort((x, y) => x - y));
    expect(r.other).toEqual([other]);
    expect(r.lift, 'だっこ できた').toBe(true);
    expect(r.carried, 'だっこ中 の (e) は 入らない').toEqual([a, b, f].sort((x, y) => x - y));
    expect(r.meat).toMatchObject({ ok: true, reason: null });
    expect(r.busy, '演出中の (f) は 入らない').toEqual([a, b].sort((x, y) => x - y));
    expect(r.row).toBe('meat');
    expect(r.again, '1 つの 小屋で 同時に 1 わだけ').toMatchObject({ ok: false, reason: 'busy' });
    expect(r.bad, '野原で なかまに した 大人').toMatchObject({ ok: false, reason: 'notEligible' });
    expect(r.bad2, 'ひよこ').toMatchObject({ ok: false, reason: 'notEligible' });
    expect(r.bad3, 'べつの 小屋の 子').toMatchObject({ ok: false, reason: 'notEligible' });
    expect(r.busyIds.find((x: any) => x.id === cid).busy).toBe(f);
    expect(r.busyIds.find((x: any) => x.id === cid2).busy).toBeNull();
    expect([cc, d].some((x) => r.all.includes(x))).toBe(false);
  });

  test('AC2 右クリック 1b: えらべる 子 0 わ → LIVE-2 の まま あつめる。1 わ 以上 → メニュー（たまご は へらず・つち を 持って いても ひらく）。だっこ中 は おろす だけ・照準の 下 は ひらく', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const out: any = {};
      // 小屋 1（えらべる 子 0 わ: (c) 野原の 大人 と (d) ひよこ）・小屋 2（そだてた 大人 1 わ）。すばこ は どちらも 3 こ（保存の 形 で 一度だけ 入れる）
      const { cid, c, f } = L.farm(0);
      A.kid(c, { stage: 'adult', raised: false }, -1, -1);
      A.kid(c, { stage: 'chick', raised: false }, 1, -1);
      const cid2 = A.coop(34, 20);
      const c2 = A.cinfo(cid2);
      const f2 = A.face(c2);
      A.kid(c2, { stage: 'adult', raised: true }, 0, 1);
      const sv = h.animals.serialize();
      for (const cc of sv.coops) cc.nest = { egg: 3, gold: 0 };
      h.animals.deserialize(sv);
      h.step(2);
      h.inventory.clear();
      out.listed0 = h.animals.meatList(cid).length;
      out.listed = h.animals.meatList(cid2).length;
      out.aimed0 = L.stand(c, f);
      out.hint0 = A.hintRight();
      h.animals.events();
      A.tap();
      out.menu0 = L.menu().open;
      out.egg0 = h.inventory.count('egg');
      out.collect0 = A.events('coopCollect').length;
      // 2) 小屋 2: メニュー
      L.stand(c2, f2);
      out.hint1 = A.hintRight();
      A.hold('dirt', 3);
      L.stand(c2, f2);
      h.animals.events();
      A.tap();
      const m = L.menu();
      out.menu1 = { open: m.open, page: m.page, coop: m.coop === cid2, eggs: m.eggs };
      out.egg1 = h.inventory.count('egg');
      out.nest1 = A.cinfo(cid2).nest.egg;
      out.dirt1 = h.inventory.count('dirt');
      out.collect1 = A.events('coopCollect').length;
      L.press('close');
      out.closed = L.menu().open;
      // 3) だっこ中 は おろす だけ（メニュー は 出ない）
      const w = h.animals.spawn(c2.x + 0.5 - f2.fx * 3.5, 9, c2.z + 0.5 - f2.fz * 3.5, { friend: true, follow: A.full(), stage: 'chick' });
      h.step(3);
      h.inventory.clear();
      out.lift = A.lift(w);
      L.stand(c2, f2);
      A.tap();
      h.step(40);
      out.menu2 = L.menu().open;
      out.dropped = A.one(w)?.carried === false;
      return out;
    });
    expect(r.aimed0).toBe(true);
    expect(r.hint0).toMatchObject({ word: 'あつめる' });
    expect(r.menu0, 'えらべる 子 0 わ は メニュー なし').toBe(false);
    expect(r.egg0).toBe(3);
    expect(r.collect0).toBe(1);
    expect(r.listed0).toBe(0);
    expect(r.listed).toBe(1);
    expect(r.hint1, '照準の 下 は ひらく').toMatchObject({ word: 'ひらく' });
    expect(r.menu1).toMatchObject({ open: true, page: 'top', coop: true, eggs: 3 });
    expect(r.egg1, 'ひらいた だけでは たまごは へらず ふえず').toBe(0);
    expect(r.nest1).toBe(3);
    expect(r.dirt1, 'つち を 持って いても ひらく（置かない）').toBe(3);
    expect(r.collect1).toBe(0);
    expect(r.closed).toBe(false);
    expect(r.lift).toBe(true);
    expect(r.menu2, 'だっこ中 は メニュー なし').toBe(false);
    expect(r.dropped, 'おろす').toBe(true);
  });

  test('AC3 ページ 1: たまご を あつめる → egg ＋3・coopCollect・メニュー は ひらいた まま・0 こ で 押せない。Esc で とじる（何も かわらない）。はなれると とじる', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const out: any = {};
      const { cid, c, f } = L.farm(1);
      const sv = h.animals.serialize();
      for (const cc of sv.coops) if (cc.id === cid) cc.nest = { egg: 3, gold: 0 };
      h.animals.deserialize(sv);
      h.step(2);
      h.inventory.clear();
      L.rc(c, f);
      out.open0 = L.menu();
      A.sfx();
      h.animals.events();
      L.press('collect');
      h.step(1);
      out.after = L.menu();
      out.egg = h.inventory.count('egg');
      out.nest = A.cinfo(cid).nest.egg;
      out.collect = A.events('coopCollect').length;
      out.sfx = A.sfx();
      // 0 こ: 押せない
      h.animals.events();
      L.press('collect');
      h.step(1);
      out.again = { egg: h.inventory.count('egg'), collect: A.events('coopCollect').length };
      out.panel0 = L.panel()?.buttons.map((b: any) => ({ text: b.text, disabled: b.disabled }));
      return out;
    });
    expect(r.open0).toMatchObject({ open: true, page: 'top', eggs: 3 });
    expect(r.after, 'ひらいた まま').toMatchObject({ open: true, page: 'top', eggs: 0 });
    expect(r.egg).toBe(3);
    expect(r.nest).toBe(0);
    expect(r.collect).toBe(1);
    expect(r.sfx).toContain('collect');
    expect(r.again.egg, '0 こ の とき は 何も おきない').toBe(3);
    expect(r.again.collect).toBe(0);
    const collectBtn = r.panel0.find((b: any) => b.text.includes('たまごをあつめる'));
    expect(collectBtn, 'ボタン').toBeTruthy();
    expect(collectBtn.disabled, '0 こ で 押せなく なる').toBe(true);

    // Esc で とじる → 何も かわらない
    const s = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const before = { n: h.animals.list().length, egg: h.inventory.count('egg'), meat: h.inventory.count('momo_nama') };
      return before;
    });
    await page.keyboard.press('Escape');
    const r2 = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const L = (window as any).__L;
      h.step(1);
      const out: any = { open: L.menu().open, n: h.animals.list().length, egg: h.inventory.count('egg'), meat: h.inventory.count('momo_nama') };
      // もういちど ひらいて、とどく 距離 より はなれる → とじる
      const cs = h.animals.coops()[0];
      const f = (window as any).__A.face(cs);
      L.rc(cs, f);
      out.open2 = L.menu().open;
      h.player.set({ position: { x: cs.x + 0.5 - f.fx * 30, y: 9, z: cs.z + 0.5 - f.fz * 30 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(3);
      out.far = L.menu().open;
      out.nAfter = h.animals.list().length;
      return out;
    });
    expect(r2.open, 'Esc で とじる').toBe(false);
    expect(r2.n).toBe(s.n);
    expect(r2.egg).toBe(s.egg);
    expect(r2.meat).toBe(0);
    expect(r2.open2).toBe(true);
    expect(r2.far, 'はなれると とじる').toBe(false);
    expect(r2.nAfter).toBe(s.n);
  });

  test('AC4 ページ 2: おにく に する → カード（kids が 一覧 の id と 同じ）。のせる → marks[].pick（その 子 だけ）。もどる → ページ 1', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const out: any = {};
      const { cid, c, f, ids } = L.farm(3, { macho: [1] });
      A.kid(c, { stage: 'chick', raised: false }, 0, 0); // えらべない（ひよこ）
      A.kid(c, { stage: 'adult', raised: false }, 1, 0); // えらべない（野原の 大人）
      L.rc(c, f);
      out.top = L.menu();
      L.press('meat');
      out.pick = L.menu();
      out.list = h.animals.meatList(cid).slice().sort((x: number, y: number) => x - y);
      out.cards = L.panel()?.cards.length ?? -1;
      h.animals.fxReset();
      L.press('hover', ids[1]);
      h.step(1);
      const marks = h.animals.fx().marks;
      out.picks = marks.filter((m: any) => m.pick).map((m: any) => m.id);
      out.markCount = marks.length;
      L.press('hover', ids[2]);
      h.step(1);
      out.picks2 = h.animals.fx().marks.filter((m: any) => m.pick).map((m: any) => m.id);
      L.press('back');
      out.back = L.menu();
      out.picksBack = h.animals.fx().marks.filter((m: any) => m.pick).map((m: any) => m.id);
      out.ids = ids;
      return out;
    });
    expect(r.top).toMatchObject({ open: true, page: 'top' });
    expect(r.pick.page).toBe('pick');
    expect(r.pick.kids.slice().sort((x: number, y: number) => x - y)).toEqual(r.list);
    expect(r.list).toEqual(r.ids.slice().sort((x: number, y: number) => x - y));
    expect(r.cards, 'カード の 数').toBe(3);
    expect(r.picks, 'のせた 子 だけ ▼').toEqual([r.ids[1]]);
    expect(r.picks2).toEqual([r.ids[2]]);
    expect(r.back).toMatchObject({ open: true, page: 'top' });
    expect(r.picksBack, 'ページ 1 に もどったら ▼ は 消える').toEqual([]);
  });

  test('AC5 ページ 3: カード → confirm・selected。やめる → ページ 2（子は かわらない）。とじる → 子 は かわらない・momo_nama 0', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const out: any = {};
      const { c, f, ids } = L.farm(2);
      L.rc(c, f);
      L.press('meat');
      const snap = () => JSON.stringify(h.animals.list().map((a: any) => [a.id, a.state, a.stage, a.home]));
      const before = snap();
      L.press('card', ids[1]);
      out.confirm = L.menu();
      L.press('cancel');
      out.cancel = L.menu();
      out.sameAfterCancel = snap() === before;
      L.press('card', ids[0]);
      out.confirm2 = L.menu();
      L.press('close');
      out.closed = L.menu();
      out.sameAfterClose = snap() === before;
      out.meat = h.inventory.count('momo_nama');
      out.meatEv = A.events('meatStart').length + A.events('meat').length;
      h.step(240);
      out.meatLater = h.inventory.count('momo_nama');
      out.n = h.animals.list().length;
      out.ids = ids;
      return out;
    });
    expect(r.confirm).toMatchObject({ open: true, page: 'confirm', selected: r.ids[1] });
    expect(r.cancel.page).toBe('pick');
    expect(r.cancel.open).toBe(true);
    expect(r.sameAfterCancel).toBe(true);
    expect(r.confirm2).toMatchObject({ page: 'confirm', selected: r.ids[0] });
    expect(r.closed.open).toBe(false);
    expect(r.sameAfterClose).toBe(true);
    expect(r.meat).toBe(0);
    expect(r.meatEv).toBe(0);
    expect(r.meatLater, '240 ステップ たっても にく は 入らない').toBe(0);
    expect(r.n).toBe(2);
  });
});
