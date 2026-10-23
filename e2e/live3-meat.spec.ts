import { expect, test } from '@playwright/test';
import { openLive3 } from './helpers/live3';

/**
 * LIVE-3 E2E その 2（docs/design/LIVE-3.md 版 1.1 §2.4・§4.4・§5・§6 AC6〜AC10・AC18）: いただきます の 演出。
 * 数え方: ボタン `いただきます` を 押した 直後 ＝ 0 ステップ目。`go(n)` の あと ＝ n ステップ目（仕様 の「200 ステップ 目に 消える」）。
 * 時間(ms)では 見ない（#255）。
 */
const SAY = 'いのちをいただきます';

test.describe('LIVE-3 いただきます', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC6 通し: 押した ステップ に メニュー が とじ meatStart・state meat。80 で 一言・音・とびら closed。199 は まだ いる。200 で 消え momo_nama 2・meat・meat:* 1。220 で とびら open・一言 なし', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const { cid, c, f, ids } = L.farm(2);
      const [pick, other] = ids;
      const o: any = {};
      const door = () => A.cinfo(cid).door;
      const say = () => h.ui.meatText();
      const mm = () => h.inventory.count('momo_nama');
      const before = h.animals.list().find((a: any) => a.id === other);
      const posOther = { x: before.x, z: before.z };
      h.log.clear();
      o.m = L.choose(c, f, pick);
      o.start = A.events('meatStart');
      o.state0 = A.one(pick).state;
      o.mm0 = mm();
      o.door0 = door();
      o.say0 = say();
      L.go(50);
      o.door50 = door();
      L.go(10);
      o.inside60 = A.inside(c, A.one(pick));
      o.state60 = A.one(pick).state;
      L.go(10);
      o.door70 = door();
      L.go(8);
      o.say78 = say();
      L.go(1);
      o.say79 = say();
      o.snd79 = L.snd.slice();
      L.go(1);
      o.say80 = say();
      o.door80 = door();
      o.snd80 = L.snd.slice();
      L.go(119);
      o.say199 = say();
      o.still199 = !!A.one(pick);
      o.mm199 = mm();
      o.door199 = door();
      o.kids199 = A.cinfo(cid).kids.slice();
      o.busy199 = A.cinfo(cid).meatBusy;
      L.go(1);
      o.gone200 = !A.one(pick);
      o.listed200 = h.animals.list().some((a: any) => a.id === pick);
      o.kids200 = A.cinfo(cid).kids.slice();
      o.mm200 = mm();
      o.ev = A.events('meat');
      o.stat = A.stat('meat:*');
      o.log = h.log.live().map((e: any) => `${e.item}${e.count ?? ''}`);
      o.say200 = say();
      L.go(10);
      o.door210 = door();
      L.go(10);
      o.door220 = door();
      o.say220 = say();
      o.busy220 = A.cinfo(cid).meatBusy;
      o.snd = L.snd.slice();
      o.otherState = A.one(other).state;
      o.otherPos = { x: A.one(other).x, z: A.one(other).z };
      o.posOther = posOther;
      o.ids = { pick, other, cid };
      return o;
    });
    const { pick, other, cid } = r.ids;
    expect(r.m.open, '押した ステップ に メニュー が とじる').toBe(false);
    expect(r.start).toEqual([expect.objectContaining({ type: 'meatStart', id: pick, coop: cid })]);
    expect(r.state0).toBe('meat');
    expect(r.mm0).toBe(0);
    expect(r.door0).toBe('open');
    expect(r.say0).toBe('');
    expect(r.door50, 'とびら は 60 まで あいて いる').toBe('open');
    expect(r.inside60, '60 ステップ 目 に ねぐら の 中').toBe(true);
    expect(r.state60).toBe('meat');
    expect(r.door70, '60〜80 は うごいて いる').toBe('moving');
    expect(r.say78).toBe('');
    expect(r.say79.replace(/\s+/g, ''), '79 では 出て いない').toBe('');
    expect(r.snd79, '79 では 音 も まだ').not.toContain('itadakimasu');
    expect(r.say80.replace(/\s+/g, '')).toContain(SAY);
    expect(r.door80).toBe('closed');
    expect(r.snd80.filter((s: string) => s === 'itadakimasu')).toHaveLength(1);
    expect(r.snd80, 'とびら の 音').toContain('coopDoor');
    expect(r.say199.replace(/\s+/g, '')).toContain(SAY);
    expect(r.still199, '199 は まだ list() に いる').toBe(true);
    expect(r.mm199, '199 は momo_nama 0').toBe(0);
    expect(r.door199).toBe('closed');
    expect(r.kids199, '小屋 の 子 の 数 に は 200 まで 入れる').toContain(pick);
    expect(r.busy199).toBe(pick);
    expect(r.gone200, '200 で list() から 消える').toBe(true);
    expect(r.kids200, '小屋 の kids から も 消える').not.toContain(pick);
    expect(r.mm200, '200 で momo_nama 2').toBe(2);
    expect(r.ev).toEqual([expect.objectContaining({ type: 'meat', id: pick, coop: cid, count: 2 })]);
    expect(r.stat).toBe(1);
    expect(r.log.join(','), '拾った ログ').toContain('momo_nama');
    expect(r.door210).toBe('moving');
    expect(r.door220, '220 で とびら が ひらく').toBe('open');
    expect(r.say220, '220 で 一言 は 空').toBe('');
    expect(r.busy220).toBeNull();
    expect(r.snd.filter((s: string) => s === 'itadakimasu'), '一言 の 音 は 1 回').toHaveLength(1);
    expect(r.snd.filter((s: string) => s === 'coopDoor').length, 'しまる・ひらく').toBeGreaterThanOrEqual(2);
    expect(r.otherState, 'ほか の 子 は かわらない').not.toBe('meat');
    expect(Math.hypot(r.otherPos.x - r.posOther.x, r.otherPos.z - r.posOther.z), 'ほか の 子 は 小屋 の 中').toBeLessThan(3);
    expect(other).toBeTruthy();
  });

  test('AC7 お祝い なし: 0〜220 で confetti・sparkle・hearts が ふえない・ファンファーレ なし・実績 の おめでとう なし・実績 の 取れた 数 かわらず', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const L = (window as any).__L;
      const { c, f, ids } = L.farm(1);
      const o: any = {};
      const unlockedN = () => h.achievements.list().filter((a: any) => a.unlocked).length;
      o.un0 = unlockedN();
      (window as any).__modalSeen = false;
      h.animals.fxReset();
      const fx0 = h.animals.fx();
      o.fx0 = { confetti: fx0.confetti, sparkle: fx0.sparkle, hearts: fx0.hearts };
      L.choose(c, f, ids[0]);
      let maxFx = { confetti: 0, sparkle: 0, hearts: 0 };
      L.each(220, () => {
        const x = h.animals.fx();
        maxFx = { confetti: Math.max(maxFx.confetti, x.confetti), sparkle: Math.max(maxFx.sparkle, x.sparkle), hearts: Math.max(maxFx.hearts, x.hearts) };
      });
      o.maxFx = maxFx;
      o.snd = L.snd.slice();
      o.modal = (window as any).__modalSeen === true || h.achievements.modal().open;
      o.band = h.ui.topBand().kind;
      o.un1 = unlockedN();
      o.meat = h.inventory.count('momo_nama');
      return o;
    });
    expect(r.meat, '演出 は ちゃんと おわった').toBe(2);
    expect(r.maxFx.confetti).toBe(r.fx0.confetti);
    expect(r.maxFx.sparkle).toBe(r.fx0.sparkle);
    expect(r.maxFx.hearts).toBe(r.fx0.hearts);
    for (const bad of ['growFirst', 'goldenEgg', 'friendFirst', 'hatchFirst', 'hatchMacho', 'grow', 'friend', 'hatch', 'egg']) expect(r.snd, bad).not.toContain(bad);
    expect(r.modal, '実績 の おめでとう画面').toBe(false);
    expect(r.band, '上の 帯 に 実績 も 出ない').not.toBe('achieve');
    expect(r.un1, '実績 は 1 つ も 取れない').toBe(r.un0);
  });

  test('AC8 演出中: その 子 を ねらえない・むし や 右クリック で 何も おきない。メニュー の おにく に する は disabled・押しても 進まない。小屋 は こわれない。べつ の 小屋 は できる', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const { cid, c, f, ids } = L.farm(2);
      const [pick, other] = ids;
      const o: any = {};
      // べつの 小屋
      const cid2 = A.coop(34, 20);
      const c2 = A.cinfo(cid2);
      const k2 = A.kid(c2, { stage: 'adult', raised: true });
      L.choose(c, f, pick);
      L.go(100); // 一言 が 出て いる あいだ
      // ねらえない・むし・右クリック
      h.player.set({ position: { x: c.x + 0.5 - 1.5, y: 9, z: c.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
      const cur = A.one(pick);
      (window as any).__aim.solve(Math.floor(cur.x), Math.floor(cur.y), Math.floor(cur.z), 0.5);
      h.step(1);
      o.target = h.animals.target();
      A.hold('mushi', 3);
      h.animals.events();
      A.tap();
      o.afterTap = h.animals.events().filter((e: any) => ['feed', 'pet', 'petAnimal', 'carry', 'lift', 'bugCatch'].includes(e.type)).length;
      o.mushi = h.inventory.count('mushi');
      o.carried = A.one(pick).carried;
      o.state = A.one(pick).state;
      // メニュー: ほか の 子 (other) は えらべる ので ひらく。おにく に する は disabled
      L.rc(c, f);
      const m = L.menu();
      o.menu = { open: m.open, page: m.page, meatDisabled: m.meatDisabled };
      L.press('meat');
      o.afterPress = L.menu().page;
      o.panelBtn = L.panel()?.buttons.find((b: any) => b.text.includes('おにくにする'))?.disabled;
      L.press('close');
      // 小屋を ほる
      const sx = c.x - f.fx * 2;
      const sz = c.z - f.fz * 2;
      L.stand(c, f);
      h.animals.events();
      h.input.press('primary');
      h.step(60);
      h.input.release('primary');
      h.step(1);
      o.locked = A.events('coopLocked').length;
      o.coops = h.animals.coops().length;
      o.fenceKept = h.world.getBlock(sx, c.y, sz) !== 'air';
      // 1 つの 小屋 で 同時 に 1 わ・べつの 小屋 は できる
      o.sameCoop = h.animals.meat(cid, other);
      o.otherCoop = h.animals.meat(cid2, k2);
      o.busy = h.animals.coops().map((x: any) => ({ id: x.id, busy: x.meatBusy }));
      o.ids = { pick, other, k2, cid, cid2 };
      // 200 の あと も 子 (other) が いる ので こわせない
      L.go(120);
      L.stand(c, f);
      h.animals.events();
      h.input.press('primary');
      h.step(60);
      h.input.release('primary');
      h.step(1);
      o.coopsAfter = h.animals.coops().length;
      o.locked2 = A.events('coopLocked').length;
      return o;
    });
    expect(r.target, 'ねらえない').not.toBe(r.ids.pick);
    expect(r.afterTap, 'むし・なでる・だっこ なし').toBe(0);
    expect(r.mushi).toBe(3);
    expect(r.carried).toBeFalsy();
    expect(r.state).toBe('meat');
    expect(r.menu).toMatchObject({ open: true, page: 'top', meatDisabled: true });
    expect(r.afterPress, 'うすくて 押せない').toBe('top');
    expect(r.panelBtn).toBe(true);
    expect(r.locked, '演出 中 は こわれない（coopNotEmpty）').toBeGreaterThanOrEqual(1);
    expect(r.coops).toBe(1 + 1);
    expect(r.fenceKept).toBe(true);
    expect(r.sameCoop).toMatchObject({ ok: false, reason: 'busy' });
    expect(r.otherCoop, 'べつ の 小屋 は できる').toMatchObject({ ok: true });
    expect(r.busy.find((x: any) => x.id === r.ids.cid).busy).toBe(r.ids.pick);
    expect(r.busy.find((x: any) => x.id === r.ids.cid2).busy).toBe(r.ids.k2);
    expect(r.coopsAfter, '200 の あと も ほか の 子 が いる ので こわれない').toBe(2);
    expect(r.locked2).toBeGreaterThanOrEqual(1);
  });

  test('AC9 持ち物 いっぱい: 200 ステップ 目 に プレイヤー の 足もと に momo_nama 2 の おとしもの（meat の dropped 2）', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const { c, f, ids } = L.farm(1);
      const o: any = {};
      L.choose(c, f, ids[0]);
      L.fill();
      L.go(199);
      o.inv199 = h.inventory.count('momo_nama');
      o.bags199 = A.bags('momo_nama').length;
      L.go(1);
      o.inv = h.inventory.count('momo_nama');
      const p = h.player.get().position;
      const bags = A.bags('momo_nama');
      o.n = bags.reduce((s: number, b: any) => s + b.slots.filter((x: any) => x.item === 'momo_nama').reduce((t: number, x: any) => t + x.count, 0), 0);
      o.near = bags.every((b: any) => Math.hypot(b.position.x - p.x, b.position.z - p.z) < 3);
      o.ev = A.events('meat');
      return o;
    });
    expect(r.inv199).toBe(0);
    expect(r.bags199).toBe(0);
    expect(r.inv, '持ち物 には 入らない').toBe(0);
    expect(r.n, '足もと に 2 こ').toBe(2);
    expect(r.near).toBe(true);
    expect(r.ev).toEqual([expect.objectContaining({ type: 'meat', count: 2, dropped: 2 })]);
  });

  test('AC10 保存: 演出 100 ステップ 目 で save.now() → 読み直す と 子 は いない・momo_nama 2・演出 は 出ない（meatText 空・door open）。animals の v は かわらない', async ({ page }) => {
    await openLive3(page, '?');
    const before = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const { cid, c, f, ids } = L.farm(2);
      const v0 = h.animals.serialize().v;
      L.choose(c, f, ids[0]);
      L.go(100);
      const o: any = { say: h.ui.meatText(), door: A.cinfo(cid).door, listed: h.animals.list().length, v0 };
      await h.save.now();
      o.vSaved = h.animals.serialize().v;
      o.ids = ids;
      o.cid = cid;
      return o;
    });
    expect(before.say.replace(/\s+/g, ''), '保存 した とき は 演出 の 真ん中').toContain(SAY);
    expect(before.door).toBe('closed');
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const after = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      h.settings.set('animalAutoSpawn', false);
      await h.world.settle({ full: true });
      h.step(2);
      const coops = h.animals.coops();
      const o: any = {
        list: h.animals.list().map((a: any) => ({ id: a.id, state: a.state, stage: a.stage, raised: a.raised })),
        mm: h.inventory.count('momo_nama'),
        say: h.ui.meatText(),
        doors: coops.map((c: any) => c.door),
        busy: coops.map((c: any) => c.meatBusy),
        kids: coops.map((c: any) => c.kids.length),
        v: h.animals.serialize().v,
      };
      h.step(240);
      o.say2 = h.ui.meatText();
      o.mm2 = h.inventory.count('momo_nama');
      o.n2 = h.animals.list().length;
      o.doors2 = h.animals.coops().map((c: any) => c.door);
      return o;
    });
    expect(after.list, '1 わ だけ のこる').toHaveLength(1);
    expect(after.list[0].state).not.toBe('meat');
    expect(after.mm, '保存 した とき に にく は 持ち物 に 入って いる').toBe(2);
    expect(after.say, '演出 は 出ない').toBe('');
    expect(after.doors).toEqual(['open']);
    expect(after.busy).toEqual([null]);
    expect(after.kids).toEqual([1]);
    expect(before.v0, '仕様 §4.4 の「v 3」は 古い。LIVE-2.1 で v 4。LIVE-3 は 新しい 項目 なし').toBe(4);
    expect(after.v, 'animals の v は 4 の まま').toBe(4);
    expect(after.v).toBe(before.vSaved);
    expect(after.say2).toBe('');
    expect(after.mm2, '読みこんだ あと に 演出 の 続き は 出ない').toBe(2);
    expect(after.n2).toBe(1);
    expect(after.doors2).toEqual(['open']);
  });

  test('AC18 敵・ほか の 子 に さわらない: いただきます の 前後 で 妖怪 が 同じ・ほか の 子 の bugs・goldMiss・grow・位置 が かわらない', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      const { c, f } = L.farm(0);
      const a = A.kid(c, { stage: 'adult', raised: true, bugs: 40, goldMiss: 12 }, -1, -1);
      const b = A.kid(c, { stage: 'adult', raised: true, bugs: 7, goldMiss: 3 }, 1, -1);
      const k = A.kid(c, { stage: 'chick', raised: false, grow: 1, bugs: 2 }, 0, 1);
      h.settings.set('yokaiAutoSpawn', false);
      h.yokai.clear();
      const snap = () => ({
        others: [b, k].map((id) => {
          const x = A.one(id);
          return { id, bugs: x.bugs, goldMiss: x.goldMiss, grow: x.grow, stage: x.stage, state: x.state, x: x.x, z: x.z };
        }),
        yokai: JSON.stringify(h.yokai.list()),
      });
      const s0 = snap();
      L.choose(c, f, a);
      L.go(230);
      const s1 = snap();
      return { s0, s1, gone: !A.one(a), mm: h.inventory.count('momo_nama') };
    });
    expect(r.gone).toBe(true);
    expect(r.mm).toBe(2);
    expect(r.s1.yokai, '妖怪 は 同じ').toBe(r.s0.yokai);
    for (let i = 0; i < r.s0.others.length; i++) {
      const p = r.s0.others[i];
      const q = r.s1.others[i];
      expect(q.bugs, `bugs ${p.id}`).toBe(p.bugs);
      expect(q.goldMiss, `goldMiss ${p.id}`).toBe(p.goldMiss);
      expect(q.grow, `grow ${p.id}`).toBe(p.grow);
      expect(q.stage).toBe(p.stage);
      expect(Math.hypot(q.x - p.x, q.z - p.z), `位置 ${p.id}`).toBeLessThan(3); // 小屋 の 中 を ぶらぶら する 分 だけ
    }
  });
});
