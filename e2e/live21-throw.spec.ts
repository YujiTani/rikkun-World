import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2.1 E2E その 2（docs/design/LIVE-2.1.md 版 1.1 §2.2・§6）: だっこ から なげる。
 * AC4 なげる（通し） / AC5 なげる きょり / AC6 当たる / AC9 着地点 の 丸（`animals.throwSpot()`）。
 * 窓口（仕様 §6.2 の 名前）: `animals.throwSpot()`・`animals.throwTo(x, y, z)`・`animals.events()` の `toss`／`bonk`・`list()` の `state: 'thrown'`。
 * #311: なげる 通し・きょり・当たる・さく の 上 などの 数は ユニット（src/animals/live21.test.ts）へ うつした。ここは 本物 の 照準 → 右クリック → なげる の つなぎ（AC5・AC9）だけ。
 * 時間は 「ステップ」で 数える（#255）。とびかたの 数（もちあげ 10・20＋5d・さく の 上 ＋2.0・おりる 速さ）は 設定と 窓口に 聞いて くらべる。
 * 照準で さく ごしに ねらえる か は 画面の 高さに よる ので AC17（オーナー確認）。ここは 窓口の `throwTo` で とびかたを 見る。
 */
test.describe('LIVE-2.1 なげる', () => {
  test.describe.configure({ timeout: 150_000 });

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
