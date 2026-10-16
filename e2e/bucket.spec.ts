import { expect, test, type Page } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';
import { installArena } from './helpers/arena';

/**
 * BUCKET-1 バケツの受け入れ確認（docs/design/BUCKET-1.md §6 の AC のうち E2E で見るもの:
 * AC2・AC4・AC5・AC6・AC7・AC9・AC10）。実装の前に書いたテスト（落ちるのが正しい）。
 * 数・座標は決め打ちせず、設定（reach・farmWetRange…）と窓口（target.get()・farm.bucketSpot()）に聞く。
 * 床は __arena.floor（y=8）。置く水のマスは bucketSpot() が返した物を使う。
 */
async function open(page: Page, query = '?nosave=1') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
  await installAimHelpers(page);
  await installArena(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const A = (window as any).__aim;
    const T: any = {
      base() {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.settings.set('yokaiAutoSpawn', false);
        h.yokai.clear();
        (window as any).__arena.floor(0, 0, 20, 20);
        h.inventory.clear();
        h.time.set(12000);
        T.stand(2.5, 6.5, 90, -30);
        h.step(10);
        h.farm.fxReset();
      },
      stand(x: number, z: number, yaw: number, pitch: number) {
        A.standForS(x, z, yaw, pitch, 9);
        h.step(1);
      },
      aim(tx: number, ty: number, tz: number, top = 1) {
        A.solve(tx, ty, tz, top);
        h.step(1);
      },
      aimNow(tx: number, ty: number, tz: number, top = 1) {
        A.solve(tx, ty, tz, top);
      },
      tap(a = 'secondary') {
        h.input.release(a);
        h.input.press(a);
        h.step(1);
        h.input.release(a);
        h.step(1);
      },
      hold(item: string) {
        h.inventory.clear();
        h.inventory.add(item, 1);
        h.inventory.select(0);
        h.step(1);
      },
      slot0() {
        const s = h.inventory.get().slots[0];
        return s ? { item: s.item, count: s.count } : null;
      },
      /** このステップまでの出来事の数を覚えて、あとの分だけ返す */
      mark() {
        T._n = h.farm.events().length;
      },
      evs(type?: string) {
        const l = h.farm.events().slice(T._n ?? 0);
        return type ? l.filter((e: any) => e.type === type) : l;
      },
      waterCount() {
        let n = 0;
        for (let x = 0; x <= 20; x++) for (let z = 0; z <= 20; z++) for (let y = 8; y <= 12; y++) if (h.world.getBlock(x, y, z) === 'water') n++;
        return n;
      },
      soil(x: number, z: number, y = 8) {
        h.world.setBlock(x, y, z, 'dirt');
        h.farm.till(x, y, z);
      },
    };
    (window as any).T = T;
  });
}

