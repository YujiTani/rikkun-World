import type { Page } from '@playwright/test';
import { installAimHelpers } from './aim';
import { openBiome } from './biome';

/**
 * FLORA-75（くさ・のばな・間隔のきまり）の E2E の共通の準備。場所・高さ・種類は ゲーム（window.__rikkun）に聞く。決め打ちしない。
 *   openFlora(page, query)     openBiome ＋ ねらいの道具（__aim）＋ 昼。query の既定は '?nosave=1'
 *   measureStart(page)         スタートで 描画回数・三角形（renderStats）。ゴールデンと 比べる「あと」
 *   measureCountry(page, kind) その国の まん中で 4 方向の 三角形・描画回数の いちばん多い値
 * ページの中では `window.__floraT` を使う（openFlora のあと）:
 *   __floraT.stand(x, z)       (x, z) の 地面に 立たせる（読みこまれるまで step）。返す { loaded, y }
 *   __floraT.aimAt(x, y, z)    いまの足もとから ブロック (x, y, z) を ねらう（target.get() で 確かめる）
 *   __floraT.bestSpot(x, y, z) ブロック (x, y, z) を ねらえる立ち位置を まわりから さがして 立つ。返すのは target.get() が そのブロックか
 */
export async function openFlora(page: Page, query = '?nosave=1'): Promise<void> {
  await openBiome(page, query);
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.time.set(12000);
    (window as any).__floraT = {
      stand(x: number, z: number) {
        const r = (window as any).__biomeT.goToPoint({ x, z });
        return { loaded: r.loaded as boolean, y: h.world.groundHeight(x, z) as number };
      },
      aimAt(x: number, y: number, z: number) {
        (window as any).__aim.solve(x, y, z, 0.5);
        h.step(1);
      },
      /** ブロック (x, y, z) を ねらえる所に 立つ。まわり 4 方向 × 距離 2〜3 を 順に ためす */
      bestSpot(x: number, y: number, z: number) {
        for (const d of [2, 3]) {
          for (const [dx, dz] of [[0, d], [0, -d], [d, 0], [-d, 0]] as const) {
            const sx = x + dx;
            const sz = z + dz;
            const gy = h.world.groundHeight(sx, sz);
            if (!h.world.isLoaded(sx, sz) || gy > y + 2) continue;
            h.player.set({ position: { x: sx + 0.5, y: gy + 1, z: sz + 0.5 }, velocity: { x: 0, y: 0, z: 0 } });
            h.step(2);
            (window as any).__aim.solve(x, y, z, 0.5);
            h.step(1);
            const t = h.target.get();
            if (t && t.block.x === x && t.block.y === y && t.block.z === z) return true;
          }
        }
        return false;
      },
    };
  });
}

/** メッシュと 光の 待ちが なくなるまで 進める（時間でなく step の数。上限つき） */
async function settleAll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const h = (window as any).__rikkun;
    await h.world.settle({ full: true });
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n += 5) h.step(5);
  });
}

export type Tris = { drawCalls: number; triangles: number };

/** スタートで 立って 北を向き、描画回数と 三角形を 読む（AC11 の「あと」。ゴールデンも 同じやり方で 記録した） */
export async function measureStart(page: Page): Promise<Tris> {
  await settleAll(page);
  return page.evaluate(() => {
    const h = (window as any).__rikkun;
    const sp = h.world.spawn();
    h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, yaw: 0, pitch: 0, velocity: { x: 0, y: 0, z: 0 } });
    h.step(3);
    const s = h.renderStats();
    return { drawCalls: s.drawCalls as number, triangles: s.triangles as number };
  });
}

/** その国の まん中へ 行き、4 方向（yaw 0・90・180・270）の 描画の いちばん多い値 */
export async function measureCountry(page: Page, kind: string): Promise<Tris & { here: string }> {
  await page.evaluate((k) => (window as any).__biomeT.goTo(k), kind);
  await settleAll(page);
  return page.evaluate(() => {
    const h = (window as any).__rikkun;
    let drawCalls = 0;
    let triangles = 0;
    for (const yaw of [0, 90, 180, 270]) {
      h.player.set({ yaw, pitch: 0, velocity: { x: 0, y: 0, z: 0 } });
      h.step(3);
      const s = h.renderStats();
      drawCalls = Math.max(drawCalls, s.drawCalls);
      triangles = Math.max(triangles, s.triangles);
    }
    return { drawCalls, triangles, here: h.biome.here().kind as string };
  });
}
