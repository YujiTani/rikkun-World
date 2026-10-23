import { expect, test, type Page } from '@playwright/test';

/**
 * BAL-B（#110）の受け入れ基準 AC10（docs/design/BALANCE.md §2.3〜§2.5・§5・§6・§7）。
 * 数の表そのもの（AC2〜AC4・AC7）はユニットが見る。ここは「つないだ後の実際のゲーム」で
 * ヌシ（M = 1）のからかさの 体力・攻撃・経験値・おしらせ・音・名前・アイコンを確かめる。
 *
 * 窓口（開発がこの名前で作る）:
 *  - yokai.spawn(kind, x, y, z, { ai?, yawDeg?, title?: 'none'|'oyabun'|'taisho'|'nushi', m? })
 *  - yokai.list() の各行の title・m・maxHp・attack
 *  - yokai.events(): defeat に title、二つ名が出たときの { type: 'titleSound', title, id }
 *  - hud.announce() → { text, icon: 'taisho'|'nushi', ticksLeft } | null
 *  - hud.nameplate(id) → { visible, text } | null、hud.hpBar(id).icon
 *  - level.events() の { type: 'xp', amount }（経験値）
 *
 * ねらう先・立つ場所は bal-a.spec.ts の AC8 と同じやり方（毎回 yokai.list() の位置から置き直し、
 * yokai.raycast で当たるか確かめる）。
 */

test.describe.configure({ timeout: 180_000 });

async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    const T: any = {
      base() {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.settings.set('yokaiAutoSpawn', false);
        h.settings.set('yokaiWander', false);
        h.yokai.clear();
        h.world.fill(0, 8, 0, 20, 8, 12, 'stone');
        h.world.fill(0, 9, 0, 20, h.world.size().y - 1, 12, 'air');
        for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1); // 空気の穴の光とメッシュを先に済ませる
        h.inventory.clear();
        h.armor.set(null, null, null, null);
        h.time.set(0);
        h.combat.setHp(20);
        T.place(2.5, 9, 6.5);
        h.step(10);
        h.yokai.events();
        h.combat.events();
        h.level.events();
      },
      place(x: number, y: number, z: number) {
        h.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(1);
      },
      one(id: number) {
        return h.yokai.list().find((y: any) => y.id === id);
      },
      faceTo(id: number, dist = 2) {
        const y = T.one(id);
        if (!y) return false;
        T.place(y.position.x - dist, y.position.y, y.position.z);
        const hit = h.yokai.raycast(h.camera.get().eye, { x: 1, y: 0, z: 0 }, 4);
        return hit?.id === id;
      },
      /** すでで 1 回たたく（30 ステップ目に当たる） */
      punch() {
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        h.step(40);
      },
    };
    (window as any).T = T;
  });
}

