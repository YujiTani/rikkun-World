import { expect, test } from '@playwright/test';
import { KATANA_SET, waitReady } from './helpers/blade';
import { openLive4 } from './helpers/live4';
import { parryFireballAtF } from './helpers/parry';

/**
 * LIVE-4 E2E その 1（docs/design/LIVE-4.md 版 2 §2.1・§2.2・§5・§6 AC1・AC2・AC3・AC8〜AC10・AC12・AC14）: だれ が たたかうか・何 を ねらうか・やめる とき。
 * 数え方: `M.hit()`・`M.hurtMe()` の `rows[k]` は「体力 が へった ステップ」。ねらい を きめた ステップ = きっかけ の ステップ（k）。
 * 「ねらい の あと N ステップ」は k の 次 の ステップ から 数えて N 番目（rows の 番号 k + N）。時間（ms）では 決めない（#255）。
 * 窓口 は 仕様書 §6.1 の もの（`animals.fighters()`・`list()` の `target`/`hits`・出来事 `machoTarget`/`machoGiveUp`・`yokai.events()` の `hurt.by`）。
 */
test.describe('LIVE-4 ねらい', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC1 たたかう マッチョ（窓口）: fighters() は (a) だけ。だっこ すると 空', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      M.base();
      const o: any = { hasFighters: typeof h.animals.fighters === 'function' };
      const a = M.macho(9.5, 6.5, { follow: 18000 });
      const b = M.macho(9.5, 7.5, { follow: 1 }); // 35 コマ の あいだ に follow 0
      const c = M.macho(9.5, 8.5, { stage: 'chick' });
      const d = M.macho(9.5, 9.5, { breed: 'normal' });
      o.ids = { a, b, c, d };
      o.fighters = o.hasFighters ? h.animals.fighters() : null;
      o.b = A.one(b)?.follow;
      // だっこ
      if (o.hasFighters) {
        A.stand(a);
        o.lifted = A.lift(a);
        h.step(1);
        o.afterLift = h.animals.fighters();
      }
      return o;
    });
    expect(r.hasFighters, '窓口 fighters()').toBe(true);
    expect(r.b, '(b) は follow 0').toBe(0);
    expect(r.fighters, '(a) だけ').toEqual([r.ids.a]);
    expect(r.lifted, 'だっこ できた').toBe(true);
    expect(r.afterLift, 'だっこ 中 は たたかわない').toEqual([]);
  });

  test('AC1 (g) いただきます 中 の 子 は たたかわない／3 わ の いちばん 早い 子 を だっこ → 次 の ステップ に 2 番目', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      M.base();
      const o: any = {};
      const ids = [M.macho(9.5, 4.5, { follow: 18000 }), M.macho(9.5, 6.5, { follow: 18000 }), M.macho(9.5, 8.5, { follow: 18000 })];
      o.ids = ids;
      o.first = h.animals.fighters();
      A.stand(ids[0]);
      o.lifted = A.lift(ids[0]);
      h.step(1);
      o.afterLift = h.animals.fighters();
      // (g)
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const kid = A.kid(c, { stage: 'adult', raised: true, breed: 'macho', follow: 18000 });
      const m = h.animals.meat(cid, kid);
      h.step(30);
      o.meat = m.ok;
      o.duringMeat = h.animals.fighters();
      o.kid = kid;
      return o;
    });
    expect(r.first).toEqual([r.ids[0]]);
    expect(r.lifted).toBe(true);
    expect(r.afterLift, '次 の ステップ に 2 番目').toEqual([r.ids[1]]);
    expect(r.meat).toBe(true);
    expect(r.duringMeat, 'いただきます 中 の 子 は 入らない').not.toContain(r.kid);
  });

  test('AC12b machoFighters 0: fighters() は 空・だれ も target を 持たない', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      M.base();
      const o: any = {};
      try {
        h.settings.set('machoFighters', 0);
        o.setting = h.settings.get('machoFighters');
      } catch {
        o.setting = null;
      }
      const ids = [M.macho(1.5, 4.5), M.macho(1.5, 6.5)];
      const yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      M.faceTo(yid, 2);
      const hit = M.hit(yid, { m: ids[0] });
      M.rec(120, { m: ids[0], y: yid });
      o.k = hit.k;
      o.fighters = typeof h.animals.fighters === 'function' ? h.animals.fighters() : null;
      o.targets = ids.map((id: number) => A.one(id).target ?? null);
      o.events = h.animals.events().filter((e: any) => e.type === 'machoTarget').length;
      // 見張り: 1 に もどす と ねらう
      h.settings.set('machoFighters', 1);
      M.faceTo(yid, 2);
      h.step(60);
      const again = M.hit(yid, { m: ids[0] });
      o.ctl = again.rows[again.k]?.m?.target ?? null;
      o.yid = yid;
      return o;
    });
    expect(r.setting, '設定 machoFighters 0').toBe(0);
    expect(r.k).toBeGreaterThanOrEqual(0);
    expect(r.fighters, '空').toEqual([]);
    expect(r.targets).toEqual([null, null]);
    expect(r.events).toBe(0);
    expect(r.ctl, '見張り: 1 に もどす と ねらう').toBe(r.yid);
  });

  test('AC2 きっかけ 1: ぼくとう で 1 回 → その ステップ に target・machoTarget(playerHit)・machoGo 1 回。もう 1 回 たたいても machoGo は ふえない', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const M = (window as any).__M;
      M.base();
      const mid = M.macho(11.5, 6.5);
      const yid = M.yokai('karakasa', 6.5, 6.5);
      const o: any = { mid, yid, faced: M.faceTo(yid, 2) };
      const first = M.hit(yid, { m: mid });
      o.k = first.k;
      o.row = first.rows[first.k] ?? null;
      o.before = first.rows.slice(0, Math.max(0, first.k)).map((x: any) => x.m?.target ?? null);
      o.go1 = first.rows.reduce((n: number, x: any) => n + x.snd.filter((s: string) => s === 'machoGo').length, 0);
      // 2 回目（ぼくとう の もどり を 待って から）
      const rest = M.rec(60, { m: mid, y: yid });
      o.go1b = rest.reduce((n: number, x: any) => n + x.snd.filter((s: string) => s === 'machoGo').length, 0);
      o.faced2 = M.faceTo(yid, 2);
      const second = M.hit(yid, { m: mid });
      o.k2 = second.k;
      o.by2 = (second.rows[second.k]?.yev ?? []).filter((e: any) => e.type === 'hurt').map((e: any) => e.by);
      const more = M.rec(30, { m: mid, y: yid });
      o.go2 = [...second.rows, ...more].reduce((n: number, x: any) => n + x.snd.filter((s: string) => s === 'machoGo').length, 0);
      o.targetEvents = [...first.rows, ...rest, ...second.rows, ...more].flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoTarget');
      return o;
    });
    expect(r.faced && r.faced2, 'ぼくとう が とどく').toBe(true);
    expect(r.k, '1 回目 で 体力 が へった').toBeGreaterThanOrEqual(0);
    const hurt = r.row.yev.find((e: any) => e.type === 'hurt' && e.id === r.yid);
    expect(hurt, 'hurt').toBeTruthy();
    expect(hurt.by, 'hurt の by').toBe('player');
    expect(r.row.m.target, 'その ステップ に target').toBe(r.yid);
    expect(r.before.every((t: unknown) => t === null), 'それ より 前 は null').toBe(true);
    const te = r.row.aev.find((e: any) => e.type === 'machoTarget');
    expect(te, 'その ステップ に machoTarget').toMatchObject({ id: r.mid, yokai: r.yid, cause: 'playerHit' });
    expect(r.go1, 'machoGo 1 回').toBe(1);
    expect(r.go1b).toBe(0);
    expect(r.k2, '2 回目 も 体力 が へった').toBeGreaterThanOrEqual(0);
    expect(r.by2, '2 回目 の へった の は プレイヤー の 一撃（マッチョ の パンチ ではない）').toEqual(['player']);
    expect(r.go2, '同じ 妖怪 を もう 1 回 → machoGo は ふえない').toBe(0);
    expect(r.targetEvents.length, 'machoTarget は 1 つ の ねらい に 1 回').toBe(1);
  });

  test('AC3 きっかけ 2: からかさ に たたかれた ステップ に target・cause playerHurt。ちょうちん の 火の玉 で も その ちょうちん', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const M = (window as any).__M;
      const o: any = {};
      M.base();
      const mid = M.macho(1.5, 6.5);
      const kid = M.yokai('karakasa', M.PX + 1.5, 6.5, { hp: 999 });
      const a = M.hurtMe(kid, { m: mid });
      o.k = a.k;
      o.targetBefore = a.rows.slice(0, Math.max(0, a.k)).map((x: any) => x.m?.target ?? null);
      o.row = a.rows[a.k] ?? null;
      o.kid = kid;
      o.mid = mid;
      // ちょうちん（6 マス）
      M.base();
      const mid2 = M.macho(1.5, 6.5);
      const cid = M.yokai('chochin', M.PX + 6, 6.5, { y: 13 });
      const b = M.hurtMe(cid, { m: mid2 }, 600);
      o.k2 = b.k;
      o.row2 = b.rows[b.k] ?? null;
      o.cid = cid;
      o.mid2 = mid2;
      o.attackNow2 = b.attackNow;
      return o;
    });
    expect(r.k, 'からかさ で 体力 が へった').toBeGreaterThanOrEqual(0);
    expect(r.targetBefore.every((t: unknown) => t === null), 'たたかれる 前 は null').toBe(true);
    expect(r.row.m.target).toBe(r.kid);
    expect(r.row.aev.find((e: any) => e.type === 'machoTarget')).toMatchObject({ id: r.mid, yokai: r.kid, cause: 'playerHurt' });
    expect(r.attackNow2, 'ちょうちん が 火の玉 を うつ').not.toBeNull();
    expect(r.k2, '火の玉 で 体力 が へった').toBeGreaterThanOrEqual(0);
    expect(r.row2.m.target, 'その ちょうちん').toBe(r.cid);
    expect(r.row2.aev.find((e: any) => e.type === 'machoTarget')).toMatchObject({ id: r.mid2, yokai: r.cid, cause: 'playerHurt' });
  });

  test('AC8 やめる (a) 600 ステップ きっかけ なし → 600 で forget（599 では まだ）。たたかれて も 600 が 0 に もどる', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      const forget = 600;
      let setting: any = null;
      try {
        setting = h.settings.get('machoForget');
      } catch {
        /* 設定 が まだ ない（赤） */
      }
      const o: any = { forget: setting };
      // 1) なにも しない
      M.base();
      let mid = M.macho(0.5, 6.5);
      let yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      M.faceTo(yid, 2);
      let hit = M.hit(yid, { m: mid });
      o.k = hit.k;
      // ヒットストップ（#276）で 止まった ステップ は 数えない（ゲーム の 時間 = 止まって いない ステップ）
      let rows = M.rec(forget + 40, { m: mid, y: yid });
      const tg = (r: any) => (r ? (r.m?.target ?? null) : 'none');
      o.t599 = tg(M.atNf(rows, forget - 2));
      o.t600 = tg(M.atNf(rows, forget - 1));
      o.giveUp = rows.map((x: any, i: number) => ({ i: M.nf(rows, i), ev: x.aev.filter((e: any) => e.type === 'machoGiveUp') })).filter((x: any) => x.ev.length).map((x: any) => ({ i: x.i, reason: x.ev[0].reason, id: x.ev[0].id }));
      o.mid = mid;
      // 2) ちょうちん の 火の玉 で たたかれて ねらい → 300 ステップ 目 に また たたかれる → そこ から 600（ちょうちん は うごかない・高い ので マッチョ とは 接触 しない）
      M.base();
      mid = M.macho(0.5, 6.5);
      yid = M.yokai('chochin', M.PX + 5, 6.5, { y: 13, hp: 9999 });
      const stand = () => {
        h.player.set({ position: { x: M.PX, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(1);
      };
      stand();
      const hit1 = M.hurtMe(yid, { m: mid }, 400);
      o.hurt1 = hit1.k;
      const wait = 300 - hit1.rows.length + hit1.k + 1;
      const first = M.rec(Math.max(1, wait), { m: mid, y: yid });
      o.stillAt300 = first[first.length - 1].m.target;
      stand();
      const hurt = M.hurtMe(yid, { m: mid }, 400);
      o.hurtK = hurt.k;
      o.targetAtHurt = hurt.rows[hurt.k] ? (hurt.rows[hurt.k].m?.target ?? null) : 'none';
      const after = M.rec(forget + 40, { m: mid, y: yid });
      o.b599 = tg(M.atNf(after, forget - 2));
      o.b600 = tg(M.atNf(after, forget - 1));
      o.yid2 = yid;
      o.giveUp2 = after.map((x: any, i: number) => ({ i, ev: x.aev.filter((e: any) => e.type === 'machoGiveUp') })).filter((x: any) => x.ev.length).map((x: any) => ({ i: x.i, reason: x.ev[0].reason }));
      return o;
    });
    expect(r.forget, '設定 machoForget').toBe(600);
    expect(r.k).toBeGreaterThanOrEqual(0);
    expect(r.t599, '599 では まだ ねらう').not.toBeNull();
    expect(r.t599).not.toBe('none');
    expect(r.t600, '600 で null').toBeNull();
    expect(r.giveUp, 'machoGiveUp 1 回').toEqual([{ i: r.forget - 1, reason: 'forget', id: r.mid }]);
    expect(r.hurtK, '2 回目 の きっかけ（たたかれた）').toBeGreaterThanOrEqual(0);
    expect(r.targetAtHurt).not.toBeNull();
    expect(r.b599, 'たたかれた ところ から 599 では まだ').not.toBeNull();
    expect(r.b599).not.toBe('none');
    expect(r.b600, 'たたかれた ところ から 600 で null').toBeNull();
    expect(r.giveUp2.map((x: any) => x.reason)).toEqual(['forget']);
  });

  test('AC8 やめる (b) 17 マス はなれる → far、(c) follow 0 → stop、(d) だっこ → stop', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      const o: any = {};
      const reasons = (rows: any[]) => rows.flatMap((x: any) => x.aev.filter((e: any) => e.type === 'machoGiveUp').map((e: any) => e.reason));
      // (b) far
      M.base();
      let mid = M.macho(11.5, 6.5);
      let yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      M.faceTo(yid, 2);
      M.hit(yid, { m: mid });
      M.rec(20, { m: mid, y: yid });
      h.player.set({ position: { x: 6.5, y: 9, z: 23.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      let rows = M.rec(10, { m: mid, y: yid });
      o.far = reasons(rows);
      o.farTarget = rows[rows.length - 1].m.target;
      // (c) follow 0
      M.base();
      mid = M.macho(11.5, 6.5, { follow: 120 });
      yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      M.faceTo(yid, 2);
      M.hit(yid, { m: mid });
      rows = M.rec(120, { m: mid, y: yid }, (r: any) => r.m && r.m.follow === 0);
      const last = rows[rows.length - 1];
      o.stopFollow = last.m.follow;
      o.stopTarget = last.m.target;
      const more = M.rec(3, { m: mid, y: yid });
      o.stop = reasons([...rows, ...more]);
      o.stopState = more[more.length - 1].m.state;
      // (d) だっこ（マッチョ が パンチ で 止まって いる あいだ）
      M.base();
      mid = M.macho(5.5, 6.5);
      yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      M.faceTo(yid, 2);
      M.hit(yid, { m: mid });
      M.rec(70, { m: mid, y: yid });
      o.preTarget = A.one(mid).target;
      A.stand(mid);
      o.lifted = A.lift(mid);
      rows = M.rec(3, { m: mid, y: yid });
      o.lift = reasons(rows);
      o.liftTarget = rows[rows.length - 1].m.target;
      return o;
    });
    // 準備 が うまく いった こと（実装 の 前 でも 通る）
    expect(r.stopFollow, '(c) follow が 0 に なった').toBe(0);
    expect(r.lifted, '(d) だっこ できた').toBe(true);
    expect(r.far, '17 マス').toContain('far');
    expect(r.farTarget).toBeNull();
    expect(r.stopTarget, 'follow 0 の ステップ に null').toBeNull();
    expect(r.stop, 'follow 0').toEqual(['stop']);
    expect(r.preTarget, 'だっこ の 前 は ねらって いる').not.toBeNull();
    expect(r.lift, 'だっこ').toContain('stop');
    expect(r.liftTarget).toBeNull();
  });

  test('AC9 のりかえ: A を たたく → B に たたかれた → target は B・machoGo 2 回。同じ ステップ なら A（きっかけ 1 が さき）', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      const o: any = {};
      const go = (rows: any[]) => rows.reduce((n: number, x: any) => n + x.snd.filter((s: string) => s === 'machoGo').length, 0);
      // 1) じゅんばん
      M.base();
      let mid = M.macho(11.5, 6.5);
      let a = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      let b = M.yokai('karakasa', 3.2, 6.5, { hp: 9999 });
      M.faceTo(a, 2);
      const h1 = M.hit(a, { m: mid });
      o.t1 = h1.rows[h1.k]?.m?.target;
      const probe = M.rec(10, { m: mid, y: a });
      M.faceTo(a, 2);
      h.player.set({ position: { x: 4.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      const h2 = M.hurtMe(b, { m: mid }, 400);
      o.k2 = h2.k;
      o.t2 = h2.rows[h2.k]?.m?.target;
      o.a = a;
      o.b = b;
      o.go = go(h1.rows) + go(probe) + go(h2.rows);
      o.cause2 = h2.rows[h2.k]?.aev.find((e: any) => e.type === 'machoTarget');
      // 2) 同じ ステップ: HURT-1 の 怯みで 刀の わざは とぎれる ので、とんでいる 矢で A を うつ。
      //    まず 矢が 当たる までの ステップ数 ka を はかる（きっかけ 1 = 矢が A に 当たる）
      const setupBow = () => {
        h.inventory.setSlot(1, { item: 'yumi', count: 1 });
        h.inventory.setSlot(2, { item: 'ya', count: 30 });
        h.inventory.select(1);
        h.step(12);
      };
      const place = () => {
        h.player.set({ position: { x: 4.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(1);
      };
      M.base();
      while (h.combat.get().invincibleTicks > 0) h.step(1); // 前の やられの 無敵（90）が のこっていると たたかれても 体力が へらない
      mid = M.macho(11.5, 6.5);
      a = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      place();
      setupBow();
      const hpA0 = M.yk(a).hp;
      h.input.press('primary');
      h.step(45);
      h.input.release('primary');
      let ka = -1; // はなした ステップ(0) から 数えて ka ステップ目 に 当たる
      for (let i = 0; i < 90 && ka < 0; i++) {
        h.step(1);
        if (M.yk(a).hp < hpA0) ka = i;
      }
      o.ka = ka;
      // 本番: B の 当たりを 矢の 当たりと 同じ ステップに する
      M.base();
      while (h.combat.get().invincibleTicks > 0) h.step(1);
      mid = M.macho(11.5, 6.5);
      a = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      b = M.yokai('karakasa', 3.2, 6.5, { hp: 9999 });
      place();
      setupBow();
      const hp0 = h.combat.get().hp;
      // B の 攻撃が 当たる までの ステップ数 hb は 1) の hurtMe（attackNow から 体力が へる まで）で はかった 値
      const hb = h2.k + 1;
      o.kp = ka;
      o.hb = hb;
      // 押した ステップ(0) → 45 で はなす → 矢は ステップ 45 + ka に 当たる。B は attackNow の hb ステップ目（= t0 + hb - 1）が それと 同じに なる ように はじめる
      const t0 = Math.max(0, 45 + ka - hb + 1);
      const rows: any[] = [];
      for (let i = 0; i < 160; i++) {
        if (i === 0) h.input.press('primary');
        if (i === 45) h.input.release('primary');
        if (i === t0) h.yokai.attackNow(b);
        h.step(1);
        rows.push(M.row(i, { m: mid, y: a }));
      }
      const both = rows.findIndex((x: any) => x.php < hp0 && x.yev.some((e: any) => e.type === 'hurt' && e.id === a));
      o.both = both;
      o.t3 = rows[both]?.m?.target;
      o.cause3 = rows[both]?.aev.find((e: any) => e.type === 'machoTarget');
      o.a2 = a;
      return o;
    });
    console.log('LIVE4 AC9', JSON.stringify({ k2: r.k2, kp: r.kp, hb: r.hb, both: r.both }));
    expect(r.t1).toBe(r.a);
    expect(r.k2).toBeGreaterThanOrEqual(0);
    expect(r.t2, 'B に たたかれた → B').toBe(r.b);
    expect(r.go, 'machoGo 2 回').toBe(2);
    expect(r.cause2).toMatchObject({ yokai: r.b, cause: 'playerHurt' });
    expect(r.both, '同じ ステップ に A を たたき B に たたかれた（ka=' + r.kp + ' hb=' + r.hb + '）').toBeGreaterThanOrEqual(0);
    expect(r.t3, '同じ ステップ なら A').toBe(r.a2);
    expect(r.cause3).toMatchObject({ yokai: r.a2, cause: 'playerHit' });
  });

  test('AC10 12 マス: 13 マス 先 の や は ねらわない・11 マス は ねらう。ちょうちん の 火の玉（とどく 8 マス）も ねらう', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      const o: any = { leash: null };
      try {
        o.leash = h.settings.get('machoLeash');
      } catch {
        /* 設定 が まだ ない（赤） */
      }
      const targets = (rows: any[]) => rows.map((x: any) => x.m?.target ?? null);
      const events = (rows: any[]) => rows.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoTarget' || e.type === 'machoGiveUp');
      for (const d of [13, 11]) {
        // や
        M.base();
        const yid = M.yokai('karakasa', 18.5, 6.5, { hp: 9999 });
        h.player.set({ position: { x: 18.5 - d, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(1);
        const mid = M.macho(18.5 - d - 2, 6.5);
        const ya = M.yaFrom(yid, d, { m: mid });
        const after = M.rec(15, { m: mid, y: yid });
        o['ya' + d] = { k: ya.k, targetAtHit: ya.rows[ya.k]?.m?.target ?? null, by: ya.rows[ya.k]?.yev.find((e: any) => e.type === 'hurt')?.by ?? null, after: targets(after), ev: events([...ya.rows, ...after]).length, yid, mid };
      }
      // 火の玉 は 11 マス まで とどかない（火の玉 の きょり < 11。矛盾 C3）ので、とどく 8 マス（12 マス 以内）で 「ねらう」だけ 見る
      M.base();
      const cid = M.yokai('chochin', M.PX + 8, 6.5, { y: 13 });
      const mid2 = M.macho(1.5, 6.5);
      const fb = M.hurtMe(cid, { m: mid2 }, 700);
      o.fb8 = { k: fb.k, targetAtHit: fb.rows[fb.k]?.m?.target ?? null, cause: fb.rows[fb.k]?.aev.find((e: any) => e.type === 'machoTarget')?.cause ?? null, cid };
      return o;
    });
    console.log('LIVE4 AC10', JSON.stringify({ ya13: r.ya13, ya11: r.ya11, fb8: r.fb8 }));
    expect(r.leash, '設定 machoLeash').toBe(12);
    expect(r.ya13.k, '13 マス の や が 当たった').toBeGreaterThanOrEqual(0);
    expect(r.ya13.by).toBe('player');
    expect(r.ya13.targetAtHit).toBeNull();
    expect(r.ya13.after.every((t: unknown) => t === null)).toBe(true);
    expect(r.ya13.ev, 'machoTarget なし').toBe(0);
    expect(r.ya11.k).toBeGreaterThanOrEqual(0);
    expect(r.ya11.targetAtHit, '11 マス は ねらう').toBe(r.ya11.yid);
    expect(r.fb8.k, '火の玉 で たたかれた').toBeGreaterThanOrEqual(0);
    expect(r.fb8.targetAtHit, '12 マス 以内 の 火の玉 → その ちょうちん').toBe(r.fb8.cid);
    expect(r.fb8.cause).toBe('playerHurt');
  });

  test('AC12 1 わ だけ: たたかえる マッチョ 3 わ → target を 持つ の は いちばん 早い 1 わ。ほか 2 わ は null で ついてくる', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      M.base();
      const ids = [M.macho(1.5, 4.5), M.macho(1.5, 6.5), M.macho(1.5, 8.5)];
      const yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      M.faceTo(yid, 2);
      const o: any = { ids, yid, fighters0: h.animals.fighters ? h.animals.fighters() : null };
      const hit = M.hit(yid, { m: ids[0] });
      const rows = M.rec(100, { m: ids[0], y: yid });
      o.k = hit.k;
      void rows;
      const snap = () => ids.map((id: number) => ({ target: A.one(id).target ?? null, state: A.one(id).state }));
      o.snap = snap();
      o.fightersAfter = h.animals.fighters ? h.animals.fighters() : null;
      o.marks = h.animals.events().filter((e: any) => e.type === 'machoTarget').length;
      return o;
    });
    expect(r.fighters0, '窓口').toEqual([r.ids[0]]);
    expect(r.k).toBeGreaterThanOrEqual(0);
    expect(r.snap[0].target, 'いちばん 早い 子').toBe(r.yid);
    expect(r.snap[1].target).toBeNull();
    expect(r.snap[2].target).toBeNull();
    expect(['follow', 'idle', 'wander', 'rest', 'look']).toContain(r.snap[1].state);
    expect(['follow', 'idle', 'wander', 'rest', 'look']).toContain(r.snap[2].state);
    expect(r.fightersAfter).toEqual([r.ids[0]]);
  });

  test('AC14 きっかけ に ならない (a) パリィ で はじく: target null・machoTarget なし・machoGo なし。そのあと 体力 を へらす と その ステップ に ねらう', async ({ page }) => {
    await openLive4(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).__M.base();
      h.inventory.setSlot(1, { item: 'katana', count: 1 });
      h.inventory.select(1);
      h.step(1);
    });
    await waitReady(page, KATANA_SET);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      const o: any = {};
      const mid = M.macho(1.5, 6.5);
      const F = 10;
      // 先 に 当たる ステップ を はかる（置いて 攻撃 させて すぐ 消す）
      const p = h.player.get().position;
      const probe = M.yokai('karakasa', p.x + 1.5, p.z, { hp: 999 });
      const hit = (h.yokai.attackNow(probe) as { hitInSteps: number }).hitInSteps;
      h.yokai.clear();
      h.step(2);
      const yid = M.yokai('karakasa', p.x + 1.5, p.z, { hp: 999 });
      h.yokai.events();
      h.animals.events();
      h.audio.sfx();
      o.hit = hit;
      const hp0 = h.combat.get().hp;
      const rows: any[] = [];
      const press = () => {
        h.input.press('run');
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        rows.push(M.row(rows.length, { m: mid, y: yid }));
      };
      const wait = (n: number) => {
        for (let i = 0; i < n; i++) {
          h.step(1);
          rows.push(M.row(rows.length, { m: mid, y: yid }));
        }
      };
      if (F <= hit) {
        h.yokai.attackNow(yid);
        wait(hit - F);
        press();
        wait(F - 1);
      } else {
        press();
        wait(F - 1 - hit);
        h.yokai.attackNow(yid);
        wait(hit);
      }
      wait(40);
      h.input.releaseAll();
      o.parried = h.parry.events().some((e: any) => e.type === 'parrySuccess');
      o.hpSame = h.combat.get().hp === hp0;
      o.targets = rows.map((x: any) => x.m?.target ?? null);
      o.events = rows.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoTarget').length;
      o.go = rows.flatMap((x: any) => x.snd).filter((s: string) => s === 'machoGo').length;
      // そのあと 体力 を へらす と ねらう（ぼくとう）
      h.inventory.select(0);
      h.step(30);
      h.player.set({ position: { x: p.x, y: 9, z: p.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
      M.faceTo(yid, 1.5);
      const after = M.hit(yid, { m: mid });
      o.afterK = after.k;
      o.afterTarget = after.rows[after.k]?.m?.target ?? null;
      o.yid = yid;
      return o;
    });
    expect(r.parried, 'パリィ 成功').toBe(true);
    expect(r.hpSame, '体力 は へらない').toBe(true);
    expect(r.targets.every((t: unknown) => t === null), 'target null').toBe(true);
    expect(r.events).toBe(0);
    expect(r.go).toBe(0);
    expect(r.afterK).toBeGreaterThanOrEqual(0);
    expect(r.afterTarget, 'そのあと 同じ 妖怪 の 体力 を へらす と ねらう').toBe(r.yid);
  });

  test('AC14 きっかけ に ならない (b) ちょうちん の 火の玉 を パリィ で はね返す: target null・machoTarget なし・machoGo なし。そのあと ねらう', async ({ page }) => {
    await openLive4(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).__M.base();
      h.inventory.setSlot(1, { item: 'katana', count: 1 });
      h.inventory.select(1);
      h.step(1);
    });
    await waitReady(page, KATANA_SET);
    const pre = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      const mid = M.macho(1.5, 6.5);
      const cid = M.yokai('chochin', M.PX + 5, 6.5, { y: 13, hp: 999 });
      h.yokai.events();
      h.animals.events();
      h.audio.sfx();
      h.parry.events();
      (window as any).__base = h.parry.events().length;
      (window as any).__hp0 = h.combat.get().hp;
      h.yokai.attackNow(cid);
      return { mid, cid };
    });
    await parryFireballAtF(page, 10);
    const r = await page.evaluate(({ mid, cid }) => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      const rows = M.rec(60, { m: mid, y: cid });
      h.input.releaseAll();
      const o: any = {};
      o.ok = h.parry.events().slice((window as any).__base).some((e: any) => e.type === 'parrySuccess');
      o.hpSame = h.combat.get().hp === (window as any).__hp0;
      o.target = rows.map((x: any) => x.m?.target ?? null).filter((t: unknown) => t !== null).length;
      o.te = rows.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoTarget').length;
      o.go = rows.flatMap((x: any) => x.snd).filter((s: string) => s === 'machoGo').length;
      h.inventory.select(0);
      h.step(40);
      M.faceTo(cid, 1.5);
      // 見張り: ちょうちん は 高い ので ぼくとう は とどかない → 火の玉 を あらためて うたせて たたかれる
      h.yokai.setHp(cid, 999);
      h.player.set({ position: { x: M.PX, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
      const hurt = M.hurtMe(cid, { m: mid }, 400);
      o.ctl = hurt.rows[hurt.k]?.m?.target ?? null;
      void A;
      return o;
    }, pre);
    expect(r.ok, '火の玉 を はじいた').toBe(true);
    expect(r.hpSame).toBe(true);
    expect(r.target).toBe(0);
    expect(r.te).toBe(0);
    expect(r.go).toBe(0);
    expect(r.ctl, '見張り: そのあと たたかれる と ねらう').toBe(pre.cid);
  });

  test('AC14 きっかけ に ならない (c) からぶり・(e) 落ちて 体力 が へる', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      M.base();
      const mid = M.macho(1.5, 6.5);
      const yid = M.yokai('karakasa', 12.5, 6.5, { hp: 999 });
      const o: any = { yid };
      const all: any[] = [];
      const count = () => ({
        targets: all.map((x: any) => x.m?.target ?? null).filter((t: unknown) => t !== null).length,
        te: all.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoTarget').length,
        go: all.flatMap((x: any) => x.snd).filter((s: string) => s === 'machoGo').length,
      });
      // (c) からぶり: とどかない 所 で ふる
      h.input.release('primary');
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      all.push(...M.rec(60, { m: mid, y: yid }));
      o.c = count();
      // (e) 落ちて 体力 が へる
      const hp0 = h.combat.get().hp;
      h.player.set({ position: { x: M.PX, y: 22, z: M.PZ }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      const fall = M.rec(120, { m: mid, y: yid }, (x: any) => x.php < hp0);
      all.push(...fall);
      o.fellHp = hp0 - h.combat.get().hp;
      o.e = count();
      // 見張り（なにも ねらわない の は 実装 が ない から ではない と 確かめる）: そのあと 同じ 妖怪 の 体力 を ぼくとう で へらす → その ステップ に ねらう
      h.step(130);
      h.yokai.clear();
      const yid2 = M.yokai('karakasa', 12.5, 6.5, { hp: 999 });
      M.faceTo(yid2, 2);
      const ctl = M.hit(yid2, { m: mid });
      o.ctlK = ctl.k;
      o.ctlTarget = ctl.rows[ctl.k]?.m?.target ?? null;
      o.yid2 = yid2;
      return o;
    });
    expect(r.c, 'からぶり').toEqual({ targets: 0, te: 0, go: 0 });
    expect(r.fellHp, '落ちて 体力 が へった').toBeGreaterThan(0);
    expect(r.e, '落下').toEqual({ targets: 0, te: 0, go: 0 });
    expect(r.ctlK).toBeGreaterThanOrEqual(0);
    expect(r.ctlTarget, 'そのあと 同じ 妖怪 の 体力 を へらす と その ステップ に ねらう').toBe(r.yid2);
  });
});
