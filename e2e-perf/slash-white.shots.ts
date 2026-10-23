import { test } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { legendWorld, spawnAt } from '../e2e/helpers/legend';

/**
 * 白い 斬撃（全部の 刀の 土台）の ゲーム内 GIF（オーナーに 見せる 試作）。判定は しない。
 * 実行: npx playwright test --config playwright.slashwhite.config.ts
 * 時間では なく コマ送り（__rikkun.step(1)）で 1 コマずつ 撮る（クラウドは GPU なし）。出力: SLASH_GIF_DIR（既定 /tmp/slash-white-gif）
 */
test.describe.configure({ mode: 'serial', timeout: 600_000 });
type P = import('@playwright/test').Page;
const GIF = process.env.SLASH_GIF_DIR ?? '/tmp/slash-white-gif';
const FRAMES = process.env.SLASH_FRAMES_DIR ?? '/tmp/slash-white-frames';
mkdirSync(GIF, { recursive: true });
const CLIP = { x: 240, y: 120, width: 800, height: 520 };
const PRESS = [0, 16, 40];

function encode(name: string, dir: string) {
  const vf = 'scale=640:-2:flags=neighbor';
  const gif = (fps: number, out: string) =>
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/%04d.png`, '-vf', `${vf},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none`, '-loop', '0', out]);
  gif(50, `${GIF}/${name}.gif`);
  gif(12.5, `${GIF}/${name}-slow.gif`);
}

async function ready(page: P) {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.releaseAll();
    h.camera.yawOffset(0);
    h.yokai.clear();
    h.step(200);
    h.player.set({ yaw: 0, pitch: 0 });
    h.step(5);
  });
}

const swing = (page: P) => page.evaluate(() => { const h = (window as any).__rikkun; h.input.press('primary'); h.step(1); h.input.release('primary'); });

for (const [short, item] of [['katana', 'katana'], ['bokuto', 'bokuto'], ['raijin', 'raijin_ken']] as const) {
  test(`白い 斬撃 3 段: ${item}`, async ({ page }) => {
    console.log("start", item); await legendWorld(page, item); console.log("world ok");
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const [label, deg] of [['back', 0], ['side', 100]] as const) {
      await ready(page);
      const p = await page.evaluate(() => (window as any).__rikkun.player.get().position as { x: number; y: number; z: number });
      await spawnAt(page, 'karakasa', p.x, p.y, p.z - 2.2, 9999);
      await page.evaluate((deg) => (window as any).__rikkun.camera.yawOffset(deg), deg);
      await page.evaluate(() => (window as any).__rikkun.step(3));
      const name = `white-${short}-${label}`;
      const dir = `${FRAMES}/${name}`;
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      for (let i = 0; i < 96; i++) {
        if (PRESS.includes(i)) await swing(page);
        await page.evaluate(() => (window as any).__rikkun.step(1));
        await page.screenshot({ path: `${dir}/${String(i + 1).padStart(4, '0')}.png`, clip: CLIP });
      }
      encode(name, dir);
    }
  });
}
