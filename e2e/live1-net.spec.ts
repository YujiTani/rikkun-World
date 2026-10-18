import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-1 版 3.2 E2E: むしとりあみ と むし（docs/design/LIVE-1.md §6）
 * AC6 あみを つくる・AC7 むしが とれる・AC8（E2E の 分）かならず・AC9 おやすみ・AC10 持ち物 いっぱい・AC25 むしは たべられない・AC27 合図の 文字。
 * 乱数は `bugChance` を 0 か 1 に して きめる。き は (5, 10, z) に 置き、プレイヤーは 2.5 マス 西から ねらう。
 */
test.describe('LIVE-1 むしとりあみ・むし', () => {
  test('AC6 あみを つくる: き 1・いと 2 → mushi_ami 1・craft.mushi_ami.1・カードの いちばん うしろ・こわれない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.inventory.add('log', 1);
      h.inventory.add('string', 2);
      if (!h.inventory.get().open) {
        h.input.press('toggleInventory');
        h.input.release('toggleInventory');
      }
      h.step(4);
      const ids: string[] = h.craft.ui().cards.map((c: any) => c.id);
      const made = h.craft.make('mushi_ami');
      h.step(3);
      const out: any = {
        last: ids[ids.length - 1],
        ok: made?.ok,
        net: h.inventory.count('mushi_ami'),
        log: h.inventory.count('log'),
        string: h.inventory.count('string'),
        stat: A.stat('craft:mushi_ami'),
        unlock: A.unlocked('craft.mushi_ami.1'),
      };
      // 左クリック 100 回でも なくならない（たいきゅう なし）
      if (h.inventory.get().open) {
        h.input.press('toggleInventory');
        h.input.release('toggleInventory');
      }
      h.step(3);
      h.world.setBlock(5, 10, 6, 'leaves');
      h.step(2);
      A.hold('mushi_ami', 1);
      A.aimBlock(5, 10, 6);
      for (let i = 0; i < 100; i++) A.tap('primary');
      out.netAfter = h.inventory.count('mushi_ami');
      out.durability = h.inventory.durability(0);
      return out;
    });
    expect(r.last, '作るカードの いちばん うしろ').toBe('mushi_ami');
    expect(r.ok).toBe(true);
    expect(r.net).toBe(1);
    expect(r.log).toBe(0);
    expect(r.string).toBe(0);
    expect(r.stat).toBe(1);
    expect(r.unlock).toBe(true);
    expect(r.netAfter, 'たいきゅうが ない').toBe(1);
    expect(r.durability).toBeNull();
  });

  test('AC7 むしが とれる: 押して 30 ステップ目に mushi +1・bugCatch・bug:* 1・animal.bug.1。き は のこる。ふる 20 の あいだの 押しは 何も 起きない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('bugChance', 1);
      A.tree(5, 10, 6, 'leaves');
      A.hold('mushi_ami', 1);
      const out: any = { aimed: A.aimBlock(5, 10, 6), counts: [] as number[] };
      h.animals.events();
      h.input.press('secondary');
      let catchAt = -1;
      for (let i = 1; i <= 40; i++) {
        h.step(1);
        if (i === 1) h.input.release('secondary');
        if (i === 6) {
          // ふっている 途中に もう 1 回 押す
          h.input.press('secondary');
          h.step(1);
          h.input.release('secondary');
          i++;
        }
        out.counts[i] = h.inventory.count('mushi');
        if (catchAt < 0 && A.events('bugCatch').length) catchAt = i;
      }
      out.catchAt = catchAt;
      out.swings = 0;
      out.block = h.world.getBlock(5, 10, 6);
      out.bugStat = A.stat('bug:*');
      out.unlock = A.unlocked('animal.bug.1');
      out.sfx = A.sfx();
      return out;
    });
    expect(r.aimed).toBe(true);
    for (let i = 1; i <= 28; i++) expect(r.counts[i], `${i} ステップ目は まだ`).toBe(0);
    expect(r.catchAt).toBeGreaterThanOrEqual(29);
    expect(r.catchAt).toBeLessThanOrEqual(31);
    expect(r.counts[32]).toBe(1);
    expect(r.counts[40], 'ふっている 間の 押しで ふえない').toBe(1);
    expect(r.block, 'き は こわれない').toBe('leaves');
    expect(r.bugStat).toBe(1);
    expect(r.unlock).toBe(true);
    expect(r.sfx).toContain('netSwing');
    expect(r.sfx).toContain('bugCatch');
  });

  test('AC7b swing の 出来事は 1 回 だけ（ふる 20 の あいだに もう 1 回 押しても）。log でも とれる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('bugChance', 1);
      A.tree(5, 10, 6, 'log');
      A.hold('mushi_ami', 1);
      const out: any = { aimed: A.aimBlock(5, 10, 6) };
      h.animals.events();
      A.tap();
      h.step(5);
      A.tap();
      h.step(30);
      const ev = h.animals.events();
      out.swings = ev.filter((e: any) => e.type === 'swing').length;
      out.catches = ev.filter((e: any) => e.type === 'bugCatch').length;
      out.mushi = h.inventory.count('mushi');
      return out;
    });
    expect(r.aimed).toBe(true);
    expect(r.swings, 'ふっている 20 ステップの 押しは むし').toBe(1);
    expect(r.catches).toBe(1);
    expect(r.mushi).toBe(1);
  });

  test('AC13 あみの 案内: leaves を ねらう → 絵 mushi_ami・語 とる。右クリックで 実際に swing が 起きる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('bugChance', 1);
      A.tree(5, 10, 6, 'leaves');
      A.hold('mushi_ami', 1);
      const out: any = { aimed: A.aimBlock(5, 10, 6) };
      out.hint = h.hud.actionHint().right;
      out.swings = A.swing().filter((e: any) => e.type === 'swing').length;
      return out;
    });
    expect(r.aimed).toBe(true);
    expect(r.hint).toMatchObject({ icon: 'mushi_ami', word: 'とる' });
    expect(r.swings, '案内どおり 起きる').toBe(1);
  });

  test('AC7c き で ない 所（bamboo・stone・くさ）は swing なし・netHint。きの ブロック（momiji_leaves・matsu_leaves）は ふれる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('bugChance', 1);
      A.hold('mushi_ami', 1);
      const out: any = { rows: {} as any, trees: {} as any };
      for (const kind of ['bamboo', 'stone', 'grass']) {
        A.tree(5, 10, 6, kind);
        const aimed = A.aimBlock(5, 10, 6);
        h.animals.events();
        A.tap();
        out.rows[kind] = {
          aimed,
          swing: A.events('swing').length,
          hint: h.animals.lastHint(),
          block: h.world.getBlock(5, 10, 6),
          mushi: h.inventory.count('mushi'),
        };
        h.step(125);
      }
      for (const kind of ['momiji_leaves', 'matsu_leaves']) {
        // 場所を かえて おやすみに ならない ように する
        h.time.set(12000);
        A.tree(5, 10, 6, kind);
        A.aimBlock(5, 10, 6);
        h.animals.events();
        A.tap();
        h.step(28);
        out.trees[kind] = { swing: A.events('swing').length };
        h.step(1900);
      }
      return out;
    });
    for (const [k, v] of Object.entries<any>(r.rows)) {
      expect(v.aimed, k).toBe(true);
      expect(v.swing, `${k} は ふらない`).toBe(0);
      expect(v.hint, k).toBe('netHint');
      expect(v.block, '何も こわさない').toBe(k);
      expect(v.mushi).toBe(0);
    }
    for (const [k, v] of Object.entries<any>(r.trees)) expect(v.swing, k).toBe(1);
  });

  test('AC8 かならず: bugChance 0 でも 3 回目は かならず とれる（chance・chance・pity）。とれたら 数え直し', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('bugChance', 0);
      A.tree(5, 10, 6, 'leaves');
      A.hold('mushi_ami', 1);
      A.aimBlock(5, 10, 6);
      const rows: any[] = [];
      for (let i = 0; i < 4; i++) {
        const ev = A.swing();
        const sw = ev.find((e: any) => e.type === 'swing');
        rows.push({ caught: !!ev.find((e: any) => e.type === 'bugCatch'), reason: sw?.reason, swCaught: sw?.caught });
        h.time.set(12000);
        h.step(1900); // おやすみが おわるまで まつ
      }
      return rows;
    });
    expect(r[0]).toMatchObject({ caught: false, reason: 'chance' });
    expect(r[1]).toMatchObject({ caught: false, reason: 'chance' });
    expect(r[2], '3 回目は かならず').toMatchObject({ caught: true, reason: 'pity', swCaught: true });
    expect(r[3], '数え直し').toMatchObject({ caught: false, reason: 'chance' });
  });

  test('AC9 おやすみ: とった き の 近く（水平 3）は とれない・treeEmpty・bug:* ふえない。6 はなれた き は とれる。1,800 後 また とれる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const cool = h.settings.get('bugTreeCooldown');
      h.settings.set('bugChance', 1);
      A.hold('mushi_ami', 1);
      A.tree(5, 10, 6, 'leaves');
      A.tree(5, 10, 9, 'leaves'); // 水平 3
      A.tree(5, 10, 13, 'leaves'); // 水平 7（あみの とどく 所に 立ち直す）
      const out: any = { cool };
      A.aimBlock(5, 10, 6);
      out.first = A.swing().some((e: any) => e.type === 'bugCatch');
      out.bug1 = A.stat('bug:*');
      // 近くの き
      A.aimBlock(5, 10, 9);
      h.animals.events();
      const near = A.swing();
      out.nearCatch = near.some((e: any) => e.type === 'bugCatch');
      out.nearSwing = near.find((e: any) => e.type === 'swing');
      out.nearHint = h.animals.lastHint();
      out.bug2 = A.stat('bug:*');
      // 遠い き
      (window as any).__aim.standForS(2.5, 13.5, 90, -20, 9);
      h.step(1);
      A.aimBlock(5, 10, 13);
      out.farCatch = A.swing().some((e: any) => e.type === 'bugCatch');
      // 1,800 ステップ たつと 最初の き で また とれる
      h.step(cool + 30);
      (window as any).__aim.standForS(2.5, 6.5, 90, -20, 9);
      h.step(1);
      A.aimBlock(5, 10, 6);
      out.again = A.swing().some((e: any) => e.type === 'bugCatch');
      return out;
    });
    expect(r.first).toBe(true);
    expect(r.bug1).toBe(1);
    expect(r.nearCatch).toBe(false);
    expect(r.nearSwing).toMatchObject({ caught: false, reason: 'empty' });
    expect(r.nearHint).toBe('treeEmpty');
    expect(r.bug2, 'bug:* ふえない').toBe(1);
    expect(r.farCatch).toBe(true);
    expect(r.again).toBe(true);
  });

  test('AC10 持ち物 いっぱいで とれた → 足もとに mushi の おとしもの 1 こ（あけて ひろうと 1 こ）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('bugChance', 1);
      A.tree(5, 10, 6, 'leaves');
      A.hold('mushi_ami', 1);
      const n = h.inventory.get().slots.length;
      for (let i = 1; i < n; i++) h.inventory.setSlot(i, { item: 'dirt', count: 64 });
      A.aimBlock(5, 10, 6);
      h.animals.events();
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      h.step(45);
      const ev = h.animals.events();
      const out: any = {
        toInventory: ev.find((e: any) => e.type === 'bugCatch')?.toInventory,
        mushiBefore: h.inventory.count('mushi'),
        bugStat: A.stat('bug:*'),
      };
      h.inventory.setSlot(n - 1, null);
      h.step(120);
      out.mushiAfter = h.inventory.count('mushi');
      return out;
    });
    expect(r.toInventory).toBe(false);
    expect(r.mushiBefore).toBe(0);
    expect(r.bugStat, '足もとに おちた むしも 数える').toBe(1);
    expect(r.mushiAfter, '足もとの おとしものを ひろえる').toBe(1);
  });

  test('AC25 むしは たべられない・置けない: 体力 10 で むしを 持って 空に 右クリック → へらない・体力 そのまま', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      (window as any).__aim.standForS(2.5, 6.5, 270, 30, 9);
      h.combat.setHp(10);
      A.hold('mushi', 3);
      A.tap();
      const out: any = { mushi: h.inventory.count('mushi'), hp: h.combat.get().hp };
      // 床を ねらって 置こうとしても 置けない
      (window as any).__aim.solve(3, 8, 6, 1);
      h.step(1);
      const before = h.world.getBlock(3, 9, 6);
      A.tap();
      out.placed = h.world.getBlock(3, 9, 6) !== before;
      out.mushiPlace = h.inventory.count('mushi');
      return out;
    });
    expect(r.mushi).toBe(3);
    expect(r.hp).toBe(10);
    expect(r.placed).toBe(false);
    expect(r.mushiPlace).toBe(3);
  });

  test('AC27 あみの 合図: netHint・treeEmpty の 漢字は ふりがな つき・3 つの 大きさで はみ出し 0px', async ({ page }) => {
    await openAnimals(page);
    const sizes = [[1280, 800], [1440, 900], [1024, 700]] as const;
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const A = (window as any).__A;
        A.base();
        h.settings.set('bugChance', 1);
        A.hold('mushi_ami', 1);
        A.tree(5, 10, 6, 'stone');
        A.aimBlock(5, 10, 6);
        A.tap();
        h.step(1);
        const over = () => {
          const el = document.querySelector('#animal-hint') as HTMLElement | null;
          const b = el?.getBoundingClientRect();
          return b ? Math.max(0, b.right - innerWidth, b.bottom - innerHeight, -b.left, -b.top) : 999;
        };
        const out: any = { netHint: h.animals.lastHint(), netChip: A.chip(), netOver: over() };
        A.tree(5, 10, 6, 'leaves');
        A.aimBlock(5, 10, 6);
        A.swing();
        h.step(40);
        A.tree(5, 10, 6, 'leaves');
        A.aimBlock(5, 10, 6);
        A.swing();
        out.emptyHint = h.animals.lastHint();
        out.emptyChip = A.chip();
        out.emptyOver = over();
        return out;
      });
      expect(r.netHint, `${w}x${hgt}`).toBe('netHint');
      expect(r.emptyHint, `${w}x${hgt}`).toBe('treeEmpty');
      expect(r.netChip.bare).toEqual([]);
      expect(r.emptyChip.bare).toEqual([]);
      expect(r.netOver).toBeLessThanOrEqual(0.5);
      expect(r.emptyOver).toBeLessThanOrEqual(0.5);
    }
  });
});
