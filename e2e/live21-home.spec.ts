import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2.1 E2E その 3（docs/design/LIVE-2.1.md 版 1.1 §2.3・§6）: とりごや の 子 に なる しゅんかん・出ない・ワープ しない。
 * AC7 小屋 の 子 は 出ない / AC8 すぐ 小屋 の 子 / AC18 小屋 の 子 は ワープ しない（通し）。
 * 距離・時間は 設定（coopEnterTicks・animalWarpDist・animalStuckTicks）と 窓口（list / events / fx / coops）に 聞く。
 */
test.describe('LIVE-2.1 とりごや の 子', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC7 小屋 の 子 は 出ない: 子 3 わ（ひよこ・大人・マッチョ）・もん の 出入り 10 回・小屋 の 外 で 3,600 ステップ・夜 1 回・保存→読み直し の あとも どの ステップ でも 中 3×3 の 中・home が かわらない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const cx = c.x + 0.5;
      const cz = c.z + 0.5;
      let ids = [
        A.kid(c, { stage: 'chick' }, -1, 0),
        A.kid(c, { stage: 'adult' }, 1, 0),
        A.kid(c, { stage: 'adult', breed: 'macho' }, 0, 1),
      ];
      const out: any = { cid, outStep: -1, homeChanged: -1, missing: -1, n: 0 };
      const check = (tag: string) => {
        out.n++;
        const rows = h.animals.list();
        for (const id of ids) {
          const a = rows.find((q: any) => q.id === id);
          if (!a) { if (out.missing < 0) out.missing = out.n; out.missingTag = tag; continue; }
          if (!A.inside(c, a) && out.outStep < 0) { out.outStep = out.n; out.outTag = tag; out.outAt = { x: a.x, z: a.z }; }
          if (a.home !== cid && out.homeChanged < 0) { out.homeChanged = out.n; out.homeTag = tag; }
        }
      };
      const run = (n: number, tag: string) => { for (let i = 0; i < n; i++) { h.step(1); check(tag); } };
      // もん の 出入り 10 回
      for (let t = 0; t < 10; t++) {
        h.player.set({ position: { x: cx + f.fx * 4, y: 9, z: cz + f.fz * 4 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(-f.fx, -f.fz), pitch: 0 });
        h.input.press('moveForward');
        run(70, 'in');
        h.input.release('moveForward');
        h.player.set({ position: { x: cx + f.fx * 6, y: 9, z: cz + f.fz * 6 }, velocity: { x: 0, y: 0, z: 0 } });
        run(20, 'out');
      }
      // 小屋 の 外 で 3,600 ステップ
      h.player.set({ position: { x: cx + f.fx * 9, y: 9, z: cz + f.fz * 9 }, velocity: { x: 0, y: 0, z: 0 } });
      run(3600, 'away');
      // 夜
      A.night();
      run(300, 'night');
      // 保存 → 読み直し
      const data = JSON.parse(JSON.stringify(h.animals.serialize()));
      h.animals.deserialize(data);
      // 読み直すと id が かわる ことが ある ので、小屋 の 子 を 読み直す
      ids = h.animals.list().filter((q: any) => q.home === cid).map((q: any) => q.id);
      out.afterLoad = ids.length;
      run(300, 'reload');
      out.kids = A.cinfo(cid).kids.length;
      return out;
    });
    expect(r.missing, `3 わ とも いる（${r.missingTag}）`).toBe(-1);
    expect(r.outStep, `どの ステップ でも 中 3×3（${r.outTag} ${JSON.stringify(r.outAt)}）`).toBe(-1);
    expect(r.homeChanged, `home が かわらない（${r.homeTag}）`).toBe(-1);
    expect(r.afterLoad, '読み直しても 3 わ とも 小屋 の 子').toBe(3);
    expect(r.kids).toBe(3);
  });

  test('AC8 すぐ 小屋 の 子: ついてくる なかま が 中 3×3 に 入った ステップ に home ＝ 小屋 id・出来事 home・大きな しるし homePop。そのあと 外 に 出て 600 ステップ → 中。marks の うまり home は 出ない。6 わ の 小屋 → home null・ついてくる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = { enter: h.settings.get('coopEnterTicks') };
      const cid = A.coop(20, 20);
      out.cid = cid;
      const c = A.cinfo(cid);
      const f = A.face(c);
      const cx = c.x + 0.5;
      const cz = c.z + 0.5;
      h.player.set({ position: { x: cx + f.fx * 5, y: 9, z: cz + f.fz * 5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(-f.fx, -f.fz), pitch: 0 });
      const id = A.friend(cx + f.fx * 6.5, cz + f.fz * 6.5);
      h.step(20);
      h.animals.events();
      h.animals.fxReset();
      h.input.press('moveForward');
      let inAt = -1;
      let homeAtEnter: any = null;
      let homeEvAtEnter = false;
      let popAtEnter = 0;
      let marksHome = false;
      for (let i = 1; i <= 400 && inAt < 0; i++) {
        h.step(1);
        const evs = h.animals.events();
        const a = A.one(id);
        if (h.animals.fx().marks.some((m: any) => m.home > 0)) marksHome = true;
        if (A.inside(c, a)) {
          inAt = i;
          homeAtEnter = a.home ?? null;
          homeEvAtEnter = evs.some((e: any) => e.type === 'home' && e.id === id) || A.events('home').length > 0;
          popAtEnter = h.animals.fx().homePop;
        }
      }
      h.input.release('moveForward');
      out.inAt = inAt;
      out.homeAtEnter = homeAtEnter;
      out.homeEvAtEnter = homeEvAtEnter;
      out.popAtEnter = popAtEnter;
      // すぐ あと プレイヤー が 外 に 出て 600 ステップ
      h.player.set({ position: { x: cx + f.fx * 9, y: 9, z: cz + f.fz * 9 }, velocity: { x: 0, y: 0, z: 0 } });
      let outside = 0;
      let popAfter40 = -1;
      for (let i = 1; i <= 600; i++) {
        h.step(1);
        const a = A.one(id);
        if (!a || !A.inside(c, a)) outside++;
        if (h.animals.fx().marks.some((m: any) => m.home > 0)) marksHome = true;
        if (i === 42) popAfter40 = h.animals.fx().homePop;
      }
      out.outside = outside;
      out.popAfter40 = popAfter40;
      out.marksHome = marksHome;
      out.row = A.one(id) ? { home: A.one(id).home ?? null } : null;
      // 6 わ の 小屋 に ついて 入る
      h.animals.clear();
      for (let i = 0; i < 6; i++) A.kid(A.cinfo(cid), { stage: 'adult' }, (i % 3) - 1, Math.floor(i / 3) - 1);
      h.player.set({ position: { x: cx + f.fx * 5, y: 9, z: cz + f.fz * 5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(-f.fx, -f.fz), pitch: 0 });
      const g = A.friend(cx + f.fx * 6.5, cz + f.fz * 6.5);
      h.step(20);
      h.animals.events();
      h.input.press('moveForward');
      h.step(150);
      h.input.release('moveForward');
      h.step(120);
      const gr = A.one(g);
      out.sixth = { home: gr?.home ?? null, follow: gr?.follow ?? 0, friend: gr?.friend ?? null, homeEv: A.events('home').length, kids: A.cinfo(cid).kids.length };
      return out;
    });
    expect(r.enter, '歩いて 入って 小屋 の 子 に なる まで は 0').toBe(0);
    expect(r.inAt, '中 3×3 に 入った').toBeGreaterThan(0);
    expect(r.homeAtEnter, '入った ステップ に home ＝ 小屋 id').toBe(r.cid);
    expect(r.homeEvAtEnter, '出来事 home').toBe(true);
    expect(r.popAtEnter, '大きな しるし homePop が 1').toBeGreaterThanOrEqual(0.95);
    expect(r.popAfter40, '40 ステップ で 0').toBe(0);
    expect(r.outside, '600 ステップ ずっと 中').toBe(0);
    expect(r.marksHome, 'いえ の しるし の うまり（marks の home）は 出ない').toBe(false);
    expect(r.row?.home).not.toBeNull();
    expect(r.sixth.kids).toBe(6);
    expect(r.sixth.home, '6 わ の 小屋 では 小屋 の 子 に ならない').toBeNull();
    expect(r.sixth.friend).toBe(true);
    expect(r.sixth.follow, 'ついてくる まま').toBeGreaterThan(0);
    expect(r.sixth.homeEv).toBe(0);
  });

  test('AC18 小屋 の 子 は ワープ しない（通し）: 入った ステップ に home・home 出来事 → プレイヤー を animalWarpDist の 2 倍 より とおく へ うつし 3,600 ステップ → どの ステップ も 中 3×3・warp 0。対: 小屋 の 外 の なかま は うつすと warp 1 回', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(90);
      const warpD = h.settings.get('animalWarpDist');
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const cx = c.x + 0.5;
      const cz = c.z + 0.5;
      const out: any = { warpD };
      h.player.set({ position: { x: cx + f.fx * 5, y: 9, z: cz + f.fz * 5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(-f.fx, -f.fz), pitch: 0 });
      const id = A.friend(cx + f.fx * 6.5, cz + f.fz * 6.5);
      h.step(20);
      h.animals.events();
      h.input.press('moveForward');
      let inAt = -1;
      let sawHome = false;
      for (let i = 1; i <= 400 && inAt < 0; i++) {
        h.step(1);
        if (A.events('home').length) sawHome = true;
        const a = A.one(id);
        if (A.inside(c, a)) { inAt = i; out.homeAtEnter = a.home ?? null; }
      }
      h.input.release('moveForward');
      out.inAt = inAt;
      out.sawHome = sawHome;
      // 5 ステップ いない に とおくへ（水平 animalWarpDist の 2 倍より 遠い）
      h.step(3);
      const far = Math.max(40, warpD * 2 + 6);
      h.player.set({ position: { x: cx + far, y: 9, z: cz }, velocity: { x: 0, y: 0, z: 0 } });
      h.animals.events();
      let outStep = -1;
      let missing = -1;
      let warps = 0;
      let homeChanged = -1;
      for (let i = 1; i <= 3600; i++) {
        h.step(1);
        const a = A.one(id);
        if (!a) { if (missing < 0) missing = i; continue; }
        if (!A.inside(c, a) && outStep < 0) outStep = i;
        if (a.home !== cid && homeChanged < 0) homeChanged = i;
        if (i % 60 === 0) warps += A.events('warp').length;
      }
      warps += A.events('warp').length;
      out.outStep = outStep;
      out.missing = missing;
      out.warps = warps;
      out.homeChanged = homeChanged;
      out.list = A.one(id) ? { x: A.one(id).x, z: A.one(id).z, home: A.one(id).home ?? null } : null;
      out.cid = cid;
      // 対: 小屋 の 外 の なかま
      h.animals.clear();
      h.player.set({ position: { x: 6.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } });
      const w = A.friend(8.5, 6.5);
      h.step(10);
      h.animals.events();
      h.player.set({ position: { x: 6.5 + far, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(300);
      out.controlWarps = A.events('warp').length;
      out.controlRow = A.one(w) ? { near: Math.hypot(A.one(w).x - h.player.get().position.x, A.one(w).z - h.player.get().position.z) } : null;
      return out;
    });
    expect(r.inAt).toBeGreaterThan(0);
    expect(r.homeAtEnter, '入った ステップ に home').toBe(r.cid);
    expect(r.sawHome, '出来事 home').toBe(true);
    expect(r.missing, '消えない').toBe(-1);
    expect(r.outStep, 'どの ステップ も 体 の まん中 が 中 3×3').toBe(-1);
    expect(r.warps, '出来事 warp 0').toBe(0);
    expect(r.homeChanged).toBe(-1);
    expect(r.list.home).toBe(r.cid);
    expect(r.controlWarps, '小屋 の 外 の なかま は うつすと warp 1 回').toBe(1);
    expect(r.controlRow?.near, 'そばに ワープ した').toBeLessThanOrEqual(4);
  });

  test('AC18b プレイヤー が つまった 扱い（かべ の 向こう で 近づけない）でも 小屋 の 子 は ワープ しない。対: 同じ 状態 で 外 の なかま は stuck で warp する', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const stuck = h.settings.get('animalStuckTicks');
      const warpD = h.settings.get('animalWarpDist');
      const cid = A.coop(5, 10);
      const c = A.cinfo(cid);
      const out: any = { stuck, warpD, cid };
      // 長い かべ（高さ 2・x 10..11）と、その 向こう の 高い 床（y 9）。LIVE-1 AC11b と 同じ 形
      h.world.fill(10, 9, 0, 11, 10, 30, 'stone');
      h.world.fill(12, 9, 0, 30, 9, 30, 'stone');
      h.world.fill(10, 11, 0, 30, 20, 30, 'air');
      h.step(2);
      const kid = A.kid(c, { stage: 'chick', follow: A.full() });
      const ctl = A.friend(8.5, 6.5); // かべ の 手前（小屋 の 外）。向こう へ は 行けない
      h.player.set({ position: { x: 16.5, y: 10, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(1);
      const p = h.player.get().position;
      // 距離 だけ では warp しない 近さ（animalWarpDist 以内）で、近づけない = stuck だけ が 理由
      out.kidDist = Math.hypot(A.one(kid).x - p.x, A.one(kid).z - p.z);
      out.ctlDist = Math.hypot(A.one(ctl).x - p.x, A.one(ctl).z - p.z);
      h.animals.events();
      let outStep = -1;
      let kidWarps = 0;
      let ctlWarps = 0;
      let ctlFirst = -1;
      for (let i = 1; i <= 3600; i++) {
        h.step(1);
        const a = A.one(kid);
        if (!a || (!A.inside(c, a) && outStep < 0)) outStep = i;
        for (const e of h.animals.events()) {
          if (e.type === 'warp' && e.id === kid) kidWarps++;
          if (e.type === 'warp' && e.id === ctl) { ctlWarps++; if (ctlFirst < 0) ctlFirst = i; }
        }
      }
      out.outStep = outStep;
      out.kidWarps = kidWarps;
      out.ctlWarps = ctlWarps;
      out.ctlFirst = ctlFirst;
      return out;
    });
    expect(r.kidDist, 'stuck だけ が 理由 に なる 近さ').toBeLessThan(r.warpD);
    expect(r.ctlDist).toBeLessThan(r.warpD);
    expect(r.ctlWarps, '対: 外 の なかま は stuck で warp する').toBeGreaterThanOrEqual(1);
    expect(r.ctlFirst, 'animalStuckTicks ごろ').toBeGreaterThanOrEqual(r.stuck - 20);
    expect(r.ctlFirst).toBeLessThanOrEqual(r.stuck * 2);
    expect(r.kidWarps, '小屋 の 子 は warp しない').toBe(0);
    expect(r.outStep, '3,600 ステップ たっても 中 3×3').toBe(-1);
  });
});
