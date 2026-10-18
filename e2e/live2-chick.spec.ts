import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2 E2E その 2（docs/design/LIVE-2.md 版 3 §6）: ひよこ と 大人に なる。
 * AC5 ひよこ（当たり・ねらう 箱・むし・だっこ・小屋の 外では そだたない）/ AC6 ひよこの パタパタ /
 * AC11 大人に なる（通し）。
 * 小屋は `animals.placeCoop` で 置き、中の 子は `animals.spawn` の `home` で 作る。ねらいは `animals.target()` に 聞く。
 */
test.describe('LIVE-2 ひよこ・大人に なる', () => {
  test.describe.configure({ timeout: 150_000 });

  test('AC5 ひよこ: 体の 当たり 高さ 0.35・はば 0.3（±0.05）。ねらう 箱は 横 0.7×0.7・高さ 0.6（0.33 横で 当たり・0.4 横で 当たらない）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const out: any = {};
      const id = A.friend(4.5, 6.5, { stage: 'chick', breed: 'normal' });
      out.row = A.one(id);
      out.stage = out.row.stage;
      out.aimed = A.aim(id); // 真ん中を ねらう
      // ねらいの 線は そのままに、ひよこ だけ 横へ ずらす
      const probe = (dz: number) => {
        h.animals.clear();
        const c = h.animals.spawn(4.5, 9, 6.5 + dz, { friend: true, follow: A.full(), stage: 'chick' });
        h.step(1);
        return h.animals.target() === c;
      };
      out.hit033 = probe(0.33);
      out.hitM033 = probe(-0.33);
      out.hit040 = probe(0.4);
      out.hitM040 = probe(-0.4);
      return out;
    });
    expect(r.stage).toBe('chick');
    expect(r.row.size.h).toBeGreaterThan(0.3);
    expect(r.row.size.h).toBeLessThan(0.4);
    expect(r.row.size.w).toBeGreaterThan(0.25);
    expect(r.row.size.w).toBeLessThan(0.35);
    expect(r.aimed).toBe(true);
    expect(r.hit033, '0.33 横').toBe(true);
    expect(r.hitM033).toBe(true);
    expect(r.hit040, '0.4 横').toBe(false);
    expect(r.hitM040).toBe(false);
  });

  test('AC5b ひよこ: むし → fullLeft 600・follow まんたん・egg は animalEggChance 1 でも 出ない。ながおし 40 で だっこ。小屋の 外で あさ 3 回 → grow 0・chick', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      h.settings.set('animalEggChance', 1);
      const id = A.friend(4.5, 6.5, { stage: 'chick', follow: 100 });
      A.hold('mushi', 3);
      A.stand(id);
      h.animals.events();
      A.tap();
      h.step(70);
      const out: any = { mushi: h.inventory.count('mushi'), full: A.one(id).fullLeft, follow: A.one(id).follow, fullTicks: h.settings.get('animalFullTicks') };
      h.step(700);
      out.egg = A.events('egg').length;
      out.drops = A.bags('egg').length + A.bags('kin_tamago').length;
      // だっこ
      h.inventory.clear();
      A.stand(id);
      out.lift = A.lift(id);
      h.animals.clear();
      // 小屋の 外で あさ 3 回
      const o = A.friend(8.5, 12.5, { stage: 'chick' });
      h.player.set({ position: { x: 8.5, y: 9, z: 10.5 } });
      for (let i = 0; i < 3; i++) A.nextDay();
      out.grow = A.one(o).grow;
      out.stageAfter = A.one(o).stage;
      return out;
    });
    expect(r.mushi).toBe(2);
    expect(r.follow, 'ついてくる 時間 まんたん').toBeGreaterThan(100);
    expect(r.egg, 'ひよこは たまごを うまない').toBe(0);
    expect(r.drops).toBe(0);
    expect(r.lift).toBe(true);
    expect(r.grow).toBe(0);
    expect(r.stageAfter).toBe('chick');
  });

  test('AC6 ひよこの パタパタ: 10 マス上で おろす → 下向き 2.5 以下・着地まで 228 ステップ以上・着地で roll', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const speed = h.settings.get('chickFlutterFallSpeed');
      const id = h.animals.spawn(4.5, 19, 6.5, { friend: true, follow: 0, stage: 'chick' });
      h.animals.events();
      let maxFall = 0;
      let steps = 0;
      let landed = -1;
      let flutter = false;
      for (let i = 1; i <= 600 && landed < 0; i++) {
        h.step(1);
        const c = A.one(id);
        maxFall = Math.max(maxFall, -c.vy);
        if (c.fluttering) flutter = true;
        if (c.y <= 9.05) landed = i;
      }
      steps = landed;
      h.step(20);
      return { speed, maxFall, steps, flutter, roll: A.events('roll').length };
    });
    expect(r.speed).toBe(2.5);
    expect(r.flutter).toBe(true);
    expect(r.maxFall).toBeLessThanOrEqual(r.speed + 0.05);
    expect(r.steps).toBeGreaterThanOrEqual(228);
    expect(r.roll, '着地で コロン').toBeGreaterThanOrEqual(1);
  });

  test('AC11 大人に なる（通し）: 小屋の ひよこ・5 マス・あさ 1 回 → grow 1・chick。2 回目で 60 以内 growStart・60 後 adult・raised・grow(first)・紙ふぶき・growFirst・animal.grow.1', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const cid = A.coop(14, 14);
      const c = A.cinfo(cid);
      const id = A.kid(c, { stage: 'chick', breed: 'normal' });
      h.player.set({ position: { x: c.x + 0.5 - 6, y: 9, z: c.z + 0.5 + 0 }, yaw: 90, pitch: 0 });
      h.step(5);
      const out: any = { cid, days: h.settings.get('chickGrowDays'), home: A.one(id)?.home };
      A.nextDay();
      out.grow1 = { grow: A.one(id).grow, stage: A.one(id).stage };
      h.animals.events();
      h.animals.fxReset();
      h.audio.sfx();
      // あさ 2 回目
      const len = A.dayLen();
      h.time.set(len - 1);
      let startAt = -1;
      let doneAt = -1;
      let first: any = null;
      let confetti = 0;
      for (let i = 1; i <= 400 && doneAt < 0; i++) {
        h.step(1);
        confetti = Math.max(confetti, h.animals.fx().confetti);
        for (const e of h.animals.events()) {
          if (e.type === 'growStart' && startAt < 0) startAt = i;
          if (e.type === 'grow') {
            doneAt = i;
            first = e;
          }
        }
      }
      out.startAt = startAt;
      out.doneAt = doneAt;
      out.first = first;
      out.row = A.one(id);
      out.confetti = confetti;
      out.sfx = A.sfx();
      out.unlock = A.unlocked('animal.grow.1');
      out.stat = A.stat('grow:*');
      return out;
    });
    expect(r.days).toBe(2);
    expect(r.grow1).toEqual({ grow: 1, stage: 'chick' });
    expect(r.startAt).toBeGreaterThan(0);
    expect(r.startAt).toBeLessThanOrEqual(61);
    expect(r.doneAt - r.startAt).toBeGreaterThanOrEqual(58);
    expect(r.doneAt - r.startAt).toBeLessThanOrEqual(62);
    expect(r.row).toMatchObject({ stage: 'adult', raised: true });
    expect(r.first).toMatchObject({ first: true });
    expect(r.confetti).toBeGreaterThan(0);
    expect(r.sfx).toContain('growFirst');
    expect(r.unlock).toBe(true);
    expect(r.stat).toBe(1);
  });

  test('AC11b 2 わ目は 紙ふぶき 0・音 grow。30 マスでは あさ 2 回目でも chick・16 以内に 来ると 60 以内に growStart', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(48);
      const dist = h.settings.get('kitHatchDist');
      const cid = A.coop(14, 14);
      const c = A.cinfo(cid);
      const out: any = { dist };
      // はじめて を すませる: 1 わ目 を 大人に
      const a = A.kid(c, { stage: 'chick', grow: 1, raised: false });
      h.player.set({ position: { x: c.x + 0.5 - 6, y: 9, z: c.z + 0.5 }, yaw: 90 });
      h.step(5);
      A.nextDay();
      h.step(150);
      out.aStage = A.one(a).stage;
      // 2 わ目
      const b = A.kid(c, { stage: 'chick', grow: 1 }, 1, 1);
      h.animals.events();
      h.animals.fxReset();
      h.audio.sfx();
      A.nextDay();
      h.step(150);
      out.bStage = A.one(b).stage;
      out.confetti = h.animals.fx().confetti;
      out.sfx = A.sfx();
      out.grow = A.events('grow');
      // 遠く
      h.animals.clear();
      const f = A.kid(c, { stage: 'chick', grow: 1 });
      h.player.set({ position: { x: c.x + 0.5 + 30, y: 9, z: c.z + 0.5 }, yaw: 270 });
      h.step(5);
      A.nextDay();
      h.step(200);
      out.farStage = A.one(f).stage;
      h.animals.events();
      h.player.set({ position: { x: c.x + 0.5 + (dist - 1), y: 9, z: c.z + 0.5 }, yaw: 270 });
      let near = -1;
      for (let i = 1; i <= 70 && near < 0; i++) {
        h.step(1);
        if (A.events('growStart').length) near = i;
      }
      out.near = near;
      return out;
    });
    expect(r.aStage).toBe('adult');
    expect(r.bStage).toBe('adult');
    expect(r.confetti, '2 わ目は 紙ふぶき 0').toBe(0);
    expect(r.sfx).toContain('grow');
    expect(r.sfx).not.toContain('growFirst');
    expect(r.farStage).toBe('chick');
    expect(r.near).toBeGreaterThan(0);
    expect(r.near).toBeLessThanOrEqual(60);
  });
});
