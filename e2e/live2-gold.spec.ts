import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2 E2E その 4（docs/design/LIVE-2.md 版 3 §6）: 金の たまご・文字・性能。
 * AC16 金の たまご（通し）/ AC25 文字（DOM）/ AC27 性能。
 * #311: 保存（AC21・AC21b・AC21c）と 毎回の 紙ふぶき（AC16b）は ユニットへ（src/animals/live2.test.ts・src/fx/animalFxLive2.test.ts）。
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
      const id = A.friend(4.5, 6.5, { natsuki: 71 }); // GOLD-1 AC19: 金は なつき度 71 以上の ときだけ
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
        // coopNoRoom: 深さ 3 の あな（LIVE-2.1: 深さ 1〜2 は うめて 置く ので、y−1〜y−3 を くうき に する）
        for (const [x, z] of [[44, 44], [46, 44], [45, 46]]) for (const y of [8, 7, 6]) h.world.setBlock(x, y, z, 'air');
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
    // 時間は 記録 だけ（ルール #255: E2E は ms で 合否を 決めない。オーナー 2026-10-23。§4.6）
    test.info().annotations.push({ type: 'perf', description: `1 ステップ 動物 なし ${r.baseMs.toFixed(3)} ／ あり ${r.stepMs.toFixed(3)} ms（中央値）` });
  });
});