test.describe('BAL-B 二つ名（AC10）', () => {
  test('AC10: からかさ ヌシ（M = 1）: 最大体力 24・攻撃 4・おしらせ 180 ステップ・音 1 回・名前・アイコン', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const id = h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, yawDeg: 270, title: 'nushi', m: 1 });
      const out: any = { id };
      const row = T.one(id);
      out.row = { title: row?.title, m: row?.m, maxHp: row?.maxHp, hp: row?.hp, attack: row?.attack, name: row?.name };
      // おしらせ: 出た直後から 180 ステップ。数えて確かめる
      const a0 = h.hud.announce();
      out.announce0 = a0;
      let shown = a0 ? 1 : 0;
      let at170: any = null;
      for (let i = 1; i <= 200; i++) {
        h.step(1);
        const a = h.hud.announce();
        if (i === 170) at170 = a;
        if (a) shown++;
      }
      out.shown = shown;
      out.at170 = at170;
      out.after = h.hud.announce();
      // 二つ名の音: 出てから 1 回だけ
      const ev = h.yokai.events();
      out.titleSounds = ev.filter((e: any) => e.type === 'titleSound');
      // 名前・アイコン（名前は出ているだけ。バーは たたいたら出る）
      out.nameplate = h.hud.nameplate(id);
      // 16 ブロックより遠いと 名前もバーも出ない
      T.place(6.5, 9, 6.5 + 20);
      out.far = h.hud.nameplate(id);
      out.farBar = h.hud.hpBar(id);
      T.place(6.5 - 2, 9, 6.5);
      out.nameplateNear = h.hud.nameplate(id);
      out.hpBarIdle = h.hud.hpBar(id);
      T.faceTo(id);
      T.punch();
      out.hpBarHit = h.hud.hpBar(id);
      out.hpAfterPunch = T.one(id)?.hp;
      return out;
    });
    expect(r.row.title).toBe('nushi');
    expect(r.row.m).toBe(1);
    expect(r.row.maxHp).toBe(24);
    expect(r.row.hp).toBe(24);
    expect(r.row.attack).toBe(4);
    // おしらせ: 3 秒（180 ステップ）出て消える
    expect(r.announce0, 'spawn 直後に おしらせが出ていない').not.toBeNull();
    expect(r.announce0.icon).toBe('nushi');
    expect(r.announce0.ticksLeft).toBeLessThanOrEqual(180);
    expect(r.announce0.ticksLeft).toBeGreaterThanOrEqual(178);
    expect(r.row.name).toBe('からかさおばけ');
    const name = r.row.name;
    expect(r.announce0.text).toBe(`${name} の ヌシ が あらわれた！`);
    expect(r.at170).not.toBeNull();
    expect(r.shown).toBeGreaterThanOrEqual(179);
    expect(r.shown).toBeLessThanOrEqual(181);
    expect(r.after).toBeNull();
    // 音: 1 回
    expect(r.titleSounds.length).toBe(1);
    expect(r.titleSounds[0].title).toBe('nushi');
    // 頭の上の名前（16 ブロック以内）とアイコン
    expect(r.nameplateNear?.visible).toBe(true);
    expect(r.nameplateNear?.text).toBe(`${name} の ヌシ`);
    expect(r.far?.visible).toBe(false);
    expect(r.farBar?.visible).toBe(false);
    // 二つ名のバーは 近ければ たたく前から出る（BALANCE §4.7）
    expect(r.hpBarIdle?.visible).toBe(true);
    expect(r.hpBarIdle?.icon).toBe('nushi');
    expect(r.hpAfterPunch).toBeLessThan(24);
    expect(r.hpBarHit?.visible).toBe(true);
    expect(r.hpBarHit?.icon).toBe('nushi');
    expect(r.hpBarHit?.bars).toBe(20);
  });

  test('AC10: ヌシ に ふれられる（攻撃）と 防具なしで 体力 20 → 16', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const id = h.yokai.spawn('karakasa', 6.5, 9, 6.5, { yawDeg: 270, title: 'nushi', m: 1 });
      h.yokai.events();
      h.combat.events();
      const out: any = { start: h.combat.get().hp, id, hits: [] };
      let hitAt = -1;
      for (let i = 1; i <= 600; i++) {
        h.step(1);
        for (const e of h.combat.events()) if (e.type === 'playerHit') out.hits.push({ i, amount: e.amount, by: e.by });
        if (hitAt < 0 && h.combat.get().hp < 20) hitAt = i;
        if (hitAt > 0 && i >= hitAt + 5) break; // むてきのあいだ。2 回目はまだ来ない
      }
      out.hitAt = hitAt;
      out.hpAfter = h.combat.get().hp;
      out.attack = T.one(id)?.attack;
      return out;
    });
    expect(r.start).toBe(20);
    expect(r.attack).toBe(4);
    expect(r.hitAt, '600 ステップのうちに 攻撃が当たらなかった').toBeGreaterThan(0);
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].by).toBe('karakasa');
    expect(r.hits[0].amount).toBe(4);
    expect(r.hpAfter).toBe(16);
  });

  test('AC10: ヌシ を たおすと 経験値 15・defeat の出来事に title = nushi', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const id = h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, yawDeg: 270, title: 'nushi', m: 1 });
      h.yokai.setHp(id, 1);
      h.yokai.events();
      h.level.events();
      const aimed = T.faceTo(id);
      T.punch();
      const defeat = h.yokai.events().filter((e: any) => e.type === 'defeat');
      const xp = h.level.events().filter((e: any) => e.type === 'xp');
      return { aimed, id, defeat, xp, state: T.one(id)?.state };
    });
    expect(r.aimed).toBe(true);
    expect(r.defeat.length).toBe(1);
    expect(r.defeat[0].id).toBe(r.id);
    expect(r.defeat[0].title).toBe('nushi');
    expect(r.xp.length).toBe(1);
    expect(r.xp[0].amount).toBe(15);
  });

  test('AC10: おやぶん で出すと おしらせは出ず、音の出来事は 1 回・名前とアイコンは出る', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const id = h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, yawDeg: 270, title: 'oyabun', m: 1 });
      const out: any = { id, announce: [] as any[] };
      const row = T.one(id);
      out.row = { title: row?.title, maxHp: row?.maxHp, attack: row?.attack, name: row?.name };
      out.announce.push(h.hud.announce());
      for (let i = 0; i < 30; i++) {
        h.step(10);
        out.announce.push(h.hud.announce());
      }
      out.titleSounds = h.yokai.events().filter((e: any) => e.type === 'titleSound');
      T.faceTo(id);
      out.nameplate = h.hud.nameplate(id);
      T.punch();
      out.hpBarHit = h.hud.hpBar(id);
      // 二つ名なしは 音も名前もない
      const plain = h.yokai.spawn('karakasa', 6.5, 9, 9.5, { ai: false, yawDeg: 270, title: 'none', m: 1 });
      out.plainRow = T.one(plain);
      h.step(2);
      out.plainSounds = h.yokai.events().filter((e: any) => e.type === 'titleSound');
      out.plainPlate = h.hud.nameplate(plain);
      out.plainAnnounce = h.hud.announce();
      return out;
    });
    expect(r.row.title).toBe('oyabun');
    expect(r.row.maxHp).toBe(12);
    expect(r.row.attack).toBe(2);
    expect(r.announce.every((a: any) => a === null), JSON.stringify(r.announce)).toBe(true);
    expect(r.titleSounds.length).toBe(1);
    expect(r.titleSounds[0].title).toBe('oyabun');
    expect(r.row.name).toBe('からかさおばけ');
    const name = r.row.name;
    expect(r.nameplate?.visible).toBe(true);
    expect(r.nameplate?.text).toBe(`${name} おやぶん`);
    expect(r.hpBarHit?.icon).toBe('oyabun');
    expect(r.plainRow.title).toBe('none');
    expect(r.plainRow.maxHp).toBe(8);
    expect(r.plainSounds.length).toBe(0);
    expect(r.plainPlate === null || r.plainPlate.visible === false).toBe(true);
    expect(r.plainAnnounce).toBeNull();
  });

  test('§6: たいしょう・ヌシ は 同時に 1 体まで（ぬりかべ も。#270）', async ({ page }) => {
    await open(page);
    // 前提（開発へ）: title を決めて出すときも §6 のきまりを通す。
    //   たいしょう・ヌシ が もういるとき 同じ段を頼まれたら title = 'none'。ぬりかべ も 同じ（#270 で おやぶん どまりを やめた）。
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const a = h.yokai.spawn('karakasa', 6.5, 9, 3.5, { ai: false, title: 'nushi', m: 1 });
      const b = h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, title: 'taisho', m: 1 });
      const c = h.yokai.spawn('karakasa', 6.5, 9, 9.5, { ai: false, title: 'oyabun', m: 1 });
      const out: any = { first: T.one(a)?.title, second: T.one(b)?.title, oyabun: T.one(c)?.title };
      out.sounds = h.yokai.events().filter((e: any) => e.type === 'titleSound').map((e: any) => e.title);
      // 先の ヌシ がいなくなれば また 出せる
      h.yokai.clear();
      const d = h.yokai.spawn('karakasa', 6.5, 9, 6.5, { ai: false, title: 'taisho', m: 1 });
      out.afterClear = T.one(d)?.title;
      h.yokai.clear();
      const n = h.yokai.spawn('nurikabe', 6.5, 9, 6.5, { ai: false, title: 'nushi', m: 1 });
      out.nurikabe = { title: T.one(n)?.title, maxHp: T.one(n)?.maxHp };
      h.yokai.clear();
      const n2 = h.yokai.spawn('nurikabe', 6.5, 9, 6.5, { ai: false, title: 'taisho', m: 1 });
      out.nurikabeTaisho = { title: T.one(n2)?.title, maxHp: T.one(n2)?.maxHp };
      return out;
    });
    expect(r.first).toBe('nushi');
    expect(r.second).toBe('none');
    expect(r.oyabun).toBe('oyabun');
    expect(r.sounds.filter((s: string) => s === 'nushi').length).toBe(1);
    expect(r.sounds.includes('taisho')).toBe(false);
    expect(r.afterClear).toBe('taisho');
    expect(r.nurikabe.title).toBe('nushi');
    expect(r.nurikabeTaisho.title).toBe('taisho');
    expect(r.nurikabe.maxHp / r.nurikabeTaisho.maxHp).toBeCloseTo(1.5, 1);
  });
});
