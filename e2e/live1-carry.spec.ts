import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-1 版 3.2 E2E: だっこ・おろす・パタパタ（docs/design/LIVE-1.md §6）
 * AC13（だっこ中の 案内）・AC17 だっこ・AC18 だっこ中の 手・AC19 おろす・AC20 パタパタ・AC27 合図の 文字。
 * 押しつづけの 長さは 設定 `carryHoldTicks` から 読む。なかまは (4.5, 9, 6.5)、プレイヤーは 2 マス 西から ねらう。
 */
test.describe('LIVE-1 だっこ・おろす・パタパタ', () => {
  test('AC17 だっこ: 39 ステップ目は まだ・40 ステップ目に carried・carry・carry:* 1・animal.carry.1。むしは へらない・たまごなし', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('animalEggChance', 1);
      const hold = h.settings.get('carryHoldTicks');
      const id = A.friend(4.5, 6.5);
      A.hold('mushi', 5);
      const out: any = { hold, aimed: A.aim(id) };
      h.animals.events();
      h.input.press('secondary');
      h.step(hold - 1);
      out.at39 = A.one(id).carried;
      out.mushi39 = h.inventory.count('mushi');
      out.progress = h.hud.actionHint().progress;
      h.step(1);
      out.at40 = A.one(id).carried;
      out.carrying = h.animals.carrying();
      h.input.release('secondary');
      h.step(120);
      out.mushiEnd = h.inventory.count('mushi');
      const ev = h.animals.events();
      out.carryEv = ev.filter((e: any) => e.type === 'carry').length;
      out.feedEv = ev.filter((e: any) => e.type === 'feed').length;
      out.petEv = ev.filter((e: any) => e.type === 'pet').length;
      out.eggEv = ev.filter((e: any) => e.type === 'egg').length;
      out.eggItem = h.inventory.count('egg');
      out.carryStat = A.stat('carry:*');
      out.unlock = A.unlocked('animal.carry.1');
      out.sfx = A.sfx();
      return out;
    });
    expect(r.aimed).toBe(true);
    expect(r.at39).toBe(false);
    expect(r.mushi39, '押しつづけの とちゅうは あげない').toBe(5);
    expect(r.at40).toBe(true);
    expect(r.carrying).not.toBeNull();
    expect(r.mushiEnd, 'むしは へらない').toBe(5);
    expect(r.carryEv).toBe(1);
    expect(r.feedEv).toBe(0);
    expect(r.petEv).toBe(0);
    expect(r.eggEv).toBe(0);
    expect(r.eggItem).toBe(0);
    expect(r.carryStat).toBe(1);
    expect(r.unlock).toBe(true);
    expect(r.sfx).toContain('carryUp');
  });

  test('AC17b わが たまる: 20 ステップ押した 時 progress は 半分くらい・語は だっこ（40 で 1 しゅう）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const hold = h.settings.get('carryHoldTicks');
      const id = A.friend(4.5, 6.5);
      A.hold('mushi', 1);
      A.aim(id);
      h.input.press('secondary');
      h.step(hold / 2);
      const a = h.hud.actionHint();
      h.input.release('secondary');
      h.step(1);
      return { progress: a.progress, word: a.right?.word };
    });
    expect(r.progress).toBeGreaterThan(0.35);
    expect(r.progress).toBeLessThan(0.65);
    expect(r.word).toBe('だっこ');
  });

  test('AC17c ねらいを はずす → だっこも あげるも 起きない。ねらいが かかるのは 1 わ だけ（だっこ中に 2 わ目は だっこしない）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const id = A.friend(4.5, 6.5);
      const id2 = A.friend(4.5, 12.5);
      A.hold('mushi', 5);
      const aimed0 = A.aim(id);
      h.animals.events();
      h.input.press('secondary');
      h.step(20);
      h.player.set({ yaw: 270 }); // うしろを 向く
      h.step(40);
      h.input.release('secondary');
      h.step(2);
      const out: any = { aimed0, carried: A.one(id).carried, mushi: h.inventory.count('mushi'), feed: A.events('feed').length };
      // 1 わ だけ
      (window as any).__aim.standForS(2.5, 6.5, 90, -20, 9);
      h.step(1);
      out.lifted = A.lift(id);
      (window as any).__aim.standForS(2.5, 12.5, 90, -20, 9);
      h.step(1);
      A.aim(id2);
      h.input.press('secondary');
      h.step(60);
      out.second = A.one(id2).carried;
      h.input.release('secondary');
      return out;
    });
    expect(r.aimed0, '最初は ねらえて いた').toBe(true);
    expect(r.carried).toBe(false);
    expect(r.mushi).toBe(5);
    expect(r.feed).toBe(0);
    expect(r.lifted).toBe(true);
    expect(r.second, '2 わ目は だっこしない').toBe(false);
  });

  test('AC17d ついばんでいる とちゅうに 押しつづけ → おわってから だっこ。だっこ中 300 ステップ 歩く → follow そのまま・fullLeft は へる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      h.settings.set('animalEggChance', 1); // ついばむ 30 + たまご 30 = 60 ステップ うごく
      const id = A.friend(4.5, 6.5);
      A.hold('mushi', 5);
      A.aim(id);
      A.tap(); // はなした ステップに あげる → ついばむ 30
      const out: any = { eatState: A.one(id).state, mushi: h.inventory.count('mushi') };
      h.input.press('secondary');
      const log: { state: string; carried: boolean }[] = [];
      let first = -1;
      for (let i = 1; i <= 120; i++) {
        h.step(1);
        const c = A.one(id);
        log.push({ state: c.state, carried: c.carried });
        if (first < 0 && c.carried) first = i;
      }
      h.input.release('secondary');
      h.step(1);
      out.first = first;
      out.carriedWhileEating = log.some((l, i) => l.carried && i > 0 && log[i - 1].state === 'eat');
      out.mushiAfter = h.inventory.count('mushi');
      // 歩く
      const c0 = A.one(id);
      out.follow0 = c0.follow;
      out.full0 = c0.fullLeft;
      h.input.press('moveForward');
      h.step(300);
      h.input.release('moveForward');
      h.step(1);
      const c1 = A.one(id);
      out.carried1 = c1.carried;
      out.follow1 = c1.follow;
      out.full1 = c1.fullLeft;
      return out;
    });
    expect(r.eatState).toBe('eat');
    expect(r.mushi).toBe(4);
    expect(r.first, 'ついばむ 30 ＋ たまご 30 が おわってから（押して 40 に なっても 待つ）').toBeGreaterThanOrEqual(55);
    expect(r.first).toBeLessThanOrEqual(75);
    expect(r.carriedWhileEating, 'ついばんでいる あいだは だっこしない').toBe(false);
    expect(r.mushiAfter, 'だっこでは むしは へらない').toBe(4);
    expect(r.carried1).toBe(true);
    expect(r.follow1, 'だっこ中は follow が へらない').toBe(r.follow0);
    expect(r.full1, 'おなかいっぱいは へる').toBeLessThan(r.full0);
  });

  test('AC18 だっこ中の 手: 左クリックで ほれない・たたけない。つち・トマト・弓は 右クリックで おろすだけ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const id = A.friend(4.5, 6.5);
      const out: any = { lifted: A.lift(id) };
      // 左クリック 120 ステップ: 目の前の 土の ブロックは こわれない
      h.world.setBlock(5, 9, 6, 'dirt');
      h.step(2);
      A.hold('wood_pickaxe', 1);
      out.aimedDirt = A.aimBlock(5, 9, 6); // 西の 面を ねらう（おろす 所は その 手前の 床）
      h.yokai.events();
      h.yokai.spawn('karakasa', 4.5, 9, 6.5, {}); // ねらいの 線の 上
      h.input.press('primary');
      h.step(120);
      h.input.release('primary');
      h.step(1);
      A.tap('primary');
      A.tap('primary');
      out.dirt = h.world.getBlock(5, 9, 6);
      out.hurt = h.yokai.events().filter((e: any) => e.type === 'hurt').length;
      h.yokai.clear();
      out.stillCarried = A.one(id).carried;
      // つち を 持って 右クリック → 置かず に おろす
      A.hold('dirt', 5);
      A.aimBlock(5, 9, 6);
      A.tap();
      h.step(22);
      out.dirtCount = h.inventory.count('dirt');
      out.afterDirt = A.one(id).carried;
      out.putEv = A.events('putDown').length;
      out.noPlace = h.world.getBlock(4, 9, 6);
      // トマト: たべず に おろす
      out.lift2 = A.lift(id);
      h.combat.setHp(10);
      A.hold('tomato', 3);
      A.tap();
      h.step(22);
      out.tomato = h.inventory.count('tomato');
      out.hp = h.combat.get().hp;
      out.afterTomato = A.one(id).carried;
      // 弓: 引けない
      out.lift3 = A.lift(id);
      A.hold('yumi', 1);
      h.inventory.add('ya', 10);
      h.inventory.select(0);
      h.step(1);
      h.input.press('secondary');
      h.step(60);
      out.arrows = h.combat.arrows().length;
      out.ya = h.inventory.count('ya');
      h.input.release('secondary');
      h.step(22);
      out.afterBow = A.one(id).carried;
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.aimedDirt, 'ねらえて いる（でないと こわれない のは あたりまえ）').toBe(true);
    expect(r.dirt, '左クリックを 押しつづけても ほれない').toBe('dirt');
    expect(r.hurt).toBe(0);
    expect(r.stillCarried).toBe(true);
    expect(r.dirtCount, 'つちを 置かない').toBe(5);
    expect(r.afterDirt).toBe(false);
    expect(r.putEv).toBe(1);
    expect(r.noPlace).toBe('air');
    expect(r.lift2).toBe(true);
    expect(r.tomato, 'たべない').toBe(3);
    expect(r.hp).toBe(10);
    expect(r.afterTomato, 'おろす').toBe(false);
    expect(r.lift3).toBe(true);
    expect(r.arrows, '弓は 引けない').toBe(0);
    expect(r.ya).toBe(10);
    expect(r.afterBow).toBe(false);
  });

  test('AC19 おろす: 2 マス先の 地面を ねらって 押す → 20 ステップで carried false・putDown・そのマス(±0.5)。照準の 下は おろす', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const id = A.friend(4.5, 6.5);
      const out: any = { lifted: A.lift(id) };
      h.inventory.clear();
      (window as any).__aim.solve(5, 8, 6, 1); // 床の ブロックの 上の 面（x=5.5, z=6.5）
      h.step(1);
      out.hint = h.hud.actionHint().right;
      h.animals.events();
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      h.step(21);
      const c = A.one(id);
      out.carried = c.carried;
      out.carrying = h.animals.carrying();
      out.put = A.events('putDown');
      out.dx = Math.abs(c.x - 5.5);
      out.dz = Math.abs(c.z - 6.5);
      out.dy = Math.abs(c.y - 9);
      out.sfx = A.sfx();
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.hint).toMatchObject({ word: 'おろす' });
    expect(r.carried).toBe(false);
    expect(r.carrying).toBeNull();
    expect(r.put).toHaveLength(1);
    expect(r.dx).toBeLessThanOrEqual(0.5);
    expect(r.dz).toBeLessThanOrEqual(0.5);
    expect(r.dy).toBeLessThanOrEqual(0.5);
    expect(r.sfx).toContain('carryDown');
  });

  test('AC19b おろせない: まわりが 固い 所で 何も ねらわず 押す → おろさない・cantPutHere。やせいを 長おし → carryWild', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const id = A.friend(4.5, 6.5);
      const out: any = { lifted: A.lift(id) };
      // 前の マスを ぜんぶ 固くして、空を ねらう
      const p = h.player.get().position;
      const x0 = Math.floor(p.x);
      const z0 = Math.floor(p.z);
      h.world.fill(x0 + 1, 9, z0 - 2, x0 + 4, 11, z0 + 2, 'stone');
      h.step(2);
      h.player.set({ yaw: 90, pitch: 80 });
      h.step(1);
      out.noTarget = !h.target.get();
      h.animals.events();
      h.audio.sfx();
      A.tap();
      h.step(22);
      out.carried = A.one(id).carried;
      out.hint = h.animals.lastHint();
      out.chip = A.chip();
      out.putEv = A.events('putDown').length;
      out.sfx = A.sfx();
      // やせいを 長おし
      h.animals.clear();
      h.world.fill(x0 + 1, 9, z0 - 2, x0 + 4, 11, z0 + 2, 'air');
      h.step(2);
      A.base(30);
      const w = A.chicken(4.5, 6.5);
      A.hold('mushi', 2);
      A.aim(w);
      h.input.press('secondary');
      h.step(50);
      out.wildCarried = A.one(w).carried;
      out.wildHint = h.animals.lastHint();
      out.wildChip = A.chip();
      out.wildMushi = h.inventory.count('mushi');
      h.input.release('secondary');
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.noTarget).toBe(true);
    expect(r.carried, 'おろせない').toBe(true);
    expect(r.putEv).toBe(0);
    expect(r.hint).toBe('cantPutHere');
    expect(r.chip.bare, '合図の 漢字は ルビの 中').toEqual([]);
    expect(r.wildCarried, 'やせいは だっこしない').toBe(false);
    expect(r.wildHint).toBe('carryWild');
    expect(r.wildChip.bare).toEqual([]);
    expect(r.wildMushi, 'やせいに 長おしでは あげない').toBe(2);
  });

  test('AC20 パタパタ: 10 マス上の くうきに おろす → どの ステップも 下向き 2.0 マス/秒 以下・fluttering true・着地まで 285 ステップ以上・着地で false', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const speed = h.settings.get('animalFlutterFallSpeed');
      // follow 0: ついてくる なかま は 高さ の 差 6 より 大 で ワープ する（§2.7）ので、落ちる ところ を 見る ため ついてこない なかま に する
      const id = A.friend(4.5, 6.5, { follow: 0 });
      const out: any = { speed, lifted: A.lift(id) };
      // y=18 の だい（x 0..1, z 4..9）の 上に 立って、東の くうきに おろす
      h.world.fill(0, 18, 4, 1, 18, 9, 'stone');
      h.step(2);
      (window as any).__aim.standForS(2.0, 6.5, 90, 0, 19);
      h.step(1);
      h.inventory.clear();
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      let startFall = -1;
      let land = -1;
      let minVy = 0;
      let flutterSteps = 0;
      let landedFlutter: boolean | null = null;
      for (let i = 1; i <= 800 && land < 0; i++) {
        h.step(1);
        const c = A.one(id);
        if (startFall < 0 && c.y < 18.9) startFall = i;
        if (startFall >= 0) {
          minVy = Math.min(minVy, c.vy);
          if (c.fluttering) flutterSteps++;
          if (c.y <= 9.05 && c.vy > -0.01) {
            land = i;
            landedFlutter = c.fluttering;
          }
        }
      }
      out.startFall = startFall;
      out.land = land;
      out.fallSteps = land - startFall;
      out.minVy = minVy;
      out.flutterSteps = flutterSteps;
      h.step(10);
      out.afterLand = A.one(id).fluttering;
      out.landedFlutter = landedFlutter;
      out.carried = A.one(id).carried;
      return out;
    });
    expect(r.lifted).toBe(true);
    expect(r.startFall, 'おちはじめた').toBeGreaterThan(0);
    expect(r.land, '着地した').toBeGreaterThan(0);
    expect(r.minVy, '下向きの 速さ').toBeGreaterThanOrEqual(-(r.speed + 0.05));
    expect(r.flutterSteps, '落ちている あいだ ずっと').toBeGreaterThanOrEqual(r.fallSteps - 15);
    expect(r.fallSteps, '10 マス ÷ 2.0 = 5 秒').toBeGreaterThanOrEqual(285);
    expect(r.afterLand).toBe(false);
  });

  test('AC20b 足場を こわす → パタパタ。みずの 中は fluttering false', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const speed = h.settings.get('animalFlutterFallSpeed');
      // 高い だい（y=18）の 上の なかま。足場を こわす
      h.world.setBlock(10, 18, 10, 'stone');
      h.step(2);
      const id2 = h.animals.spawn(10.5, 19, 10.5, { friend: true, follow: 0 });
      h.step(40);
      const out: any = { stood: Math.abs(A.one(id2).y - 19) < 0.2, speed };
      h.world.setBlock(10, 18, 10, 'air');
      let minVy = 0;
      let fl = 0;
      for (let i = 0; i < 20; i++) {
        h.step(1);
        const c = A.one(id2);
        minVy = Math.min(minVy, c.vy);
        if (c.fluttering) fl++;
      }
      out.minVy = minVy;
      out.fl = fl;
      // みず（深さ 3）の 中
      h.animals.clear();
      h.world.fill(20, 9, 20, 22, 11, 22, 'water');
      h.step(2);
      const id3 = h.animals.spawn(21.5, 11, 21.5, { friend: true, follow: 0 });
      let wf = 0;
      let inWater = false;
      for (let i = 0; i < 10; i++) {
        h.step(1);
        const c = A.one(id3);
        if (c.fluttering) wf++;
        if (c.inWater) inWater = true;
      }
      out.waterFlutter = wf;
      out.inWater = inWater;
      return out;
    });
    expect(r.stood).toBe(true);
    expect(r.fl, '足場が 消えると パタパタ').toBeGreaterThan(10);
    expect(r.minVy).toBeGreaterThanOrEqual(-(r.speed + 0.05));
    expect(r.inWater).toBe(true);
    expect(r.waterFlutter, 'みずの 中では しない').toBe(0);
  });

  test('AC27 だっこの 合図: carryHint・carryWild・cantPutHere は 漢字に ふりがな・3 つの 大きさで はみ出し 0px', async ({ page }) => {
    await openAnimals(page);
    const sizes = [[1280, 800], [1440, 900], [1024, 700]] as const;
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const A = (window as any).__A;
        A.base(30);
        const over = () => {
          const el = document.querySelector('#animal-hint') as HTMLElement | null;
          const b = el?.getBoundingClientRect();
          return b ? Math.max(0, b.right - innerWidth, b.bottom - innerHeight, -b.left, -b.top) : 999;
        };
        const out: any = {};
        // carryWild
        const wild = A.chicken(4.5, 6.5);
        A.aim(wild);
        h.input.press('secondary');
        h.step(50);
        h.input.release('secondary');
        out.wild = { hint: h.animals.lastHint(), chip: A.chip(), over: over() };
        // carryHint: はじめての なかま（ハート 2 + むし）
        h.animals.clear();
        const w2 = h.animals.spawn(4.5, 9, 6.5, { hearts: 2 });
        h.step(35);
        A.hold('mushi', 1);
        A.aim(w2);
        A.tap();
        h.step(h.settings.get('animalReactTicks') + 60);
        out.carryHintSeen = A.events('hint').some((e: any) => e.hint === 'carryHint');
        return out;
      });
      expect(r.wild.hint, `${w}x${hgt}`).toBe('carryWild');
      expect(r.wild.chip.bare).toEqual([]);
      expect(r.wild.over).toBeLessThanOrEqual(0.5);
      expect(r.carryHintSeen).toBe(true);
    }
  });
});
