import type { Page } from '@playwright/test';

/**
 * 国（バイオーム。#184）の E2E の共通の準備。ページの中では `window.__biomeT` として使う（`openBiome(page)` を 1 回）。
 *   __biomeT.goToPoint({x,z})  同じことを 点で（FLORA-75）。
 *   __biomeT.goTo(kind)   biome.find(kind) の点へ キャラを運び、その列が読みこまれるまで step し、地面の上に立たせる。
 *                         返すのは { point, loaded, here }（here = biome.here() の kind）。
 * COUNTRY-1（#291）: 準備で `biome.quiet(true)`（しずかモード）にする。「入った」の判定を 見る テストは 自分で `quiet(false)` に もどす。
 * 場所・高さは ゲームに聞く（決め打ちしない）。待つのは step の数で、時間（ms）では待たない。
 */
export async function openBiome(page: Page, query = '?nosave=1'): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    // COUNTRY-1 §4.3: 国へ運んでも「入った」の判定をしない（実績・音・おしらせが ふえない）。実装の前は 口が無いので ?. で読む
    h.biome.quiet?.(true);
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
    (window as any).__biomeT = {
      goTo(kind: string) {
        return (window as any).__biomeT.goToPoint(h.biome.find(kind));
      },
      /** (x, z) へ運ぶ（kind でなく 点でもよい版。FLORA-75 で足した）。返すのは { point, loaded, here } */
      goToPoint(p: { x: number; z: number }) {
        const sea = h.world.seaY();
        // まだ読みこまれていない所なので、まず高い所へ。読みこまれるのを step で待つ（上限つき）
        h.player.set({ position: { x: p.x + 0.5, y: sea + 100, z: p.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        let n = 0;
        while (!h.world.isLoaded(p.x, p.z) && n < 600) {
          h.step(10);
          h.player.set({ position: { x: p.x + 0.5, y: sea + 100, z: p.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 } });
          n++;
        }
        const loaded = h.world.isLoaded(p.x, p.z);
        if (loaded) {
          const gy = h.world.groundHeight(p.x, p.z);
          h.player.set({ position: { x: p.x + 0.5, y: gy + 1, z: p.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 } });
          h.step(2);
        }
        return { point: p, loaded, here: h.biome.here().kind as string };
      },
    };
  });
}
