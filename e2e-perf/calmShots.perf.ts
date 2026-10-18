import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { QUIET, open, scene } from './shadowScenes';

/**
 * #194 ブロックの絵の見くらべ: 昼・水ぎわ・夜・ほらあなを 同じ場面で撮る（ブランチごとに撮って くらべる）。
 * 出力: CALM_OUT（既定 calm-shots/）に <場面>-<CALM_LABEL（既定 now）>.png
 */
const OUT = process.env.CALM_OUT ?? 'calm-shots';
mkdirSync(OUT, { recursive: true });

async function waterside(page: Page): Promise<void> {
  await page.evaluate((quiet) => {
    const h = (window as any).__rikkun;
    const q = eval(quiet as string);
    const sp = h.world.spawn();
    const x0 = Math.floor(sp.x) - 10;
    const z0 = Math.floor(sp.z) - 30;
    const gy = h.world.groundHeight(x0 + 8, z0 + 8);
    // 草はら・砂浜・池（17×17）
    h.world.fill(x0, gy + 1, z0, x0 + 16, gy + 16, z0 + 16, 'air');
    h.world.fill(x0, gy - 3, z0, x0 + 16, gy - 1, z0 + 16, 'dirt');
    h.world.fill(x0, gy, z0, x0 + 16, gy, z0 + 16, 'grass');
    h.world.fill(x0 + 2, gy, z0 + 2, x0 + 14, gy, z0 + 10, 'sand');
    h.world.fill(x0 + 4, gy - 2, z0 + 3, x0 + 12, gy, z0 + 8, 'water');
    h.world.fill(x0 + 13, gy + 1, z0 + 13, x0 + 13, gy + 4, z0 + 13, 'log');
    h.world.fill(x0 + 11, gy + 4, z0 + 11, x0 + 15, gy + 6, z0 + 15, 'leaves');
    h.world.setBlock(x0 + 13, gy + 4, z0 + 13, 'log');
    h.time.set(14000);
    q(h);
    h.player.set({ position: { x: x0 + 8.5, y: gy + 1, z: z0 + 13.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -22 });
    h.step(3);
    q(h);
  }, QUIET);
}

const SHOTS: [string, string][] = [
  ['day', 'start'],
  ['water', 'water'],
  ['night', 'night'],
  ['cave', 'cave'],
];

const label = process.env.CALM_LABEL ?? 'now';
test(`#194 calm ${label}`, async ({ page }) => {
  await open(page, '');
  for (const [name, sc] of SHOTS) {
    if (sc === 'water') await waterside(page);
    else await scene(page, sc);
    await page.screenshot({ path: `${OUT}/${name}-${label}.png` });
  }
});
