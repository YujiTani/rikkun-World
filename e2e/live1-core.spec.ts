import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-1 畜産（にわとり）の E2E その 1（docs/design/LIVE-1.md 版 3.2 §6）: AC1 出てくる 30 ステップ・AC2 であう・AC4 見る・AC5 たたけない・
 * AC11 むしを あげる／おなかいっぱい／なかまに なる・AC12 やさいは あげられない／なかまの はなした 瞬間・AC14 なかま いっぱい・AC27 合図の 文字。
 * （版 2 の AC6〜AC9 は やさいで なかよく なる 動きなので、むしの AC11・AC12・AC14 に おきかえた）
 * #311: 数・状態だけの 確認（AC1 AC2 AC4 AC11b AC13 AC14）は ユニットへ（src/animals/animals.test.ts・src/fx/animalFx.test.ts・src/dig/rightClick.live1.test.ts）。
 * ここには 入力→ゲーム→窓口の 通し（AC5・AC5b・AC11・AC12）と 画面の 文字（AC27）だけ 残す。
 * 数は 設定（`settings.get`）から 読み、ねらいは `animals.target()` に 聞いて 確かめる。
 * 台帳 G6 の 決め: 出てくる 30 ステップ（`appear`）の あいだは ねらえない（`target()` null）・右クリックは 何も 起きない。
 */
test.describe('LIVE-1 にわとり（であう・あげる・たたけない）', () => {
  // 3 並列の SwiftShader で 30〜60 秒かかる テストが あり、60 秒だと 時間切れに なる（期待は 変えない）
  test.describe.configure({ timeout: 150_000 });
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
