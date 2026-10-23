import { test } from '@playwright/test';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { legendWorld, spawnAt } from '../e2e/helpers/legend';

/**
 * 風神剣の 真空波（飛んでいく 風）の ゲーム内 GIF（オーナーに 見せる 試作）。判定は しない。
 * 実行: npx playwright test --config playwright.windwave.config.ts
 * 名前の つけかた: WAVE_TAG（new / old）。コマ送りで 1 コマずつ 撮る。出力: WAVE_GIF_DIR（既定 /tmp/wind-wave-gif）
 */
test.describe.configure({ mode: 'serial', timeout: 600_000 });
type P = import('@playwright/test').Page;
const GIF = process.env.WAVE_GIF_DIR ?? '/tmp/wind-wave-gif';
const FRAMES = process.env.WAVE_FRAMES_DIR ?? '/tmp/wind-wave-frames';
const TAG = process.env.WAVE_TAG ?? 'new';
mkdirSync(GIF, { recursive: true });
const CLIP_BACK = { x: 290, y: 110, width: 700, height: 440 };
const CLIP_SIDE = { x: 0, y: 130, width: 980, height: 490 };
const N = 400;

function encode(name: string, dir: string) {
  const vf = 'scale=900:-2:flags=neighbor';
  const gif = (fps: number, out: string) =>
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/%04d.png`, '-vf', `${vf},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none`, '-loop', '0', out]);
  gif(Number(process.env.WAVE_FPS ?? 25), `${GIF}/${name}.gif`);
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

test(`風神剣の 真空波 3 段 (${TAG})`, async ({ page }) => {
  await legendWorld(page, "fujin_ken");
  await page.addStyleTag({ content: '#hud { display: none !important; }' });
  await page.evaluate(() => (window as any).__rikkun.camera.distance(null));
  await page.setViewportSize({ width: 1280, height: 800 });
  // うしろ: 背中ごしに 前へ 飛ぶ 風。よこ: 体の 真横から 飛んでいく ところ
  const views = [['back', Number(process.env.WAVE_BACK_YAW ?? 0), Number(process.env.WAVE_BACK_DIST ?? 3.6), -22], ['side', 90, Number(process.env.WAVE_SIDE_DIST ?? 4.2), -8]] as const;
  for (const [label, deg, dist, pitch] of views) {
    if (TAG === 'old' && label === 'side') continue; // 比べ用は 1 本だけ（うしろ）
    await ready(page);
    const p = await page.evaluate(() => (window as any).__rikkun.player.get().position as { x: number; y: number; z: number });
    // 妖怪は 少しはなして（5 マスの 先で 見える ように）、つらぬくのが 見える
    await spawnAt(page, 'karakasa', p.x + 0.6, p.y, p.z - 4.8, 99999);
    await page.evaluate(([deg, dist, pitch]) => { const h = (window as any).__rikkun; h.camera.yawOffset(deg); h.camera.distance(dist); h.player.set({ yaw: 0, pitch }); }, [deg, dist, pitch] as const);
    await page.evaluate(() => (window as any).__rikkun.step(3));
    const name = TAG === 'old' ? 'wave-old' : `wave-new-${label}`;
    const dir = `${FRAMES}/${name}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    let quiet = 0;
    let seen = false;
    let started = false;
    await page.evaluate(() => { (window as any).__drv = { stage: 0, pressed: -1 }; });
    for (let i = 0; i < N; i++) {
      const q = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const d = (window as any).__drv;
        const y0 = h.yokai.list()[0];
        const pp = h.player.get().position;
        if (y0 && Math.hypot(y0.position.x - pp.x, y0.position.z - pp.z) > 5.5) { h.yokai.clear(); const id = h.yokai.spawn('karakasa', pp.x + 0.6, pp.y, pp.z - 4.8, { ai: false }); h.yokai.setHp(id, 99999); }
        const st = h.blade.state();
        let key: string | null = null;
        if (d.stage === 0 && st.phase === 'idle') { key = 'primary'; d.stage = 1; }
        else if (st.combo && st.combo.open && d.stage < 3 && d.pressed !== d.stage && st.combo.step === d.stage) { key = 'primary'; d.pressed = d.stage; d.stage++; }
        if (key) h.input.press(key);
        h.step(1);
        if (key) h.input.release(key);
        const wl = h.legend.waves(); const ws = wl.length; const dp = wl[0]?.drawPos;
        const fx = h.legend.windWaveFx?.();
        return { key, stage: d.stage, waves: ws, dp: dp ? [dp.x, dp.y, dp.z].map((v: number) => +v.toFixed(2)) : null, wfx: fx ? `${fx.draws}/${fx.tris}` : '-' };
      });
      if (process.env.WAVE_LOG) appendFileSync(process.env.WAVE_LOG, `${name} ${i} ${JSON.stringify(q)}\n`);
      await page.screenshot({ path: `${dir}/${String(i + 1).padStart(4, '0')}.png`, clip: label === 'back' ? CLIP_BACK : CLIP_SIDE });
      if (q.waves > 0) started = true;
      if (q.stage >= 3 && q.waves > 0) seen = true;
      quiet = seen && q.waves === 0 ? quiet + 1 : 0;
      if (started && quiet > 10) break;
    }
    await page.evaluate(() => { (window as any).__drv = { stage: 0, pressed: -1 }; });
    encode(name, dir);
  }
});
