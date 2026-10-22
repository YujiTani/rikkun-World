import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2 E2E その 4（docs/design/LIVE-2.md 版 3 §6）: 金の たまご・保存・文字・性能。
 * AC16 金の たまご（通し）/ AC21 保存 / AC25 文字（DOM）/ AC27 性能。
 * 保存の 仮の 窓口: `animals.serialize()` / `animals.deserialize(data)`（LIVE-2 の 保存 v 3 の 形 §4.4）。
 */
test.describe('LIVE-2 金の たまご・保存・文字・性能', () => {
  test.describe.configure({ timeout: 150_000 });

  test('AC16 金の たまご（通し）: goldBaseWild 1 と goldCap 1 → 60 ステップ目に おとしもの kin_tamago(epic)・egg(gold true)・紙ふぶき・goldenEgg・goldenEgg:* 1・animal.goldenEgg.1。持って 右クリックで たべない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('animalEggChance', 1);
      h.settings.set('goldBaseWild', 1);
      h.settings.set('goldCap', 1);
      const delay = h.settings.get('animalEggDelay');
      const id = A.friend(4.5, 6.5);
      A.hold('mushi', 3);
      A.aim(id);
      h.animals.events();
      h.animals.fxReset();
      h.audio.sfx();
      h.input.press('secondary');
      h.step(5);
      h.input.release('secondary');
      let at = -1;
      let ev: any = null;
      let confetti = 0;
      for (let i = 1; i <= delay + 10 && at < 0; i++) {
        h.step(1);
        confetti = Math.max(confetti, h.animals.fx().confetti);
        const e = A.events('egg');
        if (e.length) {
          at = i;
          ev = e[0];
        }
      }
      const out: any = { delay, at, ev, confetti };
      h.step(5);
      out.bags = A.bags('kin_tamago').map((b: any) => ({ rarity: b.rarity, item: b.slots[0].item }));
      out.plainEgg = A.bags('egg').length;
      out.sfx = A.sfx();
      out.stat = A.stat('goldenEgg:*');
      out.unlock = A.unlocked('animal.goldenEgg.1');
      out.rarity = h.rarity.of('kin_tamago');
      // たべない
      h.inventory.add('kin_tamago', 1);
      (window as any).__aim.standForS(2.5, 6.5, 270, 30, 9);
      h.combat.setHp(10);
      A.hold('kin_tamago', 1);
      A.tap();
      out.keep = h.inventory.count('kin_tamago');
      out.hp = h.combat.get().hp;
      return out;
    });
    expect(r.at, '60 ステップ目').toBeGreaterThanOrEqual(r.delay - 2);
    expect(r.at).toBeLessThanOrEqual(r.delay + 2);
    expect(r.ev).toMatchObject({ gold: true });
    expect(r.confetti).toBeGreaterThan(0);
    expect(r.bags).toEqual([{ rarity: 'epic', item: 'kin_tamago' }]);
    expect(r.plainEgg).toBe(0);
    expect(r.sfx).toContain('goldenEgg');
    expect(r.stat).toBe(1);
    expect(r.unlock).toBe(true);
    expect(r.rarity).toMatchObject({ id: 'epic', stars: 5 });
    expect(r.keep, 'たべない').toBe(1);
    expect(r.hp).toBe(10);
  });

  test('AC16b 毎回 大きく: 金の たまごを 2 回 うむ → 2 回とも 紙ふぶき', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('animalEggChance', 1);
      h.settings.set('goldBaseWild', 1);
      h.settings.set('goldCap', 1);
      const delay = h.settings.get('animalEggDelay');
      const id = A.friend(4.5, 6.5);
      A.hold('mushi', 5);
      const out: number[] = [];
      for (let n = 0; n < 2; n++) {
        A.stand(id);
        h.animals.fxReset();
        A.tap();
        let c = 0;
        for (let i = 0; i < delay + 10; i++) {
          h.step(1);
          c = Math.max(c, h.animals.fx().confetti);
        }
        out.push(c);
        h.step(A.full() > 0 ? h.settings.get('animalFullTicks') + 40 : 0);
      }
      return out;
    });
    expect(r[0]).toBeGreaterThan(0);
    expect(r[1]).toBeGreaterThan(0);
  });

  test('AC21 保存: 小屋 2・こたつ 3・なかま 2・machoMiss 7 を 保存 → 読み直すと 同じ（kits は 2 行・位置 0.01 以内）', async ({ page }) => {
    await openAnimals(page, '?');
    const before = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      const c1 = A.cinfo(A.coop(14, 14));
      A.cinfo(A.coop(34, 14));
      A.kid(c1, { stage: 'chick', grow: 1, bugs: 5 });
      A.kid(c1, { stage: 'adult', breed: 'macho', raised: true }, 1, 0);
      A.kid(c1, { stage: 'adult', raised: true, bugs: 40, goldMiss: 12 }, -1, 0);
      A.friend(24.5, 30.5, { stage: 'chick' });
      A.friend(26.5, 30.5, { stage: 'adult', breed: 'macho' });
      h.settings.set('kitHatchTicks', 4000);
      const k1 = A.kit(8, 40);
      A.putEgg(k1, 'egg', 1);
      const k2 = A.kit(8, 44);
      A.putEgg(k2, 'kin_tamago', 1);
      A.kit(8, 48); // から
      h.animals.machoMiss(7);
      h.step(1000);
      const ser = JSON.stringify(h.animals.serialize());
      const snap = {
        list: h.animals.list().map((a: any) => ({ x: a.x, y: a.y, z: a.z, stage: a.stage, breed: a.breed, home: a.home ?? null, raised: a.raised, bugs: a.bugs, goldMiss: a.goldMiss, grow: a.grow })),
        kits: h.animals.kits().map((k: any) => ({ x: k.x, z: k.z, egg: k.egg, left: k.left })),
        coops: h.animals.coops().map((c: any) => ({ id: c.id, x: c.x, z: c.z, dir: c.dir, kids: c.kids.length, nest: c.nest })),
        miss: h.animals.machoMiss(),
        len: ser.length,
      };
      await h.save.now();
      return snap;
    });
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const after = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      h.settings.set('animalAutoSpawn', false);
      await h.world.settle({ full: true });
      return {
        list: h.animals.list().map((a: any) => ({ x: a.x, y: a.y, z: a.z, stage: a.stage, breed: a.breed, home: a.home ?? null, raised: a.raised, bugs: a.bugs, goldMiss: a.goldMiss, grow: a.grow })),
        kits: h.animals.kits().map((k: any) => ({ x: k.x, z: k.z, egg: k.egg, left: k.left })),
        coops: h.animals.coops().map((c: any) => ({ id: c.id, x: c.x, z: c.z, dir: c.dir, kids: c.kids.length, nest: c.nest })),
        miss: h.animals.machoMiss(),
      };
    });
    expect(before.kits).toHaveLength(2);
    expect(after.kits).toHaveLength(2);
    for (const k of before.kits) {
      const m = after.kits.find((x: any) => x.x === k.x && x.z === k.z);
      expect(m?.egg).toBe(k.egg);
      expect(Math.abs(m.left - k.left)).toBeLessThanOrEqual(3);
    }
    expect(after.coops.map((c: any) => [c.x, c.z, c.dir, c.kids])).toEqual(before.coops.map((c: any) => [c.x, c.z, c.dir, c.kids]));
    expect(after.miss).toBe(7);
    expect(after.list).toHaveLength(before.list.length);
    for (const b of before.list) {
      const m = after.list.reduce((best: any, a: any) => (Math.hypot(a.x - b.x, a.z - b.z) < Math.hypot(best.x - b.x, best.z - b.z) ? a : best));
      for (const k of ['x', 'y', 'z']) expect(Math.abs(m[k] - b[k]), k).toBeLessThanOrEqual(0.01);
      expect({ stage: m.stage, breed: m.breed, raised: m.raised, bugs: m.bugs, goldMiss: m.goldMiss, grow: m.grow, homed: !!m.home }).toEqual({ stage: b.stage, breed: b.breed, raised: b.raised, bugs: b.bugs, goldMiss: b.goldMiss, grow: b.grow, homed: !!b.home });
    }
  });

  test('AC21b 古い 保存と おかしい 行: v 2 → adult・normal・raised false。v 1（eggDay つき）→ follow まんたん。breed gold → normal。小屋 4 つ → 3 つ。kits 7 行 → 6 行。いちばん 多い とき 4,000 文字以下', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      const out: any = {};
      const full = A.full();
      // v 1（LIVE-1 版 2: follow なし・eggDay つき）
      // 読み直した 直後に 読む（step すると follow が へる）
      h.animals.deserialize({ v: 1, friends: [{ x: 4.5, y: 9, z: 6.5, yaw: 0, eggDay: 3 }], wild: [] });
      out.v1 = h.animals.list().map((a: any) => ({ stage: a.stage, breed: a.breed, raised: a.raised, follow: a.follow, friend: a.friend }));
      // v 2
      h.animals.deserialize({ v: 2, friends: [{ x: 4.5, y: 9, z: 6.5, yaw: 0, follow: 500 }] });
      out.v2 = h.animals.list().map((a: any) => ({ stage: a.stage, breed: a.breed, raised: a.raised, bugs: a.bugs, goldMiss: a.goldMiss, grow: a.grow, follow: a.follow }));
      out.v2Coops = h.animals.coops().length;
      out.v2Kits = h.animals.kits().length;
      // おかしい 行
      h.animals.deserialize({ v: 3, friends: [{ x: 4.5, y: 9, z: 6.5, yaw: 0, follow: 5, stage: 'adult', breed: 'gold', raised: false, bugs: 0, goldMiss: 0, grow: 0 }, { x: 'x' }], coops: [], kits: [], machoMiss: 0 });
      h.step(2);
      out.gold = h.animals.list().map((a: any) => ({ breed: a.breed, stage: a.stage }));
      // 小屋 4 つ・こたつ 7 行
      const coop = (i: number) => ({ id: i + 1, x: 10 + i * 8, y: 9, z: 10, dir: 0, kids: [], nest: { egg: 0, gold: 0 } });
      const kits = [] as any[];
      for (let i = 0; i < 7; i++) {
        h.world.setBlock(2 + i, 9, 50, 'nukunuku');
        kits.push({ x: 2 + i, y: 9, z: 50, egg: 'egg', left: 1000 });
      }
      h.step(2);
      h.animals.deserialize({ v: 3, friends: [], coops: [coop(0), coop(1), coop(2), coop(3)], kits, machoMiss: 0 });
      h.step(2);
      out.coops = h.animals.coops().length;
      out.kits = h.animals.kits().length;
      // ブロックが 無い 位置の 行は すてる
      h.animals.deserialize({ v: 3, friends: [], coops: [], kits: [{ x: 90, y: 9, z: 90, egg: 'egg', left: 1000 }], machoMiss: 0 });
      h.step(2);
      out.noBlock = h.animals.kits().length;
      out.full = full;
      return out;
    });
    for (const row of r.v1) expect(row).toMatchObject({ stage: 'adult', breed: 'normal', raised: false, follow: r.full, friend: true });
    expect(r.v1).toHaveLength(1);
    expect(r.v2[0]).toMatchObject({ stage: 'adult', breed: 'normal', raised: false, bugs: 0, goldMiss: 0, grow: 0, follow: 500 });
    expect(r.v2Coops).toBe(0);
    expect(r.v2Kits).toBe(0);
    expect(r.gold).toEqual([{ breed: 'normal', stage: 'adult' }]);
    expect(r.coops).toBe(3);
    expect(r.kits).toBe(6);
    expect(r.noBlock, 'こたつの ブロックが 無い 行は すてる').toBe(0);
  });

  test('AC21c 大きさ: なかま 8・小屋 3 × 6・あたため中 6 の とき animals の 保存が 4,000 文字 以下', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(70);
      h.settings.set('kitHatchTicks', 7200);
      for (const [x, z] of [[14, 14], [34, 14], [54, 14]]) {
        const c = A.cinfo(A.coop(x, z));
        for (let i = 0; i < 6; i++) A.kid(c, { stage: 'adult', raised: true, bugs: 120, goldMiss: 29, breed: i % 2 ? 'macho' : 'normal' }, (i % 3) - 1, Math.floor(i / 3) - 1 || 1);
      }
      for (let i = 0; i < 8; i++) A.friend(5.5 + i * 1.5, 40.5, { stage: 'adult', bugs: 120, goldMiss: 29 });
      for (let i = 0; i < 6; i++) {
        const k = A.kit(4 + i * 3, 56);
        A.putEgg(k, 'egg', 1);
      }
      return { len: JSON.stringify(h.animals.serialize()).length, kids: h.animals.list().filter((a: any) => a.home).length, kits: h.animals.kits().length };
    });
    expect(r.kids).toBe(18);
    expect(r.kits).toBe(6);
    expect(r.len).toBeLessThanOrEqual(4000);
  });

  test('AC25 文字: 合図 kitNeedEgg・coopNotEmpty・coopNoRoom・coopNoEgg の チップは 漢字 0・禁止語 0・3 つの 大きさで はみ出し 0px・2 行まで', async ({ page }) => {
    await openAnimals(page);
    const sizes = [[1280, 800], [1440, 900], [1024, 700]] as const;
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      await openAnimals(page); // 小屋・こたつは clear() で 消えない ので 大きさごとに 読み直す
      const rows = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const A = (window as any).__A;
        A.base(40);
        const out: any[] = [];
        const grab = (name: string) => {
          h.step(2);
          const el = document.querySelector('#animal-hint') as HTMLElement | null;
          const b = el?.getBoundingClientRect();
          const cs = el ? getComputedStyle(el) : null;
          // 行の 数は、文字の 箱（ふりがな rt は のぞく）の 上の 位置が はなれて いる 数で 数える（line-height: normal は 数に ならない）
          let lines = 0;
          if (el && cs) {
            const tops: number[] = [];
            const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let n: Node | null;
            while ((n = w.nextNode())) {
              if (!(n.textContent ?? '').trim() || n.parentElement?.closest('rt')) continue;
              const rg = document.createRange();
              rg.selectNodeContents(n);
              for (const r of Array.from(rg.getClientRects())) if (r.width > 0) tops.push(r.top);
            }
            tops.sort((x, y) => x - y);
            const gap = parseFloat(cs.fontSize) * 0.6;
            lines = tops.length ? 1 : 0;
            for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > gap) lines++;
          }
          out.push({
            name,
            hint: h.animals.lastHint(),
            chip: A.chip(),
            over: b ? Math.max(0, b.right - innerWidth, b.bottom - innerHeight, -b.left, -b.top) : 999,
            lines,
            body: document.body.innerText,
          });
        };
        // kitNeedEgg
        const k = A.kit(8, 6);
        A.putEgg(k, 'dirt', 0);
        h.inventory.clear();
        A.putEgg(k, 'tomato', 1);
        grab('kitNeedEgg');
        // coopNoRoom: でこぼこ
        h.world.setBlock(44, 8, 44, 'air');
        h.world.setBlock(46, 8, 44, 'air');
        h.world.setBlock(45, 8, 46, 'air');
        h.step(2);
        A.hold('toriya', 1);
        (window as any).__aim.standForS(42.5, 45.5, 90, 0, 9);
        h.step(1);
        (window as any).__aim.solve(45, 8, 45, 1);
        h.step(1);
        A.tap();
        grab('coopNoRoom');
        // coopNoEgg / coopNotEmpty
        h.animals.clear();
        const c = A.cinfo(A.coop(20, 20));
        const f = A.face(c);
        h.inventory.clear();
        h.player.set({ position: { x: c.x + 0.5 - f.fx * 4.5, y: 9, z: c.z + 0.5 - f.fz * 4.5 }, yaw: A.yawTo(f.fx, f.fz), pitch: 0 });
        h.step(2);
        A.aimBlock(c.x - f.fx * 2, c.y, c.z - f.fz * 2);
        A.tap();
        grab('coopNoEgg');
        A.kid(c, { stage: 'chick' });
        h.player.set({ position: { x: c.x + 0.5 - f.fx * 4.5, y: 9, z: c.z + 0.5 - f.fz * 4.5 }, yaw: A.yawTo(f.fx, f.fz), pitch: 0 });
        h.step(2);
        A.aimBlock(c.x - f.fx * 2, c.y, c.z - f.fz * 2);
        h.input.press('primary');
        h.step(2);
        grab('coopNotEmpty');
        h.input.release('primary');
        return out;
      });
      const want: Record<string, string> = { kitNeedEgg: 'kitNeedEgg', coopNoRoom: 'coopNoRoom', coopNoEgg: 'coopNoEgg', coopNotEmpty: 'coopNotEmpty' };
      for (const row of rows) {
        const tag = `${w}x${hgt} ${row.name}`;
        expect(row.hint, tag).toBe(want[row.name]);
        expect(row.chip.text.length, `${tag} チップに 文（空だと 漢字 0 が ただの みかけに なる）`).toBeGreaterThan(0);
        expect(row.chip.bare, `${tag} 漢字`).toEqual([]);
        expect(row.over, `${tag} はみ出し`).toBeLessThanOrEqual(0.5);
        expect(row.lines, `${tag} 2 行まで`).toBeLessThanOrEqual(2);
        for (const bad of ['ぬくぬく', '育成', 'たまご こたつ', 'きん の ひよこ', 'きん の にわとり', '小屋', '大人']) {
          expect(row.body.includes(bad), `${tag} 「${bad}」`).toBe(false);
        }
      }
    }
  });

  test('AC27 性能: 29 わ（小屋 18・なかま 8・やせい 3・うち マッチョ にわとり 3）＋ あたため中 6 で 描画 +48 以下・三角形 +20,000 以下', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      (window as any).__aim.standForS(2.5, 30.5, 90, -20, 9);
      h.step(30);
      const o: any = {};
      const a = h.renderStats();
      o.zero = { dc: a.drawCalls, tri: a.triangles };
      // 動物 なしの 1 ステップ（中央値）。あたため 後に 同じ 方法で はかって ふえを 見る
      const median = () => {
        const ms: number[] = [];
        for (let i = 0; i < 15; i++) {
          const t0 = performance.now();
          h.step(40);
          ms.push((performance.now() - t0) / 40);
        }
        ms.sort((x, y) => x - y);
        return ms[7];
      };
      h.step(40); // ならし
      o.baseMs = median();
      for (const z of [18, 30, 42]) {
        const c = A.cinfo(A.coop(14, z));
        for (let i = 0; i < 6; i++) A.kid(c, { stage: i < 3 ? 'adult' : 'chick', breed: i === 0 ? 'macho' : 'normal', raised: true }, (i % 3) - 1, Math.floor(i / 3) - 1 || 1);
      }
      const full = A.full();
      for (let i = 0; i < 8; i++) h.animals.spawn(5 + (i % 4) * 1.5, 9, 26 + Math.floor(i / 4) * 2 + 0.5, { friend: true, follow: full, breed: 'normal', stage: i < 4 ? 'adult' : 'chick' }); // マッチョ にわとり は 小屋の 3 わ だけ（AC27）
      for (let i = 0; i < 3; i++) h.animals.spawn(5 + i * 1.5, 9, 36.5, { hearts: 2 });
      h.settings.set('kitHatchTicks', 7200);
      for (let i = 0; i < 6; i++) {
        const k = A.kit(30, 14 + i * 4);
        A.putEgg(k, 'egg', 1);
      }
      (window as any).__aim.standForS(2.5, 30.5, 90, -20, 9);
      h.step(60);
      o.n = h.animals.list().length;
      const b = h.renderStats();
      o.on = { dc: b.drawCalls, tri: b.triangles };
      o.stepMs = median(); // 中央値
      o.addMs = o.stepMs - o.baseMs;
      return o;
    });
    console.log('LIVE2 AC27 perf', JSON.stringify(r));
    expect(r.n).toBe(29);
    expect(r.on.dc - r.zero.dc).toBeLessThanOrEqual(48);
    expect(r.on.tri - r.zero.tri).toBeLessThanOrEqual(20000);
    expect(r.addMs, '動物 なしからの 1 ステップの ふえ（中央値。§4.6）').toBeLessThanOrEqual(0.2);
  });
});
