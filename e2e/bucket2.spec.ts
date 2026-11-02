import { expect, test, type Page } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';
import { installArena } from './helpers/arena';

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

/** BUCKET-2（docs/design/BUCKET-2.md）: わきどころを くむ・マグマを くむ・マグマを おく。スクショは BK_SHOTS が ある とき */
const SHOTS = process.env.BK_SHOTS;

test.describe('BUCKET-2 マグマの バケツ・わきどころ', () => {
  test('AC3: からの バケツで わきどころ（水・マグマ）を くむ → 量 8 の バケツ、わきどころは 空気', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const o: any = {};
      for (const [spring, key] of [['wakimizu', 'w'], ['magma_wakimizu', 'm']]) {
        T.base();
        h.world.setBlock(6, 9, 6, spring);
        h.step(1);
        T.hold('bucket');
        T.aim(6, 9, 6);
        T.tap();
        o[key] = { slot: T.slotW(), block: h.world.getBlock(6, 9, 6) };
      }
      return o;
    });
    expect(r.w).toEqual({ slot: { item: 'water_bucket', count: 1, water: 8 }, block: 'air' });
    expect(r.m).toEqual({ slot: { item: 'magma_bucket', count: 1, water: 8 }, block: 'air' });
  });

  test('AC1・AC4: からの バケツで マグマを くみ、マグマの バケツで おく（量 8）。バケツは から', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const o: any = {};
      T.base();
      h.water.magma.set(6, 8, 6, 8);
      h.step(1);
      T.hold('bucket');
      T.aim(6, 8, 6);
      T.tap();
      o.slot = T.slotW();
      o.left = h.world.getBlock(6, 8, 6);
      T.aim(5, 8, 7);
      const s = h.farm.bucketSpot();
      o.spot = s;
      T.tap();
      o.placed = s ? h.water.magma.amount(s.x, s.y, s.z) : null;
      o.after = T.slotW();
      o.place = T.evs('bucketPlace').map((e: any) => e.liquid);
      return o;
    });
    expect(r.slot).toEqual({ item: 'magma_bucket', count: 1, water: 8 });
    expect(r.left).toBe('air');
    expect(r.spot).not.toBeNull();
    expect(r.placed).toBe(8);
    expect(r.after).toEqual({ item: 'bucket', count: 1, water: 0 });
    expect(r.place).toContain('magma');
    if (SHOTS) {
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const T = (window as any).T;
        T.hold('magma_bucket', { water: 8 });
        h.inventory.setSlot(1, { item: 'water_bucket', count: 1 });
        h.inventory.setSlot(2, { item: 'bucket', count: 1 });
        h.world.setBlock(8, 9, 6, 'wakimizu');
        h.world.setBlock(8, 9, 8, 'magma_wakimizu');
        T.stand(2.5, 7, 90, -20);
        h.step(30);
      });
      await page.screenshot({ path: `${SHOTS}/bucket-collect-place.png` });
    }
  });
});
