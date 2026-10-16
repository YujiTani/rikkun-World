import type { Page } from '@playwright/test';

/** SOUND-1 の E2E の準備（window.__rikkun.audio に聞いて確かめる。決め打ちの座標は使わない） */

export async function openGame(page: Page, query = '?nosave=1') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  // 最初のクリックで音が使えるようになる（unlock）。あそぶ画面にもどす
  await page.mouse.click(300, 300);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.step(2);
  });
}

/** いまの場所を中心に石の床（広さ ±12）と空を作り、床の真ん中に立つ。妖怪・自動出現なし */
export async function flatArea(page: Page) {
  return page.evaluate(() => {
    const h = window.__rikkun! as any;
    const p = h.player.get().position;
    const bx = Math.floor(p.x);
    const by = Math.floor(p.y);
    const bz = Math.floor(p.z);
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
    h.world.fill(bx - 12, by - 1, bz - 12, bx + 12, by - 1, bz + 12, 'stone');
    h.world.fill(bx - 12, by, bz - 12, bx + 12, by + 8, bz + 12, 'air');
    h.player.set({ position: { x: bx + 0.5, y: by, z: bz + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
    h.step(10);
    return { bx, by, bz };
  });
}

/** n ステップ進めながら、ほかの効果音の記録をためて返す（audio.sfx() は読むと空になるので） */
export async function stepCollectSfx(page: Page, n: number) {
  return page.evaluate((n) => {
    const h = window.__rikkun! as any;
    const out: any[] = [];
    for (let i = 0; i < n; i++) {
      h.step(1);
      out.push(...h.audio.sfx());
    }
    return out;
  }, n);
}
