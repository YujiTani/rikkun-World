import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-1 畜産（にわとり）の E2E その 1（docs/design/LIVE-1.md 版 3.2 §6）: AC1 出てくる 30 ステップ・AC2 であう・AC4 見る・AC5 たたけない・
 * AC11 むしを あげる／おなかいっぱい／なかまに なる・AC12 やさいは あげられない／なかまの はなした 瞬間・AC14 なかま いっぱい・AC27 合図の 文字。
 * （版 2 の AC6〜AC9 は やさいで なかよく なる 動きなので、むしの AC11・AC12・AC14 に おきかえた）
 * 数は 設定（`settings.get`）から 読み、ねらいは `animals.target()` に 聞いて 確かめる。
 * 台帳 G6 の 決め: 出てくる 30 ステップ（`appear`）の あいだは ねらえない（`target()` null）・右クリックは 何も 起きない。
 */
test.describe('LIVE-1 にわとり（であう・あげる・たたけない）', () => {
  test('AC2 であう: ひる・はじまりの 場所で 3,600 ステップ → くさの 上の やせい（3 わ 以下・出てくる 30 ステップ）', async ({ page }) => {
    await openAnimals(page); // ?nosave=1 の まま = 毎回 同じ シード・はじまりの 場所（はらっぱ）
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      h.animals.clear();
      h.settings.set('animalAutoSpawn', true);
      h.time.set(1000); // 台帳 G3: ひるの はじまり（ひるは 54,000 ステップ。3,600 の あいだ ひるの まま）
      h.step(2);
      const out: any = { maxWild: 0, appear: null as any, first: null as any };
      for (let i = 0; i < 3600; i++) {
        h.step(1);
        const wild = h.animals.list().filter((a: any) => !a.friend);
        out.maxWild = Math.max(out.maxWild, wild.length);
        if (!out.first && wild.length > 0) {
          out.first = { tick: i, ...wild[0] };
          out.appear = wild[0].state;
        }
      }
      const wild = h.animals.list().filter((a: any) => !a.friend);
      out.n = wild.length;
      out.rows = wild.map((a: any) => ({
        id: a.id,
        below: h.world.getBlock(Math.floor(a.x), Math.floor(a.y) - 1, Math.floor(a.z)),
        kind: h.biome.at(a.x, a.z).kind,
      }));
      out.spawnEvents = h.animals.events().filter((e: any) => e.type === 'spawn').length;
      return out;
    });
    expect(r.n, 'やせいが 1 わ 以上').toBeGreaterThanOrEqual(1);
    expect(r.maxWild, 'やせいは いつも 3 以下').toBeLessThanOrEqual(3);
    expect(r.spawnEvents).toBeGreaterThanOrEqual(1);
    for (const row of r.rows) {
      expect(row.below, '足もとは くさ').toBe('grass');
      expect(['harappa', 'hana']).toContain(row.kind);
    }
    expect(r.appear, '出た ばかりは appear').toBe('appear');
  });

  test('AC1 AC2b 出てくる 30 ステップの あいだは ねらえない・30 ステップで appear が おわる（G6）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('animalSpawnMinDist', 3);
      h.settings.set('animalSpawnMaxDist', 8);
      let id: number | null = null;
      for (let i = 0; i < 40 && id === null; i++) id = h.animals.trySpawn();
      if (id === null) return { id };
      const out: any = { id, state0: A.one(id).state };
      A.aim(id);
      out.targetDuring = h.animals.target();
      A.hold('mushi', 3);
      A.tap();
      out.heartsDuring = A.one(id).hearts;
      out.mushiDuring = h.inventory.count('mushi');
      h.step(40);
      out.stateAfter = A.one(id).state;
      return out;
    });
    expect(r.id, 'trySpawn で 出る').not.toBeNull();
    expect(r.state0).toBe('appear');
    expect(r.targetDuring, 'appear の あいだは ねらえない').toBeNull();
    expect(r.heartsDuring).toBe(0);
    expect(r.mushiDuring, 'むしは へらない（ねらえず うしろへ 通る）').toBe(3);
    expect(r.stateAfter).not.toBe('appear');
  });

  test('AC4 見る: 5 マスで 30 ステップ以内に こっちを 見る・止まる・8 マスで うろうろ に もどる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const look = h.settings.get('animalLookDist');
      const id = h.animals.spawn(12.5, 9, 6.5);
      h.player.set({ position: { x: 12.5 - (look - 1), y: 9, z: 6.5 }, yaw: 90, pitch: 0 });
      h.step(30);
      const a = A.one(id);
      const out: any = { look, d: A.dist(a, h.player.get().position), looking: a.lookingAtPlayer, state: a.state };
      h.step(60);
      const b = A.one(id);
      out.drift = Math.hypot(b.x - a.x, b.z - a.z);
      h.player.set({ position: { x: 12.5 - (look + 2), y: 9, z: 6.5 } });
      h.step(30);
      out.farLooking = A.one(id).lookingAtPlayer;
      return out;
    });
    expect(r.d).toBeLessThanOrEqual(r.look);
    expect(r.looking).toBe(true);
    expect(r.state).toBe('look');
    expect(r.drift).toBeLessThanOrEqual(0.05);
    expect(r.farLooking).toBe(false);
  });

  test('AC5 たたけない: すで・つるはし・刀・や で 当たらない・うしろの ブロックは ほれる・すりぬけ・妖怪は ねらわない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      // にわとり (4.5, 9, 6.5) の すぐ うしろ（東）に 土の かべ（ねらいの 線は 下向きで 床に 当たる 前に とどく よう 近くに 置く）
      for (let y = 9; y <= 12; y++) for (let z = 5; z <= 8; z++) h.world.setBlock(5, y, z, 'dirt');
      h.step(2);
      const id = A.chicken(4.5, 6.5);
      const out: any = { aimed: A.aim(id) };
      const p0 = A.one(id);
      out.hits = {};
      for (const item of [null, 'wood_pickaxe', 'katana']) {
        if (item) A.hold(item);
        else h.inventory.clear();
        for (let i = 0; i < 10; i++) A.tap('primary');
        out.hits[item ?? 'hand'] = { exists: !!A.one(id) };
      }
      A.hold('yumi');
      h.inventory.add('ya', 10);
      for (let i = 0; i < 3; i++) {
        h.input.press('secondary');
        h.step(60);
        h.input.release('secondary');
        h.step(2);
      }
      const p1 = A.one(id);
      out.drift = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      out.exists = !!p1;
      out.hurt = h.yokai.events().filter((e: any) => e.type === 'hurt').length;
      // 左クリックの ねらいに 入らない: ブロックを ねらう
      h.inventory.clear();
      A.aim(id);
      const t = h.target.get();
      out.targetBlock = t ? { x: t.block.x, y: t.block.y, z: t.block.z } : null;
      out.wallBefore = h.world.getBlock(5, 10, 6);
      h.input.press('primary');
      h.step(200); // ほり終わる（ready）まで
      h.input.release('primary');
      h.step(2);
      h.input.press('primary'); // 押し直すと こわれる（M2 AC4）
      h.step(20);
      h.input.release('primary');
      h.step(2);
      out.wallAfter = h.world.getBlock(out.targetBlock.x, out.targetBlock.y, out.targetBlock.z);
      return out;
    });
    expect(r.aimed).toBe(true);
    for (const k of Object.keys(r.hits)) expect(r.hits[k].exists, k).toBe(true);
    expect(r.exists).toBe(true);
    expect(r.drift).toBeLessThanOrEqual(0.1);
    expect(r.hurt).toBe(0);
    expect(r.targetBlock, '左クリックは にわとりの うしろの ブロックを ねらう').not.toBeNull();
    expect(r.targetBlock.x).toBe(5);
    expect(r.wallAfter, 'ねらった ブロックが こわれた').toBe('air');
  });

  test('AC5b すりぬける・妖怪は ねらわない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const id = h.animals.spawn(6.5, 9, 6.5);
      h.player.set({ position: { x: 3.5, y: 9, z: 6.5 }, yaw: 90, pitch: 0 });
      h.input.press('moveForward');
      h.step(90);
      h.input.release('moveForward');
      const out: any = { px: h.player.get().position.x, cx: A.one(id).x };
      // 妖怪を にわとりの 横に（プレイヤーは はなれた 所）
      h.input.releaseAll();
      h.player.set({ position: { x: 20.5, y: 9, z: 20.5 } });
      const c = A.one(id);
      h.yokai.spawn('karakasa', c.x + 1, 9, c.z, {});
      h.step(600);
      out.exists = h.animals.list().some((a: any) => a.id === id);
      out.removed = h.animals.events().filter((e: any) => e.type === 'remove' && e.id === id).length;
      return out;
    });
    expect(r.px, 'プレイヤーは にわとりを とおりぬけた').toBeGreaterThan(r.cx + 0.5);
    expect(r.exists).toBe(true);
    expect(r.removed).toBe(0);
  });

  test('AC11 あげる: やせい+むし 5 → 4・ハート 1・feed(mushi)・fullLeft。おなかいっぱいは fullHint・animalFull・むし 4 のまま。600 後 ハート 2。3 つ目で なかま(follow まんたん)', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const id = A.chicken(4.5, 6.5);
      const react = h.settings.get('animalReactTicks');
      const fullTicks = h.settings.get('animalFullTicks');
      const out: any = { react, fullTicks, aimed: A.aim(id) };
      A.hold('mushi', 5);
      const f0 = A.stat('feed:*');
      A.aim(id);
      // やせいは 押した 瞬間に あげる
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      out.mushi1 = h.inventory.count('mushi');
      out.hearts1 = A.one(id).hearts;
      out.feedEv = A.events('feed');
      out.fullLeft1 = A.one(id).fullLeft;
      out.feedStat = A.stat('feed:*') - f0;
      out.unlockFeed = A.unlocked('animal.feed.1');
      // 押して 40 ステップ目（ついばむ 30 のあと）に もう 1 回 → おなかいっぱい
      h.step(38);
      A.aim(id);
      h.audio.sfx();
      A.tap();
      out.mushiFull = h.inventory.count('mushi');
      out.heartsFull = A.one(id).hearts;
      out.hintFull = h.animals.lastHint();
      out.fullEv = A.events('full').length;
      out.sfxFull = A.sfx().includes('animalFull');
      // 600 ステップ たってから → ハート 2
      h.step(fullTicks + 5);
      A.aim(id);
      A.tap();
      out.mushi2 = h.inventory.count('mushi');
      out.hearts2 = A.one(id).hearts;
      // 3 つ目: 押して 30 目に なかま
      h.step(fullTicks + 5);
      A.aim(id);
      h.animals.events();
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      let at = -1;
      for (let i = 2; i <= react + 5 && at < 0; i++) {
        h.step(1);
        if (A.one(id).friend) at = i;
      }
      out.friendAt = at;
      const c = A.one(id);
      out.friend = c.friend;
      out.follow = c.follow;
      out.friendEv = A.events('friend');
      out.friendStat = A.stat('friend:*');
      out.unlockFriend = A.unlocked('animal.friend.1');
      out.modalSeen = !!(window as any).__modalSeen;
      return out;
    });
    expect(r.aimed).toBe(true);
    expect(r.mushi1, 'むしは 押した ステップに へる').toBe(4);
    expect(r.hearts1).toBe(1);
    expect(r.feedEv).toHaveLength(1);
    expect(r.feedEv[0]).toMatchObject({ item: 'mushi' });
    expect(r.fullLeft1).toBeGreaterThanOrEqual(r.fullTicks - 2);
    expect(r.fullLeft1).toBeLessThanOrEqual(r.fullTicks);
    expect(r.feedStat).toBe(1);
    expect(r.unlockFeed).toBe(true);
    expect(r.mushiFull, 'おなかいっぱいの あいだは むしが へらない').toBe(4);
    expect(r.heartsFull).toBe(1);
    expect(r.hintFull).toBe('fullHint');
    expect(r.fullEv).toBe(1);
    expect(r.sfxFull).toBe(true);
    expect(r.mushi2).toBe(3);
    expect(r.hearts2).toBe(2);
    expect(r.friendAt, '3 つ目を たべおわる 30 ステップ目').toBeGreaterThanOrEqual(r.react - 2);
    expect(r.friendAt).toBeLessThanOrEqual(r.react + 2);
    expect(r.friend).toBe(true);
    expect(r.follow, 'なかまに なると ついてくる 時間は まんたん').toBeGreaterThanOrEqual(18000 - 5);
    expect(r.friendEv).toHaveLength(1);
    expect(r.friendEv[0]).toMatchObject({ first: true });
    expect(r.friendStat).toBe(1);
    expect(r.unlockFriend).toBe(true);
    expect(r.modalSeen, 'おめでとう画面が 出た').toBe(true);
  });

  test('AC11b お祝い: はじめては confetti・burst 8・friendFirst・carryHint、2 わ目は confetti 0・burst 5・friend', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const react = h.settings.get('animalReactTicks');
      const one = (x: number, z: number) => {
        const id = h.animals.spawn(x, 9, z, { hearts: 2 });
        h.step(35);
        A.aim(id);
        A.hold('mushi', 3);
        h.animals.fxReset();
        h.audio.sfx();
        A.tap();
        h.step(react + 2);
        return { fx: h.animals.fx(), sfx: A.sfx(), friend: A.one(id).friend, id };
      };
      const first = one(4.5, 6.5);
      h.step(60);
      const carryHint = A.events('hint').some((e: any) => e.hint === 'carryHint');
      h.player.set({ position: { x: 2.5, y: 9, z: 14.5 } });
      (window as any).__aim.standForS(2.5, 14.5, 90, -20, 9);
      const second = one(4.5, 14.5);
      return { first, second, carryHint };
    });
    expect(r.first.friend).toBe(true);
    expect(r.first.fx.confetti).toBeGreaterThan(0);
    expect(r.first.fx.burst).toBe(8);
    expect(r.first.sfx).toContain('friendFirst');
    expect(r.carryHint, 'はじめての お祝いが おわると carryHint').toBe(true);
    expect(r.second.friend).toBe(true);
    expect(r.second.fx.confetti).toBe(0);
    expect(r.second.fx.burst).toBe(5);
    expect(r.second.sfx).toContain('friend');
    expect(r.second.sfx).not.toContain('friendFirst');
  });

  test.fixme('AC11c 動きの 強さ 0 で はじめて → confetti 0・ハート 1 と 音（「動きの強さ」設定が まだ ない。できたら 書く）', async () => {});

  test('AC12 やさいは あげられない: やせい+トマト → pet・feedHint（むしの 文）。なかまは はなした 瞬間に pet／feed', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const out: any = {};
      // やせい + トマト
      const w = A.chicken(4.5, 6.5);
      A.hold('tomato', 3);
      A.aim(w);
      h.animals.events();
      h.audio.sfx();
      A.tap();
      out.wildTomato = h.inventory.count('tomato');
      out.wildHearts = A.one(w).hearts;
      out.wildPet = A.events('pet').length;
      out.wildHint = h.animals.lastHint();
      out.chip = A.chip();
      out.dom = document.body.innerText;
      h.animals.clear();
      // なかま + トマト: 押して 5 ステップ後に はなす
      const f = A.friend(4.5, 6.5);
      A.hold('tomato', 3);
      A.aim(f);
      h.animals.events();
      h.input.press('secondary');
      h.step(5);
      out.holdPet = A.events('pet').length;
      h.input.release('secondary');
      h.step(1);
      out.relPet = A.events('pet').length;
      out.tomatoFriend = h.inventory.count('tomato');
      h.step(125);
      out.eggFromPet = A.events('egg').length;
      // なかま + むし: 押して 5 ステップ後に はなす
      A.hold('mushi', 3);
      A.aim(f);
      h.animals.events();
      h.input.press('secondary');
      h.step(5);
      out.holdMushi = h.inventory.count('mushi');
      out.holdFeed = A.events('feed').length;
      h.input.release('secondary');
      h.step(1);
      out.relMushi = h.inventory.count('mushi');
      out.relFeed = A.events('feed').length;
      return out;
    });
    expect(r.wildTomato, 'トマトは へらない').toBe(3);
    expect(r.wildHearts).toBe(0);
    expect(r.wildPet).toBe(1);
    expect(r.wildHint).toBe('feedHint');
    expect(r.chip.bare, 'チップの 漢字は ルビの 中').toEqual([]);
    expect(r.dom).toContain('むし');
    expect(r.dom).toContain('あげよう');
    expect(r.dom).not.toContain('やさい を もって');
    expect(r.holdPet, '押している あいだは まだ 何も 起きない').toBe(0);
    expect(r.relPet, 'はなした ステップに pet').toBe(1);
    expect(r.tomatoFriend).toBe(3);
    expect(r.eggFromPet, 'なでても たまごは 出ない').toBe(0);
    expect(r.holdMushi, '押した ステップでは むしは へらない').toBe(3);
    expect(r.holdFeed).toBe(0);
    expect(r.relMushi, 'はなした ステップに むし −1').toBe(2);
    expect(r.relFeed).toBe(1);
  });

  test('AC13 照準の 下の 案内: やせい+むし=あげる、おなかいっぱい=まってね、なかま+すで=なでる。実際に 起きる ことと 同じ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const wild = A.chicken(4.5, 6.5);
      const out: any = {};
      A.hold('mushi', 5);
      A.aim(wild);
      out.feed = h.hud.actionHint().right;
      A.tap();
      out.fedHearts = A.one(wild).hearts;
      // おなかいっぱい
      h.step(40);
      A.aim(wild);
      out.full = h.hud.actionHint().right;
      A.tap();
      out.mushiAfterFull = h.inventory.count('mushi');
      h.animals.clear();
      const fr = A.friend(4.5, 6.5);
      h.inventory.clear();
      A.aim(fr);
      out.petHand = h.hud.actionHint().right;
      h.animals.events();
      A.tap();
      out.petEv = A.events('pet').length;
      return out;
    });
    expect(r.feed).toMatchObject({ icon: 'mushi', word: 'あげる' });
    expect(r.fedHearts).toBe(1);
    expect(r.full).toMatchObject({ word: 'まってね' });
    expect(r.full.icon, 'あげる の 絵 ではない').not.toBe('mushi');
    expect(r.mushiAfterFull, 'まってね の とき むしは へらない').toBe(4);
    expect(r.petHand).toMatchObject({ icon: 'heart', word: 'なでる' });
    expect(r.petEv).toBe(1);
  });

  test('AC14 なかま いっぱい: 8 わ・ハート 2 + むし → たべない・むし へらず・fullLeft 0・friendFull。ハート 0 は ふつうに たべる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(30);
      const max = h.settings.get('animalFriendMax');
      for (let i = 0; i < max; i++) h.animals.spawn(2 + (i % 4), 9, 14 + Math.floor(i / 4) * 2, { friend: true, follow: 0 });
      const w = h.animals.spawn(4.5, 9, 6.5, { hearts: 2 });
      const w0 = h.animals.spawn(4.5, 9, 10.5, { hearts: 0 });
      h.step(35);
      const out: any = { max, friends: h.animals.list().filter((a: any) => a.friend).length };
      A.hold('mushi', 3);
      A.aim(w);
      h.animals.events();
      A.tap();
      h.step(35);
      out.mushi = h.inventory.count('mushi');
      out.hearts = A.one(w).hearts;
      out.friend = A.one(w).friend;
      out.fullLeft = A.one(w).fullLeft;
      out.hint = h.animals.lastHint();
      (window as any).__aim.standForS(2.5, 10.5, 90, -20, 9);
      h.step(35);
      A.hold('mushi', 3);
      A.aim(w0);
      A.tap();
      out.h0 = A.one(w0).hearts;
      return out;
    });
    expect(r.friends).toBe(r.max);
    expect(r.mushi).toBe(3);
    expect(r.hearts).toBe(2);
    expect(r.friend).toBe(false);
    expect(r.fullLeft).toBe(0);
    expect(r.hint).toBe('friendFull');
    expect(r.h0).toBe(1);
  });

  test('AC27 おなかいっぱいの チップ: 漢字は ふりがな つき・3 つの 大きさで はみ出し 0px・eggLater の 文は どこにも 無い', async ({ page }) => {
    await openAnimals(page);
    const sizes = [[1280, 800], [1440, 900], [1024, 700]] as const;
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const A = (window as any).__A;
        A.base();
        const id = A.chicken(4.5, 6.5, { fullLeft: 600 });
        A.hold('mushi', 3);
        A.aim(id);
        A.tap();
        h.step(2);
        const el = document.querySelector('#animal-hint') as HTMLElement | null;
        const b = el?.getBoundingClientRect();
        return {
          hint: h.animals.lastHint(),
          chip: A.chip(),
          over: b ? Math.max(0, b.right - innerWidth, b.bottom - innerHeight, -b.left, -b.top) : 999,
          eggLater: document.body.innerText.includes('また あした'),
        };
      });
      expect(r.hint, `${w}x${hgt}`).toBe('fullHint');
      expect(r.chip.bare).toEqual([]);
      expect(r.over, `${w}x${hgt} はみ出し`).toBeLessThanOrEqual(0.5);
      expect(r.eggLater).toBe(false);
    }
  });
});
