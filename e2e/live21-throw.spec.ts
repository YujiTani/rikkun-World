import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2.1 E2E その 2（docs/design/LIVE-2.1.md 版 1.1 §2.2・§6）: だっこ から なげる。
 * AC4 なげる（通し） / AC5 なげる きょり / AC6 当たる / AC9 着地点 の 丸（`animals.throwSpot()`）。
 * 窓口（仕様 §6.2 の 名前）: `animals.throwSpot()`・`animals.throwTo(x, y, z)`・`animals.events()` の `toss`／`bonk`・`list()` の `state: 'thrown'`。
 * 時間は 「ステップ」で 数える（#255）。とびかたの 数（もちあげ 10・20＋5d・さく の 上 ＋2.0・おりる 速さ）は 設定と 窓口に 聞いて くらべる。
 * 照準で さく ごしに ねらえる か は 画面の 高さに よる ので AC17（オーナー確認）。ここは 窓口の `throwTo` で とびかたを 見る。
 */
test.describe('LIVE-2.1 なげる', () => {
  test.describe.configure({ timeout: 150_000 });

  for (const stage of ['chick', 'adult'] as const) {
    test(`AC4 なげる（通し・${stage}）: さく の 外 1 マス から 中 3×3 へ → 10 ステップ目に toss・carried false・さく の 列 の 上 で 体 の 下 が 地面＋2.0 以上・20＋5d(±2) で P・下向き 速さ 以下・home`, async ({ page }) => {
      await openAnimals(page);
      const r = await page.evaluate((stg) => {
        const h = (window as any).__rikkun;
        const A = (window as any).__A;
        A.base(40);
        const cid = A.coop(20, 20);
        const c = A.cinfo(cid);
        const out: any = { cid, stg };
        const px = c.x - 3 + 0.5; // さく(c.x-2) の すぐ 外
        const pz = c.z + 0.5;
        const got = A.carryOne(px, pz, stg);
        out.lifted = got.ok;
        h.player.set({ position: { x: px, y: 9, z: pz }, yaw: 90, pitch: 0 });
        h.step(1);
        out.speed = h.settings.get(stg === 'chick' ? 'chickFlutterFallSpeed' : 'animalFlutterFallSpeed');
        h.audio.sfx();
        out.to = { x: c.x + 0.5, y: c.y, z: c.z + 0.5 };
        h.animals.throwTo(out.to.x, out.to.y, out.to.z);
        const f = A.flight(got.id, { press: false });
        out.tossAt = f.tossAt;
        out.tossEv = f.ev.find((e: any) => e.type === 'toss') ?? null;
        out.carriedAtToss = f.tossAt >= 0 ? f.rows[f.tossAt].carried : null;
        const fenceX = c.x - 2;
        const flying = f.rows.filter((q: any) => q.i >= f.tossAt && f.tossAt >= 0 && !q.fluttering);
        out.sawThrown = f.rows.some((q: any) => q.state === 'thrown');
        // 上で 体 の 下（足）が 地面(c.y)＋2 以上 であるべき 行（さく の 列 の 上）
        const over = flying.filter((q: any) => q.x >= fenceX - 0.3 && q.x < fenceX + 1.3);
        out.overCount = over.length;
        out.overMin = over.length ? Math.min(...over.map((q: any) => q.y)) : null;
        out.groundTop = c.y;
        const pAt = f.rows.find((q: any) => q.i > f.tossAt && q.fluttering)?.i ?? -1;
        out.pAt = pAt;
        out.d = Math.hypot(out.to.x - px, out.to.z - pz);
        out.minVy = Math.min(...f.rows.filter((q: any) => q.fluttering).map((q: any) => q.vy));
        out.homeEv = f.ev.find((e: any) => e.type === 'home') ?? null;
        out.last = f.rows[f.rows.length - 1];
        out.row = A.one(got.id);
        out.sfx = A.sfx();
        return out;
      }, stage);
      expect(r.lifted).toBe(true);
      expect(r.tossAt, '押した ステップ から 10 ステップ 目 に toss').toBeGreaterThanOrEqual(8);
      expect(r.tossAt).toBeLessThanOrEqual(12);
      expect(r.tossEv).toMatchObject({ type: 'toss' });
      expect(r.tossEv.to).toBeTruthy();
      expect(r.carriedAtToss).toBe(false);
      expect(r.sawThrown, 'list() の state が thrown').toBe(true);
      expect(r.overCount, 'さく の 上 を とおった').toBeGreaterThan(0);
      expect(r.overMin, 'さく の 列 の 上 で 体 の 下 が 地面＋2.0 以上').toBeGreaterThanOrEqual(r.groundTop + 2.0 - 0.05);
      expect(r.pAt, 'P に 着いた').toBeGreaterThan(0);
      expect(Math.abs(r.pAt - r.tossAt - (20 + 5 * r.d)), '20＋5d ステップ(±2。はかる ぶんの ゆとり 1)').toBeLessThanOrEqual(3);
      expect(r.minVy, 'そのあと 下向き の 速さ').toBeGreaterThanOrEqual(-(r.speed + 0.05));
      expect(r.homeEv, '着地 で home').toMatchObject({ type: 'home', coop: r.cid });
      expect(r.row.home, 'home が 小屋 id').toBe(r.cid);
      expect(r.sfx).toContain('toss');
    });
  }

  test('AC5 なげる きょり: 5 マス 先（とどく 5 の きわ） → 着地点 は 水平 4(±0.5) に よせる。着地 は throwSpot と 同じ マス(±0.5)', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = {};
      const got = A.carryOne(10.5, 20.5, 'chick');
      out.lifted = got.ok;
      h.player.set({ position: { x: 11, y: 9, z: 20.5 }, yaw: 90, pitch: 0 }); // 照準 の とどく 5 の 内
      (window as any).__aim.solve(15, 8, 20, 1); // とどく きょり 5 の 内で、水平 4 より 遠い
      h.step(1);
      const p = h.player.get().position;
      out.aim = h.target.get()?.place ?? null;
      out.spot = h.animals.throwSpot();
      out.hint = A.hintRight();
      out.d = out.spot ? Math.hypot(out.spot.x - p.x, out.spot.z - p.z) : null;
      const f = A.flight(got.id);
      out.tossAt = f.tossAt;
      out.land = f.ev.find((e: any) => e.type === 'putDown') ?? null;
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.aim).toMatchObject({ x: 15, y: 9, z: 20 });
    expect(r.spot).toMatchObject({ ok: true, toss: true });
    expect(r.d, '水平 4（throwRange）').toBeGreaterThanOrEqual(3.5);
    expect(r.d).toBeLessThanOrEqual(4.5);
    expect(r.hint).toMatchObject({ word: 'なげる' });
    expect(r.tossAt).toBeGreaterThan(0);
    expect(r.land).not.toBeNull();
    expect(Math.abs(r.land.x - r.spot.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(r.land.z - r.spot.z)).toBeLessThanOrEqual(0.5);
  });

  test('AC5b 何も ねらわない（空を 見る）→ 前 3(±0.5) の 地面', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = {};
      const got = A.carryOne(10.5, 20.5, 'chick');
      out.lifted = got.ok;
      h.player.set({ position: { x: 10.5, y: 9, z: 20.5 }, yaw: 90, pitch: 70 });
      h.step(1);
      out.noTarget = !h.target.get();
      out.spot = h.animals.throwSpot();
      const p = h.player.get().position;
      out.d = out.spot ? Math.hypot(out.spot.x - p.x, out.spot.z - p.z) : null;
      const f = A.flight(got.id);
      out.land = f.ev.find((e: any) => e.type === 'putDown') ?? null;
      out.tossAt = f.tossAt;
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.noTarget).toBe(true);
    expect(r.spot).toMatchObject({ ok: true, toss: true });
    expect(r.d, '前 3').toBeGreaterThanOrEqual(2.5);
    expect(r.d).toBeLessThanOrEqual(3.5);
    expect(r.spot.y, '地面').toBeGreaterThanOrEqual(8.5);
    expect(r.spot.y).toBeLessThanOrEqual(9.5);
    expect(r.tossAt).toBeGreaterThan(0);
    expect(r.land).not.toBeNull();
  });

  test('AC5c 0.8 マス 先 を ねらう → なげず に 20 ステップ で そっと おろす（putDown・toss なし）。語は おろす', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = {};
      const got = A.carryOne(10.5, 20.5, 'chick');
      out.lifted = got.ok;
      h.player.set({ position: { x: 9.7, y: 9, z: 20.5 }, yaw: 90, pitch: -50 });
      (window as any).__aim.solve(10, 8, 20, 1);
      h.step(1);
      const p = h.player.get().position;
      out.place = h.target.get()?.place ?? null;
      out.dist = out.place ? Math.hypot(out.place.x + 0.5 - p.x, out.place.z + 0.5 - p.z) : null;
      out.spot = h.animals.throwSpot();
      out.hint = A.hintRight();
      const f = A.flight(got.id, { max: 100 });
      out.tossEvents = f.ev.filter((e: any) => e.type === 'toss').length;
      out.put = f.ev.find((e: any) => e.type === 'putDown') ?? null;
      out.carriedEnd = f.rows[f.rows.length - 1].carried;
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.place).toMatchObject({ x: 10, y: 9, z: 20 });
    expect(r.dist, '1 より 近い').toBeLessThan(1);
    expect(r.spot).toMatchObject({ toss: false });
    expect(r.hint).toMatchObject({ word: 'おろす' });
    expect(r.tossEvents, 'toss なし').toBe(0);
    expect(r.put, 'putDown').not.toBeNull();
    expect(r.put.i, '20 ステップ くらい').toBeGreaterThanOrEqual(17);
    expect(r.put.i).toBeLessThanOrEqual(24);
    expect(r.carriedEnd).toBe(false);
  });

  test('AC5d 固い マス だけ の 所 → なげない・cantPutHere・だっこ の まま。6 わ の 小屋 の 中 を ねらう → なげない・coopFull', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = {};
      const got = A.carryOne(10.5, 20.5, 'chick');
      out.lifted = got.ok;
      // 前の マスを ぜんぶ 固くして、空を ねらう
      h.world.fill(11, 9, 17, 15, 11, 23, 'stone');
      h.step(2);
      h.player.set({ position: { x: 10.5, y: 9, z: 20.5 }, yaw: 90, pitch: 80 });
      h.step(1);
      out.spot = h.animals.throwSpot();
      out.hint = A.hintRight();
      const f = A.flight(got.id, { max: 40 });
      out.solid = { toss: f.ev.filter((e: any) => e.type === 'toss').length, hint: f.ev.filter((e: any) => e.type === 'hint').map((e: any) => e.hint), carried: f.rows[f.rows.length - 1].carried };
      // 6 わの 小屋
      h.world.fill(11, 9, 17, 15, 11, 23, 'air');
      h.step(2);
      const cid = A.coop(30, 20);
      const c = A.cinfo(cid);
      for (let i = 0; i < 6; i++) A.kid(A.cinfo(cid), { stage: 'adult' }, (i % 3) - 1, Math.floor(i / 3) - 1);
      h.player.set({ position: { x: c.x - 0.5, y: 9, z: c.z + 0.5 }, yaw: 90, pitch: 0 });
      h.step(1);
      (window as any).__aim.solve(c.x + 1, 8, c.z, 1);
      h.step(1);
      out.fullPlace = h.target.get()?.place ?? null;
      const f2 = A.flight(got.id, { max: 40 });
      out.full = { toss: f2.ev.filter((e: any) => e.type === 'toss').length, hint: f2.ev.filter((e: any) => e.type === 'hint').map((e: any) => e.hint), carried: f2.rows[f2.rows.length - 1].carried };
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.spot).toMatchObject({ ok: false });
    expect(r.hint, '照準の 下 は うすい なげる').toMatchObject({ word: 'なげる', disabled: true });
    expect(r.solid.toss).toBe(0);
    expect(r.solid.hint).toContain('cantPutHere');
    expect(r.solid.carried).toBe(true);
    expect(r.fullPlace).toMatchObject({ x: 31, y: 9, z: 20 });
    expect(r.full.toss).toBe(0);
    expect(r.full.hint).toContain('coopFull');
    expect(r.full.carried).toBe(true);
  });

  test('AC6 当たる: 前 1.5 マス の 高さ 4 の いし の かべ → かべ に 当たった ステップに bonk・体 が かべ の マス に 入らない・かべ の 手前 に 着地。音 bonk', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = {};
      const got = A.carryOne(10.5, 20.5, 'chick');
      out.lifted = got.ok;
      h.world.fill(12, 9, 14, 12, 12, 26, 'stone'); // 高さ 4・はば 13
      h.step(2);
      h.player.set({ position: { x: 10.5, y: 9, z: 20.5 }, yaw: 90, pitch: 0 });
      h.step(1);
      h.audio.sfx();
      h.animals.throwTo(14.5, 9, 20.5); // 向こう 3 マス
      const f = A.flight(got.id, { press: false });
      out.bonk = f.ev.find((e: any) => e.type === 'bonk') ?? null;
      out.tossAt = f.tossAt;
      out.inWall = f.rows.filter((q: any) => q.x >= 12 && q.x < 13 && q.y >= 9 && q.y < 13).length;
      out.minX = Math.min(...f.rows.map((q: any) => q.x));
      out.maxX = Math.max(...f.rows.map((q: any) => q.x));
      out.land = f.ev.find((e: any) => e.type === 'putDown') ?? null;
      const bAt = out.bonk ? out.bonk.i : -1;
      out.afterBonkFlutter = f.rows.filter((q: any) => q.i > bAt && q.fluttering).length;
      out.sfx = A.sfx();
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.bonk, 'bonk').not.toBeNull();
    expect(r.bonk.i).toBeGreaterThan(r.tossAt);
    expect(r.inWall, 'かべ の マス に 入らない').toBe(0);
    expect(r.maxX, 'かべ を こえない').toBeLessThan(12);
    expect(r.land, '手前 に 着地').not.toBeNull();
    expect(r.land.x).toBeLessThan(12);
    expect(r.afterBonkFlutter, '当たった あと その 場 から パタパタ').toBeGreaterThan(0);
    expect(r.sfx).toContain('bonk');
  });

  test('AC6b 高さ 2 の トンネル で なげる → bonk・プレイヤー から 1.5 マス 以内 に 着地', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = {};
      const got = A.carryOne(10.5, 20.5, 'chick');
      out.lifted = got.ok;
      h.world.fill(6, 11, 16, 20, 11, 24, 'stone'); // 天井（あき は y 9..10 の 2 マス）
      h.step(2);
      h.player.set({ position: { x: 10.5, y: 9, z: 20.5 }, yaw: 90, pitch: 0 });
      h.step(1);
      h.animals.throwTo(14.5, 9, 20.5);
      const f = A.flight(got.id, { press: false });
      out.bonk = f.ev.find((e: any) => e.type === 'bonk') ?? null;
      out.land = f.ev.find((e: any) => e.type === 'putDown') ?? null;
      out.dist = out.land ? Math.hypot(out.land.x - 10.5, out.land.z - 20.5) : null;
      out.inCeiling = f.rows.filter((q: any) => q.y >= 11 && q.y < 12).length;
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.bonk).not.toBeNull();
    expect(r.land).not.toBeNull();
    expect(r.dist, 'すぐ 前 に 着地').toBeLessThanOrEqual(1.5);
    expect(r.inCeiling, '天井 に めりこまない').toBe(0);
  });

  test('AC6c さく の 上 に 着く ように なげた（throwTo）→ 中 3×3 の いちばん 近い マス に いる・小屋 の 子', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const out: any = { cid };
      const px = c.x - 3 + 0.5;
      const got = A.carryOne(px, c.z + 0.5, 'chick');
      out.lifted = got.ok;
      h.player.set({ position: { x: px, y: 9, z: c.z + 0.5 }, yaw: 90, pitch: 0 });
      h.step(1);
      h.animals.throwTo(c.x - 1.5, c.y + 2, c.z + 0.5); // さく(c.x-2) の 上
      const f = A.flight(got.id, { press: false, max: 700 });
      for (let i = 0; i < 60; i++) h.step(1);
      const row = A.one(got.id);
      out.row = row ? { x: row.x, z: row.z, home: row.home ?? null } : null;
      out.inside = row ? A.inside(c, row) : false;
      out.near = row ? Math.hypot(row.x - (c.x - 0.5), row.z - (c.z + 0.5)) : null;
      out.homeEv = f.ev.find((e: any) => e.type === 'home') ?? null;
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.inside, '中 3×3 に いる').toBe(true);
    expect(r.row.home, '小屋 の 子').toBe(r.cid);
    expect(r.near, 'いちばん 近い あき マス').toBeLessThanOrEqual(1.2);
  });

  test('AC9 着地点 の 丸: とりごや の 中 を ねらう → home が 小屋 id・ok true。外 → home null。固い 所 → ok false・なげる(disabled)。previewRightClick と 実際 が 同じ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const cid = A.coop(30, 20);
      const c = A.cinfo(cid);
      const out: any = { cid };
      const got = A.carryOne(10.5, 20.5, 'chick');
      out.lifted = got.ok;
      // 中を ねらう（中の 西のはしに 立って 東の あき マスを ねらう）
      h.player.set({ position: { x: c.x - 0.5, y: 9, z: c.z + 0.5 }, yaw: 90, pitch: 0 });
      (window as any).__aim.solve(c.x + 1, 8, c.z, 1);
      h.step(1);
      out.inSpot = h.animals.throwSpot();
      out.inHint = A.hintRight();
      // 外
      h.player.set({ position: { x: 10.5, y: 9, z: 20.5 }, yaw: 90, pitch: 0 });
      (window as any).__aim.solve(13, 8, 20, 1);
      h.step(1);
      out.outSpot = h.animals.throwSpot();
      // 固い 所
      h.world.fill(11, 9, 17, 15, 11, 23, 'stone');
      h.step(2);
      h.player.set({ position: { x: 10.5, y: 9, z: 20.5 }, yaw: 90, pitch: 80 });
      h.step(1);
      out.solidSpot = h.animals.throwSpot();
      out.solidHint = A.hintRight();
      h.animals.events();
      A.tap();
      out.solidAfter = { hint: h.animals.lastHint(), carried: A.one(got.id).carried, toss: A.events('toss').length };
      // d < 1
      h.world.fill(11, 9, 17, 15, 11, 23, 'air');
      h.step(2);
      h.player.set({ position: { x: 9.7, y: 9, z: 20.5 }, yaw: 90, pitch: -50 });
      (window as any).__aim.solve(10, 8, 20, 1);
      h.step(1);
      out.nearSpot = h.animals.throwSpot();
      out.nearHint = A.hintRight();
      // だっこ していない とき は null
      h.animals.clear();
      h.step(2);
      out.none = h.animals.throwSpot();
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.inSpot).toMatchObject({ ok: true, home: r.cid, toss: true });
    expect(r.inHint).toMatchObject({ word: 'なげる' });
    expect(r.outSpot).toMatchObject({ ok: true, home: null });
    expect(r.solidSpot).toMatchObject({ ok: false });
    expect(r.solidHint).toMatchObject({ word: 'なげる', disabled: true });
    expect(r.solidAfter.hint, '照準 の 答え と 実際 が 同じ').toBe('cantPutHere');
    expect(r.solidAfter.carried).toBe(true);
    expect(r.solidAfter.toss).toBe(0);
    expect(r.nearSpot).toMatchObject({ toss: false });
    expect(r.nearHint).toMatchObject({ word: 'おろす' });
    expect(r.none, 'だっこ して いない とき は null').toBeNull();
  });
});
