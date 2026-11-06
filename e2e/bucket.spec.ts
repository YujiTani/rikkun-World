import { expect, test, type Page } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';
import { installArena } from './helpers/arena';

/**
 * BUCKET-1 バケツの受け入れ確認（docs/design/BUCKET-1.md §6 の AC のうち E2E で見るもの:
 * AC2・AC4・AC5・AC6・AC7・AC9・AC10）。実装の前に書いたテスト（落ちるのが正しい）。
 * 数・座標は決め打ちせず、設定（reach・farmWetRange…）と窓口（target.get()・farm.bucketSpot()）に聞く。
 * 床は __arena.floor（y=8）。置く水のマスは bucketSpot() が返した物を使う。
 * WATER-1（#376）: AC4・AC5・AC6・AC10 は 有限の 水に 合わせて 書きかえた（くむと へる・バケツの 量・流れない くぼみ）。
 * 水を 置いて 動かさない ので T.base() の あたまで `water.pause(true)`。流れる 所だけ pause(false)。
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
        h.water.pause(true); // WATER-1: 水を 置いて 動かさない
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
      hold(item: string, extra: any = {}) {
        h.inventory.clear();
        if (Object.keys(extra).length > 0) h.inventory.setSlot(0, { item, count: 1, ...extra });
        else h.inventory.add(item, 1);
        h.inventory.select(0);
        h.step(1);
      },
      slot0() {
        const s = h.inventory.get().slots[0];
        return s ? { item: s.item, count: s.count } : null;
      },
      /** 持つ マスの 水の 量つき（欄 なしの みずの バケツ = 8、バケツ = 0） */
      slotW() {
        const s = h.inventory.get().slots[0];
        return s ? { item: s.item, count: s.count, water: s.water ?? (s.item === 'water_bucket' ? 8 : 0) } : null;
      },
      /** このステップまでの出来事の数を覚えて、あとの分だけ返す */
      mark() {
        T._n = h.farm.events().length;
      },
      evs(type?: string) {
        const l = h.farm.events().slice(T._n ?? 0);
        return type ? l.filter((e: any) => e.type === type) : l;
      },
      /** 広場の 水の 量の 合計（WATER-1: 量 1〜8 の 水ぜんぶ） */
      waterCount() {
        return h.water.total(0, 8, 0, 20, 12, 20);
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
  test('AC2 つくる: カードの 順（LIVE-1 版 3 で mushi_ami・LIVE-2 で nukunuku・toriya が ふえ、GOLD-1 の きんの そうび 8 こ・KONGO-1 の こんごうの そうび 8 こ・MINE-1B の チョーク・しっくいが うしろに ふえた）・29 まい目 bucket（28 まい目 sprinkler）・てつ 3 で 1 こ・craft:bucket 1', async ({ page }) => {
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
        at29: ids[29], // TAKO-1: ふで が まえに 1 まい ふえた
        at28: ids[28],
        after: ids.slice(30),
        bucket: h.inventory.count('bucket'),
        iron: h.inventory.count('iron_ingot'),
        stat: h.achievements.stats()['craft:bucket'] ?? 0,
      };
    });
    expect(r.at29).toBe('bucket');
    expect(r.at28).toBe('sprinkler');
    // バケツの うしろは「むしとりあみ・こたつ・とりごや → きんの そうび 8 → こんごうの そうび 8 → チョーク・しっくい」の 順（うしろに ふえる シリーズに よらない ように、むしとりあみから 数える）
    const m = r.after.indexOf('mushi_ami');
    expect(m, 'むしとりあみが バケツの うしろに ある').toBeGreaterThanOrEqual(0);
    expect(r.after.slice(m, m + 3), 'きんの そうびの まえは むしとりあみ・こたつ・とりごや').toEqual(['mushi_ami', 'nukunuku', 'toriya']);
    expect(r.after.slice(m + 3, m + 11), 'きんの そうび 8 こ（GOLD-1 §4.2 の 順）').toEqual(['kin_katana', 'kin_yumi', 'kin_pickaxe', 'kin_axe', 'kin_kabuto', 'kin_yoroi', 'kin_kote', 'kin_suneate']);
    expect(r.after.slice(m + 11, m + 19), 'つぎは こんごうの そうび 8 こ（KONGO-1 §4.1 の 順）').toEqual(['kongo_katana', 'kongo_yumi', 'kongo_pickaxe', 'kongo_axe', 'kongo_kabuto', 'kongo_yoroi', 'kongo_kote', 'kongo_suneate']);
    // MINE-1B: こんごうの うしろに チョーク → しっくい（§4.4。作業台の カードの うしろに この 順。さらに うしろに 足しても よい）
    const added = r.after.slice(m + 19);
    expect(added, 'MINE-1B: チョーク').toContain('chalk');
    expect(added, 'MINE-1B: しっくい').toContain('shikkui');
    expect(added.indexOf('chalk'), 'チョーク → しっくい の 順').toBeLessThan(added.indexOf('shikkui'));
    expect(r.bucket).toBe(1);
    expect(r.iron).toBe(0);
    expect(r.stat).toBe(1);
  });

  test('AC4 くむ（WATER-1）: 量 8 → みずの バケツ(8)・マスは air。量 3 → 3。量 5 の バケツで 量 8 → 8・マス 5。8 で もう 1 回は かわらず。とどかない水。押しつづけても 1 回', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const o: any = {};
      // 量 8 を くむ
      T.base();
      h.water.set(6, 8, 6, 8);
      h.step(1);
      T.hold('bucket');
      T.aim(6, 8, 6);
      T.mark();
      T.tap();
      o.slot = T.slotW();
      o.block = h.world.getBlock(6, 8, 6);
      o.amount = h.water.amount(6, 8, 6);
      o.fill = T.evs('bucketFill');
      // みずの バケツ(8) で もう 1 回: かわらない（マスも へらない）
      h.water.set(6, 8, 6, 8);
      T.mark();
      T.tap();
      o.slot2 = T.slotW();
      o.amount2 = h.water.amount(6, 8, 6);
      o.changed2 = T.evs('bucketFill').filter((e: any) => e.changed).length;
      // 量 3 の マス
      T.base();
      h.water.set(6, 8, 6, 3);
      h.step(1);
      T.hold('bucket');
      T.aim(6, 8, 6);
      T.tap();
      o.slot3 = T.slotW();
      o.block3 = h.world.getBlock(6, 8, 6);
      o.amount3 = h.water.amount(6, 8, 6);
      // 量 5 の バケツで 量 8 の マス → バケツ 8・マス 量 5
      T.base();
      h.water.set(6, 8, 6, 8);
      h.step(1);
      T.hold('water_bucket', { water: 5 });
      T.aim(6, 8, 6);
      T.mark();
      T.tap();
      o.slot58 = T.slotW();
      o.amount58 = h.water.amount(6, 8, 6);
      o.changed58 = T.evs('bucketFill').filter((e: any) => e.changed).length;
      // とどかない水（reach + 1 マス先）
      const reach: number = h.settings.get('reach');
      const fx = 2 + reach + 2;
      T.base();
      h.water.set(fx, 8, 6, 8);
      h.step(1);
      T.hold('bucket');
      T.aim(fx, 8, 6);
      T.mark();
      T.tap();
      o.far = { slot: T.slot0(), fills: T.evs('bucketFill').filter((e: any) => e.changed).length, amount: h.water.amount(fx, 8, 6) };
      // 押しつづけ
      const rep: number = h.settings.get('farmPourRepeatTicks');
      T.base();
      h.water.set(6, 8, 6, 8);
      h.step(1);
      T.hold('bucket');
      T.aim(6, 8, 6);
      T.mark();
      h.input.press('secondary');
      h.step(rep * 2 + 1);
      h.input.release('secondary');
      h.step(1);
      o.heldChanged = T.evs('bucketFill').filter((e: any) => e.changed).length;
      o.heldSlot = T.slotW();
      return o;
    });
    expect(r.slot).toEqual({ item: 'water_bucket', count: 1, water: 8 });
    expect(r.block, '水の マスは air に へる').toBe('air');
    expect(r.amount).toBe(0);
    expect(r.fill).toHaveLength(1);
    expect(r.fill[0].changed).toBe(true);
    expect(r.slot2).toEqual({ item: 'water_bucket', count: 1, water: 8 });
    expect(r.amount2, '満杯の バケツでは マスを へらさない').toBe(8);
    expect(r.changed2).toBe(0);
    expect(r.slot3).toEqual({ item: 'water_bucket', count: 1, water: 3 });
    expect(r.block3).toBe('air');
    expect(r.amount3).toBe(0);
    expect(r.slot58).toEqual({ item: 'water_bucket', count: 1, water: 8 });
    expect(r.amount58, '8 − 5 = 3 とって のこりは 5').toBe(5);
    expect(r.changed58).toBe(1);
    expect(r.far.slot).toEqual({ item: 'bucket', count: 1 });
    expect(r.far.fills).toBe(0);
    expect(r.far.amount, 'とどかない水は へらない').toBe(8);
    expect(r.heldChanged).toBe(1);
    expect(r.heldSlot).toEqual({ item: 'water_bucket', count: 1, water: 8 });
  });

  test('AC5 おく（WATER-1）: bucketSpot の マスが water（量 8）・bucket に もどる・bucketPlace。量 3 なら water_3。押しつづけても バケツ 1 杯 分 だけ', async ({ page }) => {
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
      o.amount = s ? h.water.amount(s.x, s.y, s.z) : null;
      o.slot = T.slotW();
      o.place = T.evs('bucketPlace');
      o.stat = h.achievements.stats()['bucketPlace'] ?? 0;
      o.water = T.waterCount();
      // 量 3 の バケツ
      T.base();
      T.hold('water_bucket', { water: 3 });
      T.aim(6, 8, 6);
      const s3 = h.farm.bucketSpot();
      T.tap();
      o.block3 = s3 ? h.world.getBlock(s3.x, s3.y, s3.z) : null;
      o.amount3 = s3 ? h.water.amount(s3.x, s3.y, s3.z) : null;
      o.slot3 = T.slotW();
      o.water3 = T.waterCount();
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
    expect(r.amount).toBe(8);
    expect(r.slot).toEqual({ item: 'bucket', count: 1, water: 0 });
    expect(r.place).toHaveLength(1);
    expect(r.stat).toBe(1);
    expect(r.water, '水は バケツ 1 杯 分').toBe(8);
    expect(r.block3).toBe('water_3');
    expect(r.amount3).toBe(3);
    expect(r.slot3).toEqual({ item: 'bucket', count: 1, water: 0 });
    expect(r.water3).toBe(3);
    expect(r.heldWater, '押しつづけても バケツ 1 杯 分 だけ').toBe(8);
    expect(r.heldPlace).toBe(1);
  });

  test('AC6 しめって 育つ（WATER-1）: 流れない くぼみの 水で 横 R-1 の はたけは しめる・R+1 は かわいたまま・その 水を バケツで くむと かわく', async ({ page }) => {
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
      // 置いた 水の まわり 4 つを 石に して、下も 横も 固い 1 マスの くぼみに する（パスを 止めた まま）
      const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of walls) h.world.setBlock(s.x + dx, s.y, s.z + dz, 'stone');
      h.water.pause(false);
      h.step(recheck);
      o.near = h.farm.soil(s.x, s.y - 1, nearZ).wet;
      o.crop = h.farm.crop(s.x, s.y, nearZ)?.wet;
      o.far = h.farm.soil(s.x, s.y - 1, farZ).wet;
      o.stay = { amount: h.water.amount(s.x, s.y, s.z), queue: h.water.queue(), stable: h.water.stable(s.x, s.y, s.z, s.x, s.y, s.z) };
      // バケツで くむ（石を 置くと 押し出されて のこる ため）。ねらいの 側の かべを あけて、止めた まま くむ
      h.water.pause(true);
      h.world.setBlock(s.x - 1, s.y, s.z, 'air');
      T.hold('bucket');
      T.aim(s.x, s.y, s.z, 0.9);
      T.tap();
      o.taken = { slot: T.slotW(), amount: h.water.amount(s.x, s.y, s.z), block: h.world.getBlock(s.x, s.y, s.z) };
      h.step(recheck + 2);
      o.dried = h.farm.soil(s.x, s.y - 1, nearZ).wet;
      return o;
    });
    expect(r.dry0).toEqual({ near: false, far: false });
    expect(r.placed).toBe('water');
    expect(r.near).toBe(true);
    expect(r.crop).toBe(true);
    expect(r.far).toBe(false);
    expect(r.stay.amount, 'くぼみの 水は 流れない').toBe(8);
    expect(r.stay.stable).toBe(true);
    expect(r.taken.slot).toEqual({ item: 'water_bucket', count: 1, water: 8 });
    expect(r.taken.block).toBe('air');
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
      T.aim(4, 8, 8);
      o.empty = hint();
      T.hold('water_bucket');
      T.aim(4, 8, 8);
      o.place = hint();
      T.aim(5, 9, 6, 0.5); // 4g: 作物を ねらう
      o.g4 = hint();
      h.player.set({ pitch: 80 });
      o.g4sky = hint();
      // 合図
      T.hold('bucket');
      T.aim(4, 8, 8);
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

  test('AC10 保存（WATER-1）: 量 8 と 3 の みずの バケツ と 置いた 水（water_3）が 読み直しても そのまま', async ({ page }) => {
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
      h.water.pause(true); // 置いた 水を 動かさない（まわりを 石で かこむ まで）
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'water_bucket', count: 1, water: 3 });
      h.inventory.setSlot(1, { item: 'water_bucket', count: 1, water: 8 });
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
      // 流れない くぼみに する（まわり 4 つが 石）
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) h.world.setBlock(s.x + dx, s.y, s.z + dz, 'stone');
      const slots = h.inventory.get().slots;
      localStorage.setItem('__spot', JSON.stringify(s));
      localStorage.setItem(
        '__before',
        JSON.stringify({ wb: h.inventory.count('water_bucket'), b: h.inventory.count('bucket'), placed: h.world.getBlock(s.x, s.y, s.z), amount: h.water.amount(s.x, s.y, s.z), slot1: slots[1]?.water ?? (slots[1]?.item === 'water_bucket' ? 8 : 0) }),
      );
      await h.save.now();
    });
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.step(0);
      const s = JSON.parse(localStorage.getItem('__spot')!);
      const slots = h.inventory.get().slots;
      return {
        before: JSON.parse(localStorage.getItem('__before')!),
        wb: h.inventory.count('water_bucket'),
        b: h.inventory.count('bucket'),
        block: h.world.getBlock(s.x, s.y, s.z),
        amount: h.water.amount(s.x, s.y, s.z),
        left: slots.filter((x: any) => x && x.item === 'water_bucket').map((x: any) => x.water ?? 8),
      };
    });
    expect(r.before.wb + r.before.b).toBe(2);
    expect(r.before.placed).toBe('water_3');
    expect(r.before.amount).toBe(3);
    expect(r.wb).toBe(r.before.wb);
    expect(r.b).toBe(r.before.b);
    expect(r.b).toBeGreaterThanOrEqual(1);
    expect(r.left, '残った みずの バケツは 量 8').toEqual([8]);
    expect(r.block, '置いた 水も 読み直し後 同じ').toBe('water_3');
    expect(r.amount).toBe(3);
  });
});
