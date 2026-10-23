import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * GOLD-1 E2E（docs/design/GOLD-1.md 版 1.2 §6 の 【E2E】: AC16・AC17・AC18・AC19。AC20 の 合図の 文は AC20b、パネルの はばは e2e/ui-gate.spec.ts）。
 * 実装の 前に 書いた テスト（落ちるのが 正しい）。数・向き・座標は 決め打ちせず、設定と 窓口（`animals.natsukiView(id)`・`animals.list()`・
 * `craft.info()` など）に 聞く。時間（ms）では 待たず、ゲームの ステップで 進める。
 * 窓口は 仕様 §6 の 名前: `animals.list()` の 行と `animals.spawn` の opts に `natsuki`・`natsukiBugWait`・`natsukiPetWait`・`natsukiDecayLeft`、
 * パネルの 状態 `animals.natsukiView(id)`（`shown`・`hearts`・`gold`・`bugReady`・`petReady`）。
 * まち（5 分）は LIVE-1・LIVE-2 の テストの 邪魔に ならないよう `A.base()` が 0 に する。まち そのものを 見る ときは `A.realWait()`（e2e/helpers/animals.ts）。
 */
test.describe('GOLD-1 金の そうび・なかよし・はらぱんみみず', () => {
  // 18,000 ステップを 進める テストが ある（SwiftShader の 3 並列で 重い）
  test.describe.configure({ timeout: 240_000 });

  test('AC16 通し（金の そうび）: そだてた マッチョ（natsuki 71）が むし → 60 ステップ目に すばこに 金（goldChance 1）→ あつめて かまどで 焼く → kin 1 → kin 2・log 1 で kin_katana → 実績 gold.first.1・rarity.star5.1・説明の 表 たたく つよさ 5・たいきゅう 500', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      h.settings.set('animalEggChance', 1);
      h.settings.set('goldBaseRaised', 0.5);
      h.settings.set('goldCap', 0.5);
      const out: any = { mul: h.settings.get('goldMachoMul'), delay: h.settings.get('animalEggDelay') };
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const id = A.kid(c, { stage: 'adult', breed: 'macho', raised: true, natsuki: 71 });
      out.row = (() => {
        const a = A.one(id);
        return a ? { natsuki: a.natsuki, breed: a.breed, raised: a.raised } : null;
      })();
      h.player.set({ position: { x: c.x + 0.5 - 1.5, y: 9, z: c.z + 0.5 }, yaw: 90 });
      A.hold('mushi', 5);
      h.animals.events();
      A.aim(id);
      A.tap();
      let goldAt = -1;
      for (let i = 1; i <= out.delay + 3; i++) {
        h.step(1);
        if (goldAt < 0 && A.cinfo(cid).nest.gold >= 1) goldAt = i;
      }
      out.goldAt = goldAt;
      out.eggEv = A.events('egg').map((e: any) => ({ gold: e.gold }));
      out.nest = { ...A.cinfo(cid).nest };
      // あつめる（さくを 外から 右クリック）
      h.animals.events();
      A.collect(c);
      out.tamago = h.inventory.count('kin_tamago');
      out.egg = h.inventory.count('egg');
      out.nestAfter = { ...A.cinfo(cid).nest };
      // かまどで 焼く
      h.world.setBlock(30, 9, 30, 'furnace');
      h.step(2);
      h.inventory.add('coal_ore', 1);
      h.craft.openFurnace(30, 9, 30);
      if (!h.inventory.get().open) {
        h.input.press('toggleInventory');
        h.input.release('toggleInventory');
      }
      h.step(4);
      const l = h.furnace.list().find((x: any) => x.id === 'kin');
      out.canBake = l ? { canBake: l.canBake, fuelOk: l.fuelOk } : null;
      const click = h.furnace.click('kin');
      out.click = click?.ok ?? false;
      h.step(70); // bakeTicks 60
      out.kin = h.inventory.count('kin');
      out.tamagoLeft = h.inventory.count('kin_tamago');
      // テストで kin を 1 つ・log を 1 つ 足して kin_katana（kin 2・log 1）
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(3);
      h.inventory.add('kin', 1);
      h.inventory.add('log', 1);
      if (!h.inventory.get().open) {
        h.input.press('toggleInventory');
        h.input.release('toggleInventory');
      }
      h.step(4);
      out.kin2 = h.inventory.count('kin');
      let made = h.craft.tileClick('kin_katana');
      if (made?.action === 'select' && made.ok) made = h.craft.tileClick('kin_katana'); // 1 回目が えらぶ だけの ときは もう 1 回
      h.step(3);
      out.made = made?.ok ?? false;
      out.katana = h.inventory.count('kin_katana');
      out.kinLeft = h.inventory.count('kin');
      out.logLeft = h.inventory.count('log');
      out.firstGold = A.unlocked('gold.first.1');
      out.star5 = A.unlocked('rarity.star5.1');
      out.kinKinds = A.stat('craft:kinKinds');
      out.rarity = h.rarity.of('kin_katana')?.id;
      const info = h.craft.info('kin_katana');
      out.stats = (info?.stats ?? []).map((s: any) => ({ label: s.label, value: s.value }));
      return out;
    });
    expect(r.mul, '上限の あとに かける 倍（goldMachoMul）').toBe(2);
    expect(r.row).toEqual({ natsuki: 71, breed: 'macho', raised: true });
    expect(r.delay, 'たまごを うむまで 60 ステップ').toBe(60);
    expect(r.goldAt, 'あげて 60 ステップ目ごろ（右クリックの 2 ステップぶん まえ）に すばこへ 金').toBeGreaterThanOrEqual(r.delay - 4);
    expect(r.goldAt).toBeLessThanOrEqual(r.delay + 2);
    expect(r.eggEv, 'goldChance が 1（0.5 × 2）なので 金').toEqual([{ gold: true }]);
    expect(r.nest).toMatchObject({ egg: 0, gold: 1 });
    expect(r.tamago).toBe(1);
    expect(r.egg).toBe(0);
    expect(r.nestAfter).toMatchObject({ egg: 0, gold: 0 });
    expect(r.canBake).toEqual({ canBake: true, fuelOk: true });
    expect(r.click).toBe(true);
    expect(r.kin, 'かまどで kin 1').toBe(1);
    expect(r.tamagoLeft, 'kin_tamago は 0').toBe(0);
    expect(r.kin2).toBe(2);
    expect(r.made).toBe(true);
    expect(r.katana).toBe(1);
    expect(r.kinLeft, 'kin 2 を つかう').toBe(0);
    expect(r.logLeft, 'log 1 を つかう').toBe(0);
    expect(r.firstGold).toBe(true);
    expect(r.star5).toBe(true);
    expect(r.kinKinds).toBe(1);
    expect(r.rarity).toBe('epic');
    expect(r.stats).toEqual(expect.arrayContaining([{ label: 'たたく つよさ', value: 5 }, { label: 'たいきゅう', value: 500 }]));
  });

  test('AC17 通し（なかよし）: なかまの 大人（natsuki 0）を ねらう とパネル（やせい・ひよこは 出ない）・むし → 15・まち中・60 ステップ後に なでる → 25・18,000 ステップ後に むし → 40・はらぱんみみず → 100 と きんいろ。70 は gold false・71 は true', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      A.realWait(); // まち（5 分）そのものを 見る
      const out: any = {
        bugWaitSet: h.settings.get('natsukiBugWaitTicks'),
        petWaitSet: h.settings.get('natsukiPetWaitTicks'),
        decaySet: h.settings.get('natsukiDecayTicks'),
      };
      // ---- 出る・出ない（ひよこ・やせい）と 70 / 71 の きんいろ
      const chick = A.friend(6.5, 6.5, { stage: 'chick' });
      out.chickAimed = A.aim(chick);
      out.chickShown = A.view(chick)?.shown;
      h.animals.clear();
      const wild = A.chicken(6.5, 6.5, { stage: 'adult' });
      out.wildAimed = A.aim(wild);
      out.wildShown = A.view(wild)?.shown;
      h.animals.clear();
      const a70 = A.friend(10.5, 10.5, { natsuki: 70 });
      const a71 = A.friend(14.5, 10.5, { natsuki: 71 });
      out.gold70 = A.view(a70);
      out.gold71 = A.view(a71);
      h.animals.clear();
      // ---- 通し
      const id = A.friend(4.5, 6.5, { natsuki: 0, follow: A.full() * 4 }); // 18,000 ステップ すすめても follow が 切れない ように 多めに
      out.start = (() => {
        const a = A.one(id);
        return { natsuki: a.natsuki, bugWait: a.natsukiBugWait, petWait: a.natsukiPetWait, decayLeft: a.natsukiDecayLeft };
      })();
      out.aimed = A.stand(id);
      out.view0 = A.view(id);
      out.html0 = (document.querySelector('#natsuki-panel') as HTMLElement | null)?.hidden ?? 'none';
      A.hold('mushi', 5);
      A.stand(id);
      h.animals.events();
      A.tap();
      h.step(5);
      out.afterBug = (() => {
        const a = A.one(id);
        return { natsuki: a.natsuki, bugWait: a.natsukiBugWait, petWait: a.natsukiPetWait };
      })();
      out.viewBug = A.view(id);
      out.mushi1 = h.inventory.count('mushi');
      // 60 ステップ後に なでる（べつべつの まち）
      h.step(55);
      h.inventory.clear();
      A.stand(id);
      A.tap();
      h.step(5);
      out.afterPet = (() => {
        const a = A.one(id);
        return { natsuki: a.natsuki, petWait: a.natsukiPetWait };
      })();
      out.viewPet = A.view(id);
      // むしの まちが あける まで すすめる（まち中に あげても たべない）
      A.hold('mushi', 5);
      A.stand(id);
      h.animals.events();
      A.tap();
      out.waitHint = h.animals.lastHint();
      out.mushiWait = h.inventory.count('mushi');
      out.natsukiWait = A.one(id).natsuki;
      let left = A.one(id).natsukiBugWait;
      while (left > 0) {
        const n = Math.min(left, 3000);
        h.step(n);
        left -= n;
      }
      h.step(3);
      out.bugWaitEnd = A.one(id).natsukiBugWait;
      out.viewReady = A.view(id);
      A.hold('mushi', 5);
      A.stand(id);
      A.tap();
      h.step(5);
      out.followLeft = A.one(id).follow;
      out.afterBug2 = A.one(id).natsuki;
      out.mushi2 = h.inventory.count('mushi');
      // はらぱんみみず
      A.hold('harapan_mimizu', 2);
      A.stand(id);
      h.animals.events();
      A.tap();
      h.step(5);
      out.harapan = h.inventory.count('harapan_mimizu');
      out.afterHarapan = A.one(id).natsuki;
      out.viewFull = A.view(id);
      out.sfx = A.sfx();
      return out;
    });
    expect(r.bugWaitSet, '設定 natsukiBugWaitTicks').toBe(18000);
    expect(r.petWaitSet, '設定 natsukiPetWaitTicks').toBe(18000);
    expect(r.decaySet, '設定 natsukiDecayTicks').toBe(36000);
    expect(r.chickAimed && r.chickShown === false, 'ひよこ には 出ない').toBe(true);
    expect(r.wildAimed && r.wildShown === false, 'やせい には 出ない').toBe(true);
    expect(r.gold70, 'natsuki 70 は こえて いない').toMatchObject({ gold: false, hearts: 7 });
    expect(r.gold71, 'natsuki 71 は きんいろ').toMatchObject({ gold: true, hearts: 7 });
    expect(r.start).toEqual({ natsuki: 0, bugWait: 0, petWait: 0, decayLeft: 36000 });
    expect(r.aimed).toBe(true);
    expect(r.view0).toMatchObject({ shown: true, hearts: 0, gold: false, bugReady: true, petReady: true });
    expect(r.html0, 'パネルの DOM #natsuki-panel が 出ている（仮の 名前。ui-gate と 同じ）').toBe(false);
    expect(r.afterBug).toEqual({ natsuki: 15, bugWait: 18000, petWait: 0 });
    expect(r.viewBug).toMatchObject({ shown: true, hearts: 1, bugReady: false, petReady: true });
    expect(r.mushi1).toBe(4);
    expect(r.afterPet.natsuki).toBe(25);
    expect(r.afterPet.petWait).toBe(18000);
    expect(r.viewPet).toMatchObject({ hearts: 2, bugReady: false, petReady: false });
    expect(r.waitHint, 'まち中に むし').toBe('natsukiWait');
    expect(r.mushiWait, 'むしは へらない').toBe(5);
    expect(r.natsukiWait, 'まち中は ふえない').toBe(25);
    expect(r.bugWaitEnd, 'まちが あけた').toBe(0);
    expect(r.viewReady.bugReady).toBe(true);
    expect(r.followLeft, '18,000 ステップ後も ついてくる（follow が のこっている）').toBeGreaterThan(0);
    expect(r.afterBug2, '25 + 15。へる（−5）は まだ（のこり 36,000 から 18,060 へる だけ）').toBe(40);
    expect(r.mushi2).toBe(4);
    expect(r.harapan, 'はらぱんみみず 1 へる').toBe(1);
    expect(r.afterHarapan).toBe(100);
    expect(r.viewFull).toMatchObject({ shown: true, hearts: 10, gold: true });
    expect(r.sfx, '新しい 音').toContain('harapanFeed');
  });

  test('AC18 ドロップ: harapanYokai 1 で y 143 の 妖怪を たおす → おとしもの harapan_mimizu（epic）。ひろう → 実績 obtain.harapan_mimizu.1。y 144（地上）の 妖怪では 出ない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(24);
      h.settings.set('harapanYokai', 1);
      const arena = (window as any).__arena;
      const out: any = { under: h.settings.get('harapanUnderY'), rarity: h.rarity.of('harapan_mimizu')?.id };
      h.inventory.clear(); // すで（体力 1 に して あるので 1 回で たおれる）
      h.step(1);
      const kill = (floorY: number, x: number) => {
        arena.floor(x - 4, 30, x + 4, 50, { y: floorY, air: 8 });
        const y = floorY + 1;
        const id = h.yokai.spawn('karakasa', x + 0.5, y, 40.5, { ai: false, yawDeg: 270 });
        h.yokai.setHp(id, 1);
        h.yokai.events();
        let aimed = false;
        for (let i = 0; i < 6 && !aimed; i++) {
          h.player.set({ position: { x: x - 1.5, y, z: 40.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
          h.step(1);
          const eye = h.camera.get().eye;
          aimed = h.yokai.raycast(eye, { x: 1, y: 0, z: 0 }, 4)?.id === id;
        }
        const ev: any[] = [];
        h.input.press('primary');
        for (let i = 0; i < 120; i++) {
          h.step(1);
          ev.push(...h.yokai.events());
          if (ev.some((e) => e.type === 'defeat')) break;
        }
        h.input.release('primary');
        h.step(5);
        ev.push(...h.yokai.events());
        return {
          aimed,
          defeat: ev.filter((e) => e.type === 'defeat').length,
          harapan: ev.filter((e) => e.type === 'drop' && e.item === 'harapan_mimizu').map((e) => e.count),
        };
      };
      out.deep = kill((out.under as number) - 2, 12); // 足もと y 143（地下）
      out.bag = A.bags('harapan_mimizu').map((b: any) => ({ rarity: b.rarity, item: b.slots[0].item, count: b.slots[0].count }));
      const pos = A.bags('harapan_mimizu')[0]?.position ?? null;
      out.ground = kill((out.under as number) - 1, 32); // 足もと y 144（地上）
      out.bagAfterGround = A.bags('harapan_mimizu').length;
      // ひろう
      if (pos) {
        h.player.set({ position: { x: pos.x, y: pos.y, z: pos.z }, velocity: { x: 0, y: 0, z: 0 } });
        h.step(120);
      }
      out.inv = h.inventory.count('harapan_mimizu');
      out.unlocked = A.unlocked('obtain.harapan_mimizu.1');
      out.stat = A.stat('obtain:harapan_mimizu');
      return out;
    });
    expect(r.under, '地下の きめかた（SEA_Y 144 より 下）').toBe(144);
    expect(r.rarity).toBe('epic');
    expect(r.deep.aimed && r.deep.defeat, '地下の 妖怪を たおした').toBe(1);
    expect(r.deep.harapan, '1 こ').toEqual([1]);
    expect(r.bag).toEqual([{ rarity: 'epic', item: 'harapan_mimizu', count: 1 }]);
    expect(r.ground.aimed && r.ground.defeat, '地上の 妖怪も たおした').toBe(1);
    expect(r.ground.harapan, '地上は 0').toEqual([]);
    expect(r.bagAfterGround).toBe(1);
    expect(r.inv, 'ひろえた').toBe(1);
    expect(r.unlocked).toBe(true);
    expect(r.stat).toBe(1);
  });

  test('AC19 金は なつき度 71 以上: goldBaseWild 1・goldCap 1 でも natsuki 0 と 70 では 金が 出ない（ふつうの たまご）。71 では 出る', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.settings.set('animalEggChance', 1);
      h.settings.set('goldBaseWild', 1);
      h.settings.set('goldCap', 1);
      const delay = h.settings.get('animalEggDelay');
      const rows: any[] = [];
      for (const natsuki of [0, 70, 71]) {
        h.animals.clear();
        h.animals.events();
        const id = A.friend(4.5, 6.5, { natsuki });
        A.hold('mushi', 3);
        A.stand(id);
        A.tap();
        h.step(delay + 10);
        const egg = A.events('egg');
        rows.push({ natsuki, eggs: egg.map((e: any) => !!e.gold), gold: A.bags('kin_tamago').length });
      }
      return rows;
    });
    expect(r[0]).toMatchObject({ natsuki: 0, eggs: [false] });
    expect(r[1]).toMatchObject({ natsuki: 70, eggs: [false] });
    expect(r[2]).toMatchObject({ natsuki: 71, eggs: [true] });
    expect(r[0].gold).toBe(0);
    expect(r[1].gold, 'これまでの 袋を ふくめて 0 のまま').toBe(0);
    expect(r[2].gold).toBe(1);
  });

  test('AC20b 合図の 文: natsukiWait・harapanFull・harapanFriend は ルビなしの 漢字 0・3 つの 大きさで はみ出し 0px・2 行まで・600 ステップに 1 回まで', async ({ page }) => {
    await openAnimals(page);
    const sizes = [[1280, 800], [1440, 900], [1024, 700]] as const;
    const want: Record<string, string> = {
      natsukiWait: 'もうすこしまってね',
      harapanFull: 'もうなかよしいっぱいだよ',
      harapanFriend: 'なかまのおとなにあげよう',
    };
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      await openAnimals(page);
      const rows = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const A = (window as any).__A;
        A.base(40);
        A.realWait();
        const out: any[] = [];
        const grab = (name: string) => {
          h.step(2);
          const el = document.querySelector('#animal-hint') as HTMLElement | null;
          const b = el?.getBoundingClientRect();
          const cs = el ? getComputedStyle(el) : null;
          let lines = 0;
          if (el && cs) {
            const tops: number[] = [];
            const wk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let n: Node | null;
            while ((n = wk.nextNode())) {
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
          });
        };
        // natsukiWait: まち中の 子に むし
        let id = A.friend(4.5, 6.5, { natsuki: 10, natsukiBugWait: 9000 });
        A.hold('mushi', 3);
        A.stand(id);
        A.tap();
        grab('natsukiWait');
        const again = (() => {
          h.animals.events();
          h.step(10); // 600 ステップに 1 回まで: すぐ もう 1 回 しても 合図は 出直さない
          A.tap();
          return A.events('hint').filter((e: any) => e.hint === 'natsukiWait').length;
        })();
        out.push({ name: 'natsukiWaitAgain', again });
        // harapanFull: なつき度 100
        h.animals.clear();
        id = A.friend(4.5, 6.5, { natsuki: 100 });
        A.hold('harapan_mimizu', 2);
        A.stand(id);
        A.tap();
        grab('harapanFull');
        // harapanFriend: ひよこ
        h.animals.clear();
        id = A.friend(4.5, 6.5, { stage: 'chick' });
        A.hold('harapan_mimizu', 2);
        A.stand(id);
        A.tap();
        grab('harapanFriend');
        return out;
      });
      for (const row of rows) {
        if (row.name === 'natsukiWaitAgain') {
          expect(row.again, `${w}x${hgt} 600 ステップに 1 回まで`).toBe(0);
          continue;
        }
        const tag = `${w}x${hgt} ${row.name}`;
        expect(row.hint, tag).toBe(row.name);
        expect(row.chip.text.replace(/\s+/g, ''), `${tag} 文`).toContain(want[row.name]);
        expect(row.chip.bare, `${tag} 漢字`).toEqual([]);
        expect(row.over, `${tag} はみ出し`).toBeLessThanOrEqual(0.5);
        expect(row.lines, `${tag} 2 行まで`).toBeLessThanOrEqual(2);
      }
    }
  });
});
