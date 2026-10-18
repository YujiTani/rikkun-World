import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-1 E2E その 3（docs/design/LIVE-1.md §6）: AC13 たまご・AC14 えさと たまご・AC15 たまごを たべる・
 * AC16 右クリックの ふりわけ・AC17 照準の 下の 案内・AC18 頭の 上の ハート。
 * 台帳 G1 の 決め: なかまが 今日 もう たまごを くれた とき、やさいを 持って ねらうと 実際は なでる → 案内は 絵 `heart`・語 `なでる`
 * （`preview` の 戻りは `'animalPet'`）。
 */
test.describe('LIVE-1 たまご・ふりわけ・案内・ハート', () => {
  test('AC13 たまご: なでる → 60 ステップ目に egg・同じ日は eggLater・次の日は また egg', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const delay = h.settings.get('animalEggDelay');
      const id = A.chicken(4.5, 6.5, { friend: true });
      const day = h.time.get().day;
      const out: any = { delay, day, aimed: A.aim(id), eggDay0: A.one(id).eggDay };
      h.inventory.clear();
      h.animals.events();
      const pet0 = A.stat('petAnimal:*');
      const egg0 = A.stat('egg:*');
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      out.petEv = A.events('pet').length;
      out.petStat = A.stat('petAnimal:*') - pet0;
      out.unlockPet = A.unlocked('animal.pet.1');
      // 60 ステップの とちゅう
      h.step(20);
      A.tap();
      out.midPet = A.events('pet').length;
      out.midEgg = A.events('egg').length;
      // 押した ステップ から delay-1 まで（ここまでで 1 + 20 + 2 = 23 ステップ）
      let eggAt = -1;
      let egg: any = null;
      for (let i = 23; i <= delay + 10 && eggAt < 0; i++) {
        h.step(1);
        const e = A.events('egg');
        if (e.length) {
          eggAt = i + 1;
          egg = e[0];
        }
      }
      out.eggAt = eggAt;
      const c = A.one(id);
      out.eggNear = egg ? Math.hypot(egg.x - c.x, egg.z - c.z) : null;
      out.eggDay = c.eggDay;
      out.eggStat = A.stat('egg:*') - egg0;
      out.unlockEgg = A.unlocked('animal.egg.1');
      out.sfxEgg = A.sfx().includes('egg');
      h.player.set({ position: { x: c.x, y: 9, z: c.z } });
      h.step(120);
      out.inv = h.inventory.count('egg');
      // 同じ日に もう 1 回
      (window as any).__aim.standForS(2.5, 6.5, 90, -20, 9);
      h.step(2);
      A.aim(id);
      h.animals.events();
      A.tap();
      out.pet2 = A.events('pet').length;
      out.hint = h.animals.lastHint(); // 合図は 120 ステップで きえる ので すぐ 読む
      h.step(600);
      out.egg2 = A.events('egg').length;
      // 次の日
      out.nextDay = A.nextDay();
      h.step(2);
      A.aim(id);
      h.animals.events();
      A.tap();
      h.step(delay + 2);
      out.egg3 = A.events('egg').length;
      return out;
    });
    expect(r.aimed).toBe(true);
    expect(r.eggDay0).toBeNull();
    expect(r.petEv).toBe(1);
    expect(r.petStat).toBe(1);
    expect(r.unlockPet).toBe(true);
    expect(r.midPet, '60 ステップの とちゅうの 押しは 何も 起きない').toBe(0);
    expect(r.midEgg).toBe(0);
    expect(r.eggAt).toBeGreaterThanOrEqual(r.delay - 1);
    expect(r.eggAt).toBeLessThanOrEqual(r.delay + 1);
    expect(r.eggNear).toBeLessThanOrEqual(1.0);
    expect(r.eggDay).toBe(r.day);
    expect(r.eggStat).toBe(1);
    expect(r.unlockEgg).toBe(true);
    expect(r.sfxEgg).toBe(true);
    expect(r.inv, '足もとの たまごを ひろえる').toBe(1);
    expect(r.pet2).toBe(1);
    expect(r.egg2).toBe(0);
    expect(r.hint).toBe('eggLater');
    expect(r.nextDay).toBe(1);
    expect(r.egg3).toBe(1);
  });

  test('AC14 えさと たまご: トマトで 60 ステップ目に egg・今日 もう くれた なかまは たべない（pet・eggLater）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const delay = h.settings.get('animalEggDelay');
      const id = A.chicken(4.5, 6.5, { friend: true });
      A.hold('tomato', 3);
      A.aim(id);
      h.animals.events();
      A.tap();
      const out: any = { tomato1: h.inventory.count('tomato'), feed: A.events('feed').length };
      h.step(delay + 2);
      out.egg = A.events('egg').length;
      // 今日 もう くれた
      A.hold('tomato', 3);
      h.player.set({ position: { x: 2.5, y: 9, z: 6.5 } });
      A.aim(id);
      h.animals.events();
      A.tap();
      out.tomato2 = h.inventory.count('tomato');
      out.pet = A.events('pet').length;
      out.hint = h.animals.lastHint();
      return out;
    });
    expect(r.tomato1).toBe(2);
    expect(r.egg).toBe(1);
    expect(r.tomato2, 'やさいは へらない').toBe(3);
    expect(r.pet).toBe(1);
    expect(r.hint).toBe('eggLater');
  });

  test('AC15 たまごを たべる: 体力 +animalEggHeal・eat:egg・eat:* 変わらず・満タンは full・押しつづけても 1 こ', async ({ page }) => {
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

  test('AC16 ふりわけ: 防具・じょうろ・バケツ・たね・つち は なでる、トマトは あげる、うしろの たんすは ひらかない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const id = A.chicken(4.5, 6.5, { friend: true });
      const out: any = { rows: {} };
      const cases: [string, string, number][] = [['kabuto', 'kabuto', 1], ['can', 'watering_can', 1], ['bucket', 'bucket', 1], ['seed', 'seed_tomato', 3], ['dirt', 'dirt', 3]];
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
      const id2 = A.chicken(4.5, 6.5, { friend: true });
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
      A.chicken(6.5, 6.5, { friend: true });
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

  test('AC17 照準の 下の 案内: あげる(tomato)・なでる(heart)・たべる(egg)。実際に 起きる ことと 同じ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const wild = A.chicken(4.5, 6.5);
      const out: any = {};
      A.hold('tomato', 3);
      A.aim(wild);
      out.feed = h.hud.actionHint().right;
      A.tap();
      out.fedHearts = A.one(wild).hearts;
      h.animals.clear();
      const fr = A.chicken(4.5, 6.5, { friend: true });
      h.inventory.clear();
      A.aim(fr);
      out.petHand = h.hud.actionHint().right;
      h.animals.events();
      A.tap();
      out.petEv = A.events('pet').length;
      // 今日 もう くれた なかまに トマト（G1: 実際は なでる → 案内も なでる）
      h.step(80);
      A.hold('tomato', 3);
      A.aim(fr);
      out.petTomato = h.hud.actionHint().right;
      A.tap();
      out.tomatoLeft = h.inventory.count('tomato');
      // たまご を 持って 空
      h.animals.clear();
      (window as any).__aim.standForS(2.5, 6.5, 270, 0, 9);
      A.hold('egg', 2);
      h.combat.setHp(10);
      h.step(2);
      out.egg = h.hud.actionHint().right;
      A.tap();
      out.hp = h.combat.get().hp;
      return out;
    });
    expect(r.feed).toMatchObject({ icon: 'tomato', word: 'あげる' });
    expect(r.fedHearts).toBe(1);
    expect(r.petHand).toMatchObject({ icon: 'heart', word: 'なでる' });
    expect(r.petEv).toBe(1);
    expect(r.petTomato).toMatchObject({ icon: 'heart', word: 'なでる' });
    expect(r.tomatoLeft).toBe(3);
    expect(r.egg).toMatchObject({ icon: 'egg', word: 'たべる' });
    expect(r.hp).toBeGreaterThan(10);
  });

  test('AC18 頭の 上の ハート: hearts 2 は 近くで 出る（filled 2）・遠い・hearts 0・なかまは 出ない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const look = h.settings.get('animalLookDist');
      const prog = (id: number) => h.animals.fx().progress.find((p: any) => p.id === id) ?? null;
      const w2 = h.animals.spawn(6.5, 9, 6.5, { hearts: 2 });
      const w0 = h.animals.spawn(6.5, 9, 8.5, { hearts: 0 });
      const fr = h.animals.spawn(6.5, 9, 4.5, { friend: true });
      h.player.set({ position: { x: 6.5 - (look - 1), y: 9, z: 6.5 }, yaw: 90, pitch: 0 });
      h.step(5);
      const out: any = { look, near2: prog(w2), near0: prog(w0), nearFriend: prog(fr) };
      h.player.set({ position: { x: 6.5 - (look + 3), y: 9, z: 6.5 } });
      h.step(5);
      out.far2 = prog(w2);
      return out;
    });
    expect(r.near2).toMatchObject({ filled: 2 });
    expect(r.near0).toBeNull();
    expect(r.nearFriend).toBeNull();
    expect(r.far2).toBeNull();
  });
});