test.describe('BUCKET-1 バケツ', () => {
  test('AC2 つくる: カード 33・29 まい目 bucket（28 まい目 sprinkler）・てつ 3 で 1 こ・craft:bucket 1', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.add('iron_ingot', 3);
      if (!h.inventory.get().open) {
        h.input.press('toggleInventory');
        h.input.release('toggleInventory');
      }
      h.step(4);
      const ids: string[] = h.craft.ui().cards.map((c: any) => c.id);
      h.craft.tileClick('bucket');
      h.craft.tileClick('bucket');
      h.step(3);
      return {
        cards: ids.length,
        at29: ids[28],
        at28: ids[27],
        after: ids.slice(29),
        bucket: h.inventory.count('bucket'),
        iron: h.inventory.count('iron_ingot'),
        stat: h.achievements.stats()['craft:bucket'] ?? 0,
      };
    });
    expect(r.cards).toBe(33);
    expect(r.at29).toBe('bucket');
    expect(r.at28).toBe('sprinkler');
    expect(r.after).toHaveLength(4);
    expect(r.bucket).toBe(1);
    expect(r.iron).toBe(0);
    expect(r.stat).toBe(1);
  });

  test('AC4 くむ: 1 回で みず・水は そのまま・みずで もう 1 回は かわらず・とどかない水・押しつづけても 1 回', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const o: any = {};
      T.base();
      h.world.setBlock(6, 8, 6, 'water');
      h.step(1);
      T.hold('bucket');
      T.aim(6, 8, 6);
      T.mark();
      T.tap();
      o.slot = T.slot0();
      o.block = h.world.getBlock(6, 8, 6);
      o.fill = T.evs('bucketFill');
      // みずの バケツで もう 1 回
      T.mark();
      T.tap();
      o.slot2 = T.slot0();
      o.block2 = h.world.getBlock(6, 8, 6);
      o.changed2 = T.evs('bucketFill').filter((e: any) => e.changed).length;
      // とどかない水（reach + 1 マス先）
      const reach: number = h.settings.get('reach');
      const fx = 2 + reach + 2;
      T.base();
      h.world.setBlock(fx, 8, 6, 'water');
      h.step(1);
      T.hold('bucket');
      T.aim(fx, 8, 6);
      T.mark();
      T.tap();
      o.far = { slot: T.slot0(), fills: T.evs('bucketFill').filter((e: any) => e.changed).length };
      // 押しつづけ
      const rep: number = h.settings.get('farmPourRepeatTicks');
      T.base();
      h.world.setBlock(6, 8, 6, 'water');
      h.step(1);
      T.hold('bucket');
      T.aim(6, 8, 6);
      T.mark();
      h.input.press('secondary');
      h.step(rep * 2 + 1);
      h.input.release('secondary');
      h.step(1);
      o.heldChanged = T.evs('bucketFill').filter((e: any) => e.changed).length;
      o.heldSlot = T.slot0();
      return o;
    });
    expect(r.slot).toEqual({ item: 'water_bucket', count: 1 });
    expect(r.block).toBe('water');
    expect(r.fill).toHaveLength(1);
    expect(r.fill[0].changed).toBe(true);
    expect(r.slot2).toEqual({ item: 'water_bucket', count: 1 });
    expect(r.block2).toBe('water');
    expect(r.changed2).toBe(0);
    expect(r.far.slot).toEqual({ item: 'bucket', count: 1 });
    expect(r.far.fills).toBe(0);
    expect(r.heldChanged).toBe(1);
    expect(r.heldSlot).toEqual({ item: 'water_bucket', count: 1 });
  });

  test('AC5 おく: bucketSpot の マスが water・bucket に もどる・bucketPlace・押しつづけても 1 マス', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const o: any = {};
      T.base();
      T.hold('water_bucket');
      T.aim(6, 8, 6);
      const s = h.farm.bucketSpot();
      o.spot = s;
      o.before = s ? h.world.getBlock(s.x, s.y, s.z) : null;
      T.mark();
      T.tap();
      o.after = s ? h.world.getBlock(s.x, s.y, s.z) : null;
      o.slot = T.slot0();
      o.place = T.evs('bucketPlace');
      o.stat = h.achievements.stats()['bucketPlace'] ?? 0;
      o.water = T.waterCount();
      // 押しつづけ（とちゅうで ねらいを 動かす）
      const rep: number = h.settings.get('farmPourRepeatTicks');
      T.base();
      T.hold('water_bucket');
      T.aim(6, 8, 6);
      T.mark();
      h.input.press('secondary');
      for (let i = 0; i <= rep * 2; i++) {
        if (i === rep) T.aimNow(8, 8, 9);
        if (i === rep * 2) T.aimNow(10, 8, 4);
        h.step(1);
      }
      h.input.release('secondary');
      h.step(1);
      o.heldWater = T.waterCount();
      o.heldPlace = T.evs('bucketPlace').length;
      return o;
    });
    expect(r.spot).not.toBeNull();
    expect(r.before).toBe('air');
    expect(r.after).toBe('water');
    expect(r.slot).toEqual({ item: 'bucket', count: 1 });
    expect(r.place).toHaveLength(1);
    expect(r.stat).toBe(1);
    expect(r.water).toBe(1);
    expect(r.heldWater).toBe(1);
    expect(r.heldPlace).toBe(1);
  });

  test('AC6 しめって 育つ: 横 R-1 の はたけは しめる・R+1 は かわいたまま・いしで ふさいで ほると かわく', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const o: any = {};
      const R: number = h.settings.get('farmWetRange');
      const recheck: number = h.settings.get('farmWetRecheckTicks');
      T.base();
      T.hold('water_bucket');
      T.aim(6, 8, 6);
      const s = h.farm.bucketSpot();
      // 水は +x の 向きに 見る。はたけは ねらいの線から はなれた z に 置く
      const nearZ = s.z - (R - 1);
      const farZ = s.z + R + 1;
      T.soil(s.x, nearZ, s.y - 1);
      h.farm.plant(s.x, s.y - 1, nearZ, 'tomato');
      T.soil(s.x, farZ, s.y - 1);
      h.step(1);
      T.aim(6, 8, 6);
      o.dry0 = { near: h.farm.soil(s.x, s.y - 1, nearZ).wet, far: h.farm.soil(s.x, s.y - 1, farZ).wet };
      T.tap();
      o.placed = h.world.getBlock(s.x, s.y, s.z);
      h.step(recheck);
      o.near = h.farm.soil(s.x, s.y - 1, nearZ).wet;
      o.crop = h.farm.crop(s.x, s.y, nearZ)?.wet;
      o.far = h.farm.soil(s.x, s.y - 1, farZ).wet;
      // いしを おいて ほる
      T.hold('stone');
      T.aim(s.x, s.y - 1, s.z);
      T.tap();
      o.stone = h.world.getBlock(s.x, s.y, s.z);
      T.aim(s.x, s.y, s.z, 0.5);
      h.input.press('primary');
      for (let i = 0; i < 600 && !h.dig.get().ready; i++) h.step(1);
      h.input.release('primary');
      h.step(2);
      h.input.press('primary');
      h.step(3);
      h.input.release('primary');
      h.step(recheck + 2);
      o.after = h.world.getBlock(s.x, s.y, s.z);
      o.dried = h.farm.soil(s.x, s.y - 1, nearZ).wet;
      return o;
    });
    expect(r.dry0).toEqual({ near: false, far: false });
    expect(r.placed).toBe('water');
    expect(r.near).toBe(true);
    expect(r.crop).toBe(true);
    expect(r.far).toBe(false);
    expect(r.stone).toBe('stone');
    expect(r.after).toBe('air');
    expect(r.dried).toBe(false);
  });

  test('AC7 置けない: 体と かさなる・作物・世界の外・妖怪の箱・空 → 変わらず water_bucket・bucketPlace なし・spot は null', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const o: any = {};
      const snap = () => ({ slot: T.slot0(), water: T.waterCount(), place: T.evs('bucketPlace').length });
      // (1) 体と かさなる: 足もとの 床を ねらう
      T.base();
      T.hold('water_bucket');
      const p = h.player.get().position;
      T.aim(Math.floor(p.x), 8, Math.floor(p.z));
      h.player.set({ pitch: -89 });
      h.step(1);
      T.mark();
      o.c1 = { spot: h.farm.bucketSpot() };
      T.tap();
      o.c1 = { ...o.c1, ...snap(), no: T.evs('bucketNo').length };
      // (2) 作物を ねらう
      T.base();
      T.soil(5, 6);
      h.farm.plant(5, 8, 6, 'tomato');
      T.hold('water_bucket');
      T.aim(5, 9, 6, 0.5);
      T.mark();
      o.c2 = { spot: h.farm.bucketSpot() };
      T.tap();
      o.c2 = { ...o.c2, ...snap(), no: T.evs('bucketNo').length, crop: !!h.farm.crop(5, 9, 6) };
      // (3) 世界の外（上の はし）。はしが ない 世界では 試さない
      const size = h.world.size?.() ?? null;
      if (size) {
        const top = size.y - 1;
        T.base();
        (window as any).__arena.floor(0, 0, 20, 20, { y: top - 1 });
        h.world.setBlock(6, top, 6, 'stone');
        h.step(1);
        h.player.set({ position: { x: 2.5, y: top, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } });
        h.step(2);
        T.hold('water_bucket');
        T.aim(6, top, 6);
        T.mark();
        o.c3 = { spot: h.farm.bucketSpot() };
        T.tap();
        o.c3 = { ...o.c3, slot: T.slot0(), place: T.evs('bucketPlace').length, no: T.evs('bucketNo').length };
      }
      // (4) 妖怪の箱: ねらう床の 上の マスに 妖怪を おく
      T.base();
      T.hold('water_bucket');
      T.aim(6, 8, 6);
      const s = h.farm.bucketSpot();
      h.yokai.spawn('karakasa', s.x + 0.5, s.y, s.z + 0.5, { ai: false, yawDeg: 270 });
      h.step(2);
      T.aim(6, 8, 6);
      T.mark();
      o.c4 = { spot: h.farm.bucketSpot() };
      T.tap();
      o.c4 = { ...o.c4, ...snap(), block: h.world.getBlock(s.x, s.y, s.z) };
      // (5) 空
      T.base();
      T.hold('water_bucket');
      h.player.set({ pitch: 80 });
      h.step(2);
      T.mark();
      o.c5 = { spot: h.farm.bucketSpot() };
      T.tap();
      o.c5 = { ...o.c5, ...snap(), no: T.evs('bucketNo').length };
      return o;
    });
    const bucket = { item: 'water_bucket', count: 1 };
    for (const k of ['c1', 'c2', 'c4', 'c5'] as const) {
      expect(r[k].spot, k).toBeNull();
      expect(r[k].slot, k).toEqual(bucket);
      expect(r[k].water, k).toBe(0);
      expect(r[k].place, k).toBe(0);
    }
    expect(r.c1.no).toBeGreaterThan(0);
    expect(r.c2.no).toBeGreaterThan(0);
    expect(r.c2.crop).toBe(true);
    expect(r.c4.block).not.toBe('water');
    expect(r.c5.no).toBe(0); // 空は 音なし
    if (r.c3) {
      expect(r.c3.spot).toBeNull();
      expect(r.c3.slot).toEqual(bucket);
      expect(r.c3.place).toBe(0);
      expect(r.c3.no).toBeGreaterThan(0);
    }
  });

  test('AC9 合図・案内: bucket の 合図（ふりがな・120 ステップ）・照準の下 くむ/おく/くもう・4g は 出ない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const o: any = {};
      T.base();
      h.world.setBlock(6, 8, 4, 'water');
      T.soil(5, 6);
      h.farm.plant(5, 8, 6, 'tomato');
      h.step(1);
      const hint = () => {
        h.step(3);
        return h.hud.actionHint().right ?? null;
      };
      T.hold('bucket');
      T.aim(6, 8, 4);
      o.fill = hint();
      T.aim(8, 8, 8);
      o.empty = hint();
      T.hold('water_bucket');
      T.aim(8, 8, 8);
      o.place = hint();
      T.aim(5, 9, 6, 0.5); // 4g: 作物を ねらう
      o.g4 = hint();
      h.player.set({ pitch: 80 });
      o.g4sky = hint();
      // 合図
      T.hold('bucket');
      T.aim(8, 8, 8);
      T.tap();
      h.step(3);
      const chip = document.querySelector('#farm-hint');
      o.hint = h.farm.lastHint();
      o.text = chip?.textContent ?? '';
      o.ruby = chip?.querySelectorAll('ruby').length ?? 0;
      h.step(110);
      o.mid = (document.querySelector('#farm-hint:not([hidden])')?.textContent ?? '').length > 0;
      h.step(20);
      o.gone = (document.querySelector('#farm-hint:not([hidden])')?.textContent ?? '') === '';
      o.last = h.farm.lastHint();
      return o;
    });
    expect(r.fill).toEqual({ icon: 'bucket', word: 'くむ' });
    expect(r.empty).toEqual({ icon: 'bucket', word: 'くもう' });
    expect(r.place).toEqual({ icon: 'water_bucket', word: 'おく' });
    expect(!r.g4 || !r.g4.word).toBe(true);
    expect(!r.g4sky || !r.g4sky.word).toBe(true);
    expect(r.hint).toBe('bucket');
    expect(r.text).toContain('バケツ');
    expect(r.text).toContain('くもう');
    expect(r.ruby).toBeGreaterThan(0);
    expect(r.mid).toBe(true);
    expect(r.gone).toBe(true);
    expect(r.last).toBeNull();
  });

  test('AC10 保存: water_bucket と 置いた 水が 読み直しても そのまま', async ({ page }) => {
    await open(page, '?seed=7');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
    await installAimHelpers(page);
    await installArena(page);
    await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const A = (window as any).__aim;
      h.pause();
      h.lock.simulate(true);
      (window as any).__arena.floor(0, 0, 14, 14);
      h.inventory.clear();
      h.inventory.add('water_bucket', 1);
      h.inventory.add('water_bucket', 1);
      h.inventory.select(0);
      A.standForS(2.5, 6.5, 90, -30, 9);
      h.step(2);
      A.solve(6, 8, 6, 1);
      h.step(1);
      const s = h.farm.bucketSpot();
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      h.step(2);
      (window as any).spot = s;
      localStorage.setItem('__spot', JSON.stringify(s));
      localStorage.setItem('__before', JSON.stringify({ wb: h.inventory.count('water_bucket'), b: h.inventory.count('bucket') }));
      await h.save.now();
    });
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.step(0);
      const s = JSON.parse(localStorage.getItem('__spot')!);
      return {
        before: JSON.parse(localStorage.getItem('__before')!),
        wb: h.inventory.count('water_bucket'),
        b: h.inventory.count('bucket'),
        block: h.world.getBlock(s.x, s.y, s.z),
      };
    });
    expect(r.before.wb + r.before.b).toBe(2);
    expect(r.wb).toBe(r.before.wb);
    expect(r.b).toBe(r.before.b);
    expect(r.b).toBeGreaterThanOrEqual(1);
    expect(r.block).toBe('water');
  });
});
