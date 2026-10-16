import type { Page } from '@playwright/test';

/**
 * バランス（BAL）の E2E の共通の準備。ページの中では `window.T` として使う（`openBal(page)` を 1 回）。
 *   T.base()           一時停止・夜でない・妖怪なし・平らな広場・プレイヤーは (2.5, 9, 6.5)
 *   T.one(id)          yokai.list() の 1 行
 *   T.faceTo(id, dist) 妖怪の手前に 立って 向く（当たるか raycast で確かめた結果を返す）
 *   T.punch()          すでで 1 回たたく（30 ステップ目に当たる）
 *   T.sounds(prefix?)  combat.sounds()（呼ぶと空）のうち prefix で始まる物
 * 時刻（dayTick）: 昼 = 20000、夜 = 70000（昼 54000・ゆうがた 5400・夜 27000）。
 */
export async function openBal(page: Page): Promise<void> {
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
        h.inventory.clear();
        h.armor.set(null, null, null, null);
        h.time.set(20000);
        h.combat.setHp(20);
        T.place(2.5, 9, 6.5);
        h.step(10);
        h.yokai.events();
        h.combat.events();
        h.level.events();
        h.combat.sounds?.();
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
      punch() {
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        h.step(40);
      },
      sounds(prefix = '') {
        return h.combat.sounds().filter((n: string) => n.startsWith(prefix));
      },
    };
    (window as any).T = T;
  });
}
