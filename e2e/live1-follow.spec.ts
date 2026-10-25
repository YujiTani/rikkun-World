import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-1 E2E その 2（docs/design/LIVE-1.md 版 3.2 §6）: AC10〜12（版 2 の まま。ついてくる・ワープ・重ならない。
 * 版 3.2 の AC 番号では「ついてくる うごき」は §2.7）・AC15 ついてくる 時間・AC16 頭の 上の しるし・AC24 保存（follow）。
 * #311: ついてくる・ワープ・重ならない・時間・しるし・だっこ中の 保存は ユニットへ（src/animals/animals.test.ts・src/fx/animalFxV32.test.ts）。
 * ここには 本物の 保存→読み直し（AC24）だけ 残す。
 * 距離・時間は 設定（animalFollow* / animalWarpDist / animalStuckTicks）から 読む。
 */
test.describe('LIVE-1 なかま（ついてくる・ワープ・保存）', () => {
  // 3 並列の SwiftShader で 30〜60 秒かかる テストが あり、60 秒だと 時間切れに なる（期待は 変えない）
  test.describe.configure({ timeout: 150_000 });
  test('AC24 保存: なかま 3 わ（follow まんたん・500・0）は 位置・follow が もどる。fullLeft は 0。やせいは いなくなる', async ({ page }) => {
    await openAnimals(page, '?');
    const before = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(24);
      h.time.set(12000);
      h.step(2);
      const full = A.full();
      h.animals.spawn(3.5, 9, 6.5, { friend: true, follow: full, fullLeft: 300 });
      h.animals.spawn(4.5, 9, 7.5, { friend: true, follow: 500 });
      h.animals.spawn(4.5, 9, 5.5, { friend: true, follow: 0 });
      h.player.set({ position: { x: 3.5, y: 9, z: 6.5 }, yaw: 90 });
      h.animals.spawn(12.5, 9, 12.5, { hearts: 1 });
      h.step(10);
      const before = h.animals.list().filter((a: any) => a.friend).map((a: any) => ({ x: a.x, y: a.y, z: a.z, yaw: a.yaw, follow: a.follow }));
      await h.save.now();
      return before;
    });
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      h.settings.set('animalAutoSpawn', false);
      await h.world.settle({ full: true });
    });
    const after = await page.evaluate(() => (window as any).__rikkun.animals.list());
    const friends = after.filter((a: any) => a.friend);
    expect(friends).toHaveLength(3);
    expect(after.filter((a: any) => !a.friend)).toHaveLength(0);
    for (const f of friends) expect(f.fullLeft, 'おなかいっぱいは 保存しない').toBe(0);
    for (const b of before) {
      const m = friends.reduce((best: any, a: any) => (Math.hypot(a.x - b.x, a.z - b.z) < Math.hypot(best.x - b.x, best.z - b.z) ? a : best));
      for (const k of ['x', 'y', 'z', 'yaw']) expect(Math.abs(m[k] - b[k]), `${k}`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(m.follow - b.follow), `follow ${b.follow}`).toBeLessThanOrEqual(3);
    }
    expect(friends.map((f: any) => f.follow).sort((a: number, b: number) => a - b)[0]).toBe(0);
  });

});
