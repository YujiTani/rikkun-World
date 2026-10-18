import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-1 E2E その 3（docs/design/LIVE-1.md 版 3.2 §6）: AC21 たまご（むしで ときどき・8 回目は かならず）・
 * AC23 たまごを たべる・ふりわけ（なかまへの 右クリックの 中身）。
 * 版 2 の「なでると 1 日 1 回 たまご」（旧 AC13）・「やさいで たまご／今日 もう くれた」（旧 AC14）・eggLater は 版 3 で なくなったので 消した。
 */
test.describe('LIVE-1 たまご・ふりわけ・案内・ハート', () => {
  // 3 並列の SwiftShader で 30〜60 秒かかる テストが あり、60 秒だと 時間切れに なる（期待は 変えない）
  test.describe.configure({ timeout: 150_000 });
  test('AC21 たまご: animalEggChance 1 で なかま+むし（押して 5 ステップ後に はなす）→ はなして 60 ステップ目に egg・egg:* 1・animal.egg.1。600 後 もう 1 回 → また egg（1 日の 上限 なし）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('animalEggChance', 1);
      const delay = h.settings.get('animalEggDelay');
      const id = A.friend(4.5, 6.5);
      A.hold('mushi', 5);
      A.aim(id);
      const out: any = { delay };
      h.animals.events();
      h.audio.sfx();
      h.input.press('secondary');
      h.step(5);
      out.eggDuringHold = A.events('egg').length;
      h.input.release('secondary');
      let eggAt = -1;
      let egg: any = null;
      for (let i = 1; i <= delay + 10 && eggAt < 0; i++) {
        h.step(1);
        const e = A.events('egg');
        if (e.length) {
          eggAt = i;
          egg = e[0];
        }
      }
      out.eggAt = eggAt;
      const c = A.one(id);
      out.eggNear = egg ? Math.hypot(egg.x - c.x, egg.z - c.z) : null;
      out.eggStat = A.stat('egg:*');
      out.unlockEgg = A.unlocked('animal.egg.1');
      out.sfxEgg = A.sfx().includes('egg');
      h.player.set({ position: { x: c.x, y: 9, z: c.z } });
      h.step(120);
      out.inv = h.inventory.count('egg');
      // 600 ステップ後に もう 1 回（同じ日）
      h.step(600);
      A.stand(id);
      h.animals.events();
      A.tap();
      h.step(delay + 3);
      out.egg2 = A.events('egg').length;
      out.mushi = h.inventory.count('mushi');
      return out;
    });
    expect(r.eggDuringHold, '押している あいだは まだ').toBe(0);
    expect(r.eggAt, 'はなして 60 ステップ目（ついばむ 30 ＋ しゃがんで ポン 30）').toBeGreaterThanOrEqual(r.delay - 2);
    expect(r.eggAt).toBeLessThanOrEqual(r.delay + 2);
    expect(r.eggNear).toBeLessThanOrEqual(1.0);
    expect(r.eggStat).toBe(1);
    expect(r.unlockEgg).toBe(true);
    expect(r.sfxEgg).toBe(true);
    expect(r.inv, '足もとの たまごを ひろえる').toBe(1);
    expect(r.egg2, '1 日の 上限なし').toBe(1);
    expect(r.mushi).toBe(3);
  });

  test('AC21b かならず: animalEggChance 0 で 600 ステップごとに 8 回 → 1〜7 回目 egg なし・8 回目 だけ egg。9 回目 なし（数え直し）', async ({ page }) => {
    test.setTimeout(90_000);
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('animalEggChance', 0);
      const gap = h.settings.get('animalFullTicks') + 40;
      const delay = h.settings.get('animalEggDelay');
      const pity = h.settings.get('animalEggPity');
      const id = A.friend(4.5, 6.5);
      A.hold('mushi', 20);
      const eggs: number[] = [];
      for (let n = 1; n <= 9; n++) {
        A.stand(id);
        h.animals.events();
        A.tap();
        h.step(delay + 3);
        eggs.push(A.events('egg').length);
        h.step(gap);
      }
      return { eggs, pity, mushi: h.inventory.count('mushi') };
    });
    expect(r.pity).toBe(7);
    expect(r.eggs.slice(0, 7), '1〜7 回目').toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(r.eggs[7], '8 回目は かならず').toBe(1);
    expect(r.eggs[8], '数え直し').toBe(0);
    expect(r.mushi, '9 回 とも たべた').toBe(11);
  });

  test('AC21c うまない: なでる だけ・やせいに むし → 600 ステップ egg なし', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('animalEggChance', 1);
      const out: any = {};
      // なでる だけ
      const f = A.friend(4.5, 6.5);
      h.inventory.clear();
      A.aim(f);
      h.animals.events();
      for (let i = 0; i < 5; i++) {
        A.stand(f);
        A.tap();
        h.step(130);
      }
      out.petEgg = A.events('egg').length;
      out.pets = A.events('pet').length;
      // やせいに むし
      h.animals.clear();
      const w = A.chicken(4.5, 6.5);
      A.hold('mushi', 2);
      A.aim(w);
      h.animals.events();
      A.tap();
      h.step(600);
      out.wildEgg = A.events('egg').length;
      return out;
    });
    expect(r.petEgg, 'なでても うまない').toBe(0);
    expect(r.wildEgg, 'やせいは うまない').toBe(0);
  });

  test('AC23 たまごを たべる: 体力 +animalEggHeal・eat:egg・eat:* 変わらず・満タンは full・押しつづけても 1 こ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const heal = h.settings.get('animalEggHeal');
      const out: any = { heal };
      (window as any).__aim.standForS(2.5, 6.5, 270, 30, 9); // 空（床）しか ねらわない
      h.combat.setHp(10);
      A.hold('egg', 3);
      const eat0 = A.stat('eat:*');
      A.tap();
      out.hp = h.combat.get().hp;
      out.egg = h.inventory.count('egg');
      out.eatEgg = A.stat('eat:egg');
      out.eatAll = A.stat('eat:*') - eat0;
      out.unlock = A.unlocked('animal.eatEgg.1');
      // 満タン
      h.combat.setHp(h.combat.get().maxHp);
      A.tap();
      out.fullEgg = h.inventory.count('egg');
      out.hint = h.farm.lastHint();
      // 押しつづけ
      h.combat.setHp(1);
      h.input.press('secondary');
      h.step(120);
      h.input.release('secondary');
      out.holdEgg = h.inventory.count('egg');
      return out;
    });
    expect(r.hp).toBe(10 + r.heal);
    expect(r.egg).toBe(2);
    expect(r.eatEgg).toBe(1);
    expect(r.eatAll).toBe(0);
    expect(r.unlock).toBe(true);
    expect(r.fullEgg).toBe(2);
    expect(r.hint).toBe('full');
    expect(r.holdEgg, '押しつづけても 1 こ').toBe(1);
  });

  test('AC16 ふりわけ: 防具・じょうろ・バケツ・たね・つち・あみ・トマト は なでる（版 3: やさいは あげられない）、うしろの たんすは ひらかない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const id = A.chicken(4.5, 6.5, { friend: true, follow: A.full() });
      const out: any = { rows: {} };
      const cases: [string, string, number][] = [['kabuto', 'kabuto', 1], ['can', 'watering_can', 1], ['bucket', 'bucket', 1], ['seed', 'seed_tomato', 3], ['dirt', 'dirt', 3], ['net', 'mushi_ami', 1], ['tomato', 'tomato', 3]];
      for (const [name, item, n] of cases) {
        A.hold(item, n);
        if (item === 'watering_can') h.farm.setCanWater(0, 5);
        A.aim(id);
        h.animals.events();
        const before = JSON.stringify(h.inventory.get().slots[0]);
        A.tap();
        out.rows[name] = {
          pet: A.events('pet').length,
          same: JSON.stringify(h.inventory.get().slots[0]) === before,
          armor: JSON.stringify(h.armor.get()).includes('kabuto'),
        };
        h.step(70);
      }
      out.blocks = h.world.getBlock(3, 9, 6);
      // 6 マス先は ねらえない
      const far = h.animals.spawn(2.5 + 9, 9, 6.5);
      A.aim(far);
      out.farTarget = h.animals.target();
      // うしろの たんす: にわとりの むこう
      h.animals.clear();
      const id2 = A.chicken(4.5, 6.5, { friend: true, follow: A.full() });
      h.world.setBlock(6, 9, 6, 'tansu');
      A.hold('tomato', 3);
      A.aim(id2);
      out.tansuBehind = h.storage.ui().open;
      h.animals.events();
      A.hold('stone', 1);
      A.aim(id2);
      A.tap();
      out.openedBehind = h.storage.ui().open;
      return out;
    });
    for (const [k, v] of Object.entries<any>(r.rows)) {
      expect(v.pet, k).toBe(1);
      expect(v.same, k).toBe(true);
      if (k === 'kabuto') expect(v.armor, '防具を きない').toBe(false);
    }
    expect(r.farTarget, '遠い にわとりは ねらえない').toBeNull();
    expect(r.openedBehind, 'にわとりの うしろの たんすは ひらかない').toBe(false);
  });

  test('AC16b にわとりが ブロックの むこうなら 今の ふりわけ（たんすが ひらく）・押しつづけの ステップは 置かない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      h.world.setBlock(4, 9, 6, 'tansu');
      h.step(2);
      A.chicken(6.5, 6.5, { friend: true, follow: A.full() });
      (window as any).__aim.solve(4, 9, 6, 0.5);
      h.step(1);
      const out: any = { target: h.animals.target() };
      A.hold('stone', 1);
      (window as any).__aim.solve(4, 9, 6, 0.5);
      A.tap();
      out.opened = h.storage.ui().open;
      return out;
    });
    expect(r.target, 'たんすが 手前').toBeNull();
    expect(r.opened).toBe(true);
  });

  test('AC16c 置きながら 押しつづけ → 線の 前に にわとりが 来た ステップは 何も 置かない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      A.hold('dirt', 40);
      (window as any).__aim.solve(5, 8, 6, 1);
      h.step(1);
      h.input.press('secondary');
      h.step(2);
      const placed1 = 40 - h.inventory.count('dirt');
      // にわとりを 線の 上に のせる（ねらう 箱に 当たる 所へ 置いて、A.aim で 確かめる）
      const id = h.animals.spawn(3.5, 9, 6.5);
      h.step(1);
      const aimed = A.aim(id);
      const c0 = h.inventory.count('dirt');
      h.step(90);
      h.input.release('secondary');
      return { placed1, aimed, delta: c0 - h.inventory.count('dirt') };
    });
    expect(r.placed1).toBeGreaterThanOrEqual(1);
    expect(r.aimed, 'にわとりが 線の 上').toBe(true);
    expect(r.delta, 'にわとりが ねらいの 前に いる あいだは 置かない').toBe(0);
  });

  test('AC18 頭の 上の ハート: hearts 2 は 近くで 出る（marks.hearts 2）・遠い・hearts 0・なかまは 出ない（版 2 の progress → marks）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const look = h.settings.get('animalLookDist');
      const mark = (id: number) => h.animals.fx().marks.find((m: any) => m.id === id) ?? null;
      const w2 = h.animals.spawn(6.5, 9, 6.5, { hearts: 2 });
      const w0 = h.animals.spawn(6.5, 9, 8.5, { hearts: 0 });
      const fr = h.animals.spawn(6.5, 9, 4.5, { friend: true, follow: 0 });
      h.player.set({ position: { x: 6.5 - (look - 1), y: 9, z: 6.5 }, yaw: 90, pitch: 0 });
      h.step(5);
      const out: any = { look, near2: mark(w2), near0: mark(w0)?.hearts ?? 0, nearFriend: mark(fr)?.hearts ?? 0 };
      h.player.set({ position: { x: 6.5 - (look + 3), y: 9, z: 6.5 } });
      h.step(5);
      out.far2 = mark(w2)?.hearts ?? 0;
      return out;
    });
    expect(r.near2).toMatchObject({ hearts: 2 });
    expect(r.near0).toBe(0);
    expect(r.nearFriend).toBe(0);
    expect(r.far2).toBe(0);
  });

  test('AC25b たまごを たべる 案内: egg を 持って 空 → たべる（のこす）。体力が もどる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      (window as any).__aim.standForS(2.5, 6.5, 270, 0, 9);
      A.hold('egg', 2);
      h.combat.setHp(10);
      h.step(2);
      const hint = h.hud.actionHint().right;
      A.tap();
      return { hint, hp: h.combat.get().hp };
    });
    expect(r.hint).toMatchObject({ icon: 'egg', word: 'たべる' });
    expect(r.hp).toBeGreaterThan(10);
  });
});
