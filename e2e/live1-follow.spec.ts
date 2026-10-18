import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-1 E2E その 2（docs/design/LIVE-1.md §6）: AC10 ついてくる・AC11 ワープ・AC12 重ならない・AC19 保存。
 * 距離・時間は 設定（animalFollow* / animalWarpDist / animalStuckTicks）から 読む。
 */
test.describe('LIVE-1 なかま（ついてくる・ワープ・保存）', () => {
  test('AC10 ついてくる: 近い うちは 歩かない・はなれると ついてきて 止まる・1 段は のぼる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const start = h.settings.get('animalFollowStart');
      const stop = h.settings.get('animalFollowStop');
      const id = h.animals.spawn(6.5, 9, 6.5, { friend: true });
      h.player.set({ position: { x: 6.5 - 1.5, y: 9, z: 6.5 }, yaw: 90, pitch: 0 });
      h.step(30);
      const out: any = { start, stop };
      // 近い（start 未満）あいだ うごいても 歩きださない
      const c0 = A.one(id);
      let moved = 0;
      for (let k = 0; k < 4; k++) {
        const p = h.player.get().position;
        h.player.set({ position: { x: p.x + (start - 1.5 - 0.3) / 4, y: 9, z: p.z } });
        h.step(10);
        out.nearState = A.one(id).state;
        if (A.one(id).state === 'follow') moved++;
      }
      out.nearFollowCount = moved;
      out.nearMove = A.dist(c0, A.one(id));
      // 東へ 12 マス 歩く
      h.player.set({ position: { x: 10.5, y: 9, z: 20.5 }, yaw: 90 });
      h.step(120);
      h.input.press('forward');
      h.step(Math.round((12 / 4.0) * 60));
      h.input.release('forward');
      h.step(2);
      out.walkedTo = h.player.get().position.x;
      h.step(300);
      const c = A.one(id);
      out.dist = A.dist(c, h.player.get().position);
      out.state = c.state;
      out.warps = A.events('warp').length;
      return out;
    });
    expect(r.nearFollowCount, '近い あいだは 歩きださない').toBe(0);
    expect(r.nearMove).toBeLessThanOrEqual(0.2);
    expect(r.dist).toBeLessThanOrEqual(r.stop + 0.05);
    expect(r.state).not.toBe('follow');
  });

  test('AC10b 1 段の 段差の 上へ → のぼって ついてくる（ワープなし）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const stop = h.settings.get('animalFollowStop');
      // x >= 10 は 1 段 高い
      h.world.fill(10, 9, 0, 30, 9, 30, 'stone');
      h.world.fill(10, 10, 0, 30, 20, 30, 'air');
      h.step(2);
      const id = h.animals.spawn(6.5, 9, 6.5, { friend: true });
      h.player.set({ position: { x: 6.5, y: 9, z: 8.5 }, yaw: 90, pitch: 0 });
      h.step(10);
      h.animals.events();
      h.player.set({ position: { x: 16.5, y: 10, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(400);
      const c = A.one(id);
      return { dist: A.dist(c, h.player.get().position), y: c.y, warps: A.events('warp').length, stop };
    });
    expect(r.dist).toBeLessThanOrEqual(r.stop + 0.05);
    expect(r.y).toBeGreaterThanOrEqual(9.9);
    expect(r.warps, '歩いて のぼった').toBe(0);
  });

  test('AC11 ワープ: (1) とおくへ (3) せまい 穴で 待つ (4) 200 マス', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(10);
      const warpD = h.settings.get('animalWarpDist');
      const id = h.animals.spawn(4.5, 9, 6.5, { friend: true });
      h.step(5);
      // 30 マス先（床を しく）
      (window as any).__arena.floor(30, 0, 50, 20);
      h.animals.events();
      h.player.set({ position: { x: 4.5 + warpD + 14, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(60);
      const w = A.events('warp');
      const c = A.one(id);
      const p = h.player.get().position;
      const out: any = { warpCount: w.length, d: A.dist(c, p), dy: c.y - p.y, below: h.world.getBlock(Math.floor(c.x), Math.floor(c.y) - 1, Math.floor(c.z)) };
      // (4) 200 マス
      (window as any).__arena.floor(200, 0, 220, 20);
      h.player.set({ position: { x: 210.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(120);
      out.far = !!A.one(id);
      out.farDist = A.dist(A.one(id), h.player.get().position);
      return out;
    });
    expect(r.warpCount).toBeGreaterThanOrEqual(1);
    expect(r.d).toBeGreaterThanOrEqual(2 - 0.2);
    expect(r.d).toBeLessThanOrEqual(3 + 0.2);
    expect(Math.abs(r.dy)).toBeLessThanOrEqual(1.01);
    expect(r.below).not.toBe('air');
    expect(r.far, '200 マスでも 消えない').toBe(true);
    expect(r.farDist).toBeLessThanOrEqual(4);
  });

  test('AC11b 2 段の かべの 上 8 マス先 → 近づけない ので stuck ワープ（120〜240 ステップ）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const stuck = h.settings.get('animalStuckTicks');
      // 長い かべ（2 段、z 全体）。なかま は x=4 側、プレイヤー は かべの 向こう 8 マス先 の 上
      h.world.fill(10, 9, 0, 11, 10, 30, 'stone');
      h.world.fill(12, 9, 0, 30, 9, 30, 'stone');
      h.world.fill(10, 11, 0, 30, 20, 30, 'air');
      h.step(2);
      h.animals.spawn(8.5, 9, 6.5, { friend: true });
      h.player.set({ position: { x: 8.5 + 4, y: 11, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(1);
      // プレイヤー を 12 マス先に 立たせて（かべ の 向こう）、なかま が 近づけない
      h.player.set({ position: { x: 16.5, y: 10, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.animals.events();
      let t = -1;
      for (let i = 0; i < stuck * 3 && t < 0; i++) {
        h.step(1);
        if (A.events('warp').length > 0) t = i + 1;
      }
      return { t, stuck };
    });
    expect(r.t, 'warp が 起きた').toBeGreaterThan(0);
    expect(r.t).toBeGreaterThanOrEqual(r.stuck - 20);
    expect(r.t).toBeLessThanOrEqual(r.stuck * 2);
  });

  test('AC11c 固い 穴の 中: warp なし・消えない・外に 出ると 60 ステップ以内に warp', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      const id = h.animals.spawn(4.5, 9, 6.5, { friend: true });
      // 立つ 所(40.5, 9, 40.5) の まわり 1 マス ぜんぶ 固い、上も ふさぐ
      (window as any).__arena.floor(30, 30, 50, 50);
      h.world.fill(35, 9, 35, 45, 13, 45, 'stone');
      h.world.fill(40, 9, 40, 40, 11, 40, 'air');
      h.step(2);
      h.player.set({ position: { x: 40.5, y: 9, z: 40.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.animals.events();
      h.step(150);
      const out: any = { warpsIn: A.events('warp').length, exists: !!A.one(id) };
      // 外へ
      h.world.fill(35, 9, 35, 45, 13, 45, 'air');
      h.step(2);
      h.step(60);
      out.warpsOut = A.events('warp').length;
      return out;
    });
    expect(r.warpsIn).toBe(0);
    expect(r.exists).toBe(true);
    expect(r.warpsOut).toBeGreaterThanOrEqual(1);
  });

  test('AC12 重ならない: なかま 8 わ・600 ステップ → どの 2 わも 0.5 以上・ぜんぶ 近く', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const max = h.settings.get('animalFriendMax');
      for (let i = 0; i < max; i++) h.animals.spawn(3 + i * 0.1, 9, 6.5 + i * 0.1, { friend: true });
      h.player.set({ position: { x: 3, y: 9, z: 6.5 }, yaw: 90 });
      h.step(10);
      h.input.press('forward');
      h.step(240);
      h.input.release('forward');
      h.step(600);
      const l = h.animals.list().filter((a: any) => a.friend);
      const p = h.player.get().position;
      let min = 99;
      for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) min = Math.min(min, A.dist(l[i], l[j]));
      return { n: l.length, max, min, far: Math.max(...l.map((a: any) => A.dist(a, p))) };
    });
    expect(r.n).toBe(r.max);
    expect(r.min).toBeGreaterThanOrEqual(0.5 - 0.01);
    expect(r.far).toBeLessThanOrEqual(5);
  });

  test('AC19 保存: なかま 3 わ（eggDay 3・5・null）は 戻り、やせいは いなくなる。うまった 場所は warp', async ({ page }) => {
    await openAnimals(page, '?');
    const before = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(24);
      for (let i = 0; i < 5; i++) A.nextDay(); // 今日 >= 5（eggDay が 今日より 先 だと 今日に される ため）
      h.time.set(12000);
      h.step(2);
      h.animals.spawn(3.5, 9, 6.5, { friend: true, eggDay: 3 });
      h.animals.spawn(4.5, 9, 7.5, { friend: true, eggDay: 5 });
      h.animals.spawn(4.5, 9, 5.5, { friend: true, eggDay: null });
      h.player.set({ position: { x: 3.5, y: 9, z: 6.5 }, yaw: 90 });
      h.animals.spawn(12.5, 9, 12.5, { hearts: 1 });
      h.animals.spawn(14.5, 9, 12.5, { hearts: 2 });
      h.step(10);
      const before = h.animals.list().filter((a: any) => a.friend).map((a: any) => ({ x: a.x, y: a.y, z: a.z, yaw: a.yaw, eggDay: a.eggDay }));
      await h.save.now();
      return before;
    });
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      h.settings.set('animalAutoSpawn', false);
      await h.world.settle({ full: true });
    });
    const after = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return h.animals.list();
    });
    // 読み直しの あとは warp などで 位置が 少し 動く ので、ぜんぶの 数・eggDay・やせい 0 を 見る
    expect(after.filter((a: any) => a.friend)).toHaveLength(3);
    expect(after.filter((a: any) => !a.friend)).toHaveLength(0);
    expect(after.filter((a: any) => a.friend).map((a: any) => a.eggDay).sort()).toEqual([3, 5, null].sort());
    for (const b of before) {
      const m = after.find((a: any) => a.friend && a.eggDay === b.eggDay);
      expect(m, `eggDay ${b.eggDay}`).toBeTruthy();
      for (const k of ['x', 'y', 'z', 'yaw']) expect(Math.abs(m[k] - b[k]), k).toBeLessThanOrEqual(0.01);
    }
  });
});
