import { expect, test, type Page } from '@playwright/test';

/**
 * BAL-A（#109）の受け入れ基準 AC8・AC9・AC11（docs/design/BALANCE.md §7・§4.1〜§4.4）。
 * 強さの数（からかさ 体力 8 など）・わざダメージの四捨五入・ぬりかべの たおれこみ の数を、
 * つないだ後の実際のゲームで確かめる。数の表そのもの（AC1〜AC7）はユニットが見る。
 *
 * ねらう先・立つ場所は数で決め打ちせず、ゲームに聞く:
 *  - 目の高さと向きは `camera.get().eye`・`player.set` の yaw（90 = +x）から出す
 *  - 当たるかどうかは `yokai.raycast` で先に確かめる
 */

test.describe.configure({ timeout: 180_000 });

async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    const T: any = {
      /** 床・空・妖怪なし・自動出現なし・うろうろなし。P を (2.5, 9, 6.5) に置く */
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
      },
      place(x: number, y: number, z: number) {
        h.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(1);
      },
      one(id: number) {
        return h.yokai.list().find((y: any) => y.id === id);
      },
      /** 妖怪（体力の箱）が目の高さの線で当たる所に P を置き直す。当たるなら true */
      faceTo(id: number, dist = 2) {
        const y = T.one(id);
        if (!y) return false;
        T.place(y.position.x - dist, y.position.y, y.position.z);
        const eye = h.camera.get().eye;
        const hit = h.yokai.raycast(eye, { x: 1, y: 0, z: 0 }, 4);
        return hit?.id === id;
      },
    };
    (window as any).T = T;
  });
}

test.describe('BAL-A 強さの数と式', () => {
  test('AC8: からかさ（M = 1）を すで で たたく。7 回 当てて体力 1・たおれない、8 回目で たおれる', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const id = h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
      const out: any = { aimed: [], hp: [], state: [], maxHp: T.one(id).maxHp, defeat: [] };
      h.yokai.events();
      for (let n = 1; n <= 8; n++) {
        out.aimed.push(T.faceTo(id));
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        h.step(29); // 押してから 30 ステップ目に当たる
        const y = T.one(id);
        out.hp.push(y?.hp);
        out.state.push(y?.state);
        out.defeat.push(h.yokai.events().filter((e: any) => e.type === 'defeat').length);
      }
      return out;
    });
    expect(r.maxHp).toBe(8);
    expect(r.aimed.every((a: boolean) => a), JSON.stringify(r.aimed)).toBe(true);
    expect(r.hp.slice(0, 7)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(r.state.slice(0, 7).every((s: string) => s !== 'dying')).toBe(true);
    expect(r.defeat.slice(0, 7)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(r.state[7]).toBe('dying');
    expect(r.defeat[7]).toBe(1);
  });

  test('AC9: ぼくとう 中段 の つき で からかさ。5 回 当てて体力 0.5、6 回目で たおれる（WEAPON-4: 1.5 ずつ）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      h.inventory.setSlot(0, { item: 'bokuto', count: 1 });
      h.inventory.select(0);
      h.step(1);
      h.blade.setStance('chudan');
      const id = h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
      const out: any = { aimed: [], hp: [], state: [], hits: [], defeat: [] };
      h.yokai.events();
      h.blade.events();
      for (let n = 1; n <= 6; n++) {
        out.aimed.push(T.faceTo(id));
        const n0 = h.blade.events().filter((e: any) => e.type === 'techHit').length;
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        h.step(60); // つきは 4 ステップ目で当たり、そのあと戻る
        const y = T.one(id);
        out.hits.push(h.blade.events().filter((e: any) => e.type === 'techHit').length - n0);
        out.hp.push(y?.hp);
        out.state.push(y?.state);
        out.defeat.push(h.yokai.events().filter((e: any) => e.type === 'defeat').length);
      }
      return out;
    });
    expect(r.aimed.every((a: boolean) => a), JSON.stringify(r.aimed)).toBe(true);
    expect(r.hits).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.hp.slice(0, 5)).toEqual([6.5, 5, 3.5, 2, 0.5]);
    expect(r.state.slice(0, 5).every((s: string) => s !== 'dying')).toBe(true);
    expect(r.defeat.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(r.state[5]).toBe('dying');
    expect(r.defeat[5]).toBe(1);
  });

  for (const [name, armor, after, amount] of [
    ['防具なし', null, 4, 16],
    ['てつの防具 一式（かぶと・よろい・こて・すねあて）', ['kabuto', 'yoroi', 'kote', 'suneate'], 7, 13],
  ] as const) {
    test(`AC11: ぬりかべ の たおれこみ（${name}）で 体力 20 → ${after}`, async ({ page }) => {
      await open(page);
      const r = await page.evaluate((armorSet) => {
        const T = (window as any).T;
        const h = (window as any).__rikkun;
        T.base();
        if (armorSet) h.armor.set(...armorSet);
        h.combat.setHp(20);
        const id = h.yokai.spawn('nurikabe', 5.0, 9, 6.5, { yawDeg: 270 });
        h.yokai.events();
        h.combat.events();
        const out: any = { start: h.combat.get().hp, id, hits: [], hpAfter: -1 };
        let hitAt = -1;
        for (let i = 1; i <= 600; i++) {
          h.step(1);
          for (const e of h.combat.events()) if (e.type === 'playerHit') out.hits.push({ i, amount: e.amount, by: e.by });
          if (hitAt < 0 && h.combat.get().hp < 20) hitAt = i;
          if (hitAt > 0 && i >= hitAt + 5) break; // むてきのあいだ。2 回目はまだ来ない
        }
        out.hitAt = hitAt;
        out.hpAfter = h.combat.get().hp;
        out.armorValue = h.armor.get().value;
        return out;
      }, armor as unknown as string[] | null);
      expect(r.start).toBe(20);
      expect(r.hitAt, '600 ステップのうちに たおれこみが当たらなかった').toBeGreaterThan(0);
      expect(r.hits.length).toBe(1);
      expect(r.hits[0].by).toBe('nurikabe');
      expect(r.hits[0].amount).toBe(amount);
      expect(r.hpAfter).toBe(after);
    });
  }
});
