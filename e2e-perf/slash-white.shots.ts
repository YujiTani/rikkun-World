import { test } from '@playwright/test';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
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
// よこ（side）は 体と 妖怪の 真ん中が 画面の 左よりに 来るので、枠を 左へ ずらす
const CLIPS = { back: { x: 140, y: 90, width: 1000, height: 625 }, side: { x: 0, y: 90, width: 1000, height: 625 } };
const N = 400; // 3 段（つき→きりあげ→けさ）と けさの あとの 消えるまで

function encode(name: string, dir: string) {
  const vf = 'scale=900:-2:flags=neighbor';
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


const ITEMS = (process.env.SLASH_ITEMS ?? 'katana,bokuto,raijin_ken,fujin_ken,niji').split(',');
let home = { dx: 0 };
for (const item of ITEMS) {
  const short = item === 'raijin_ken' ? 'raijin' : item === 'fujin_ken' ? 'fujin' : item === 'niji' ? 'niji' : item;
  test(`白い 斬撃 3 段: ${item}`, async ({ page }) => {
    await legendWorld(page, item);
    await page.addStyleTag({ content: '#hud { display: none !important; }' }); // 撮影中は HUD を かくす
    await page.evaluate(() => (window as any).__rikkun.camera.distance(null));
    await page.setViewportSize({ width: 1280, height: 800 });
    // うしろ: 少し 高く（背中ごしに 妖怪が 見える）・妖怪は 少し 右。よこ: 体の 真横から
    for (const [label, deg, dist, pitch, dx] of [['back', 0, 4.5, -18, 0.6], ['side', 100, 4.0, -12, 0]] as const) {
      await ready(page);
      const p = await page.evaluate(() => (window as any).__rikkun.player.get().position as { x: number; y: number; z: number });
      await spawnAt(page, 'karakasa', p.x + dx, p.y, p.z - 1.5, 99999);
      home = { dx };
      await page.evaluate(([deg, dist, pitch]) => { const h = (window as any).__rikkun; h.camera.yawOffset(deg); h.camera.distance(dist); h.player.set({ yaw: 0, pitch }); }, [deg, dist, pitch] as const);
      await page.evaluate(() => (window as any).__rikkun.step(3));
      const name = short === 'raijin' || short === 'fujin' || short === 'niji' ? `${short}-${label}` : `white-${short}-${label}`;
      const dir = `${FRAMES}/${name}`;
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      let quiet = 0;
      let kesaSeen = false;
      await page.evaluate(() => { (window as any).__drv = { stage: 0, pressed: -1, switching: false }; });
      for (let i = 0; i < N; i++) {
        // 3 段を 自動で 進める: 刀（つなげられない）は かまえを かえながら 1 回ずつ、つなげられる 刀は 次の 段が 開いたら 押す
        const q = await page.evaluate(([combo, home]) => {
          const h = (window as any).__rikkun;
          const d = ((window as any).__drv ??= { stage: 0, pressed: -1, switching: false });
          // 大きく はじかれたら 体の 前 1.5 マスに 立てなおす（撮影用。体力は 多いので 倒れない）
          const y0 = h.yokai.list()[0];
          const pp = h.player.get().position;
          if (y0 && Math.hypot(y0.position.x - pp.x, y0.position.z - pp.z) > 3) { h.yokai.clear(); const id = h.yokai.spawn('karakasa', pp.x + home.dx, pp.y, pp.z - 1.5, { ai: false }); h.yokai.setHp(id, 99999); }
          const st = h.blade.state();
          let key: string | null = null;
          if (combo) {
            if (d.stage === 0 && st.phase === 'idle') { key = 'primary'; d.stage = 1; }
            else if (st.combo && st.combo.open && d.stage < 3 && d.pressed !== d.stage && st.combo.step === d.stage) { key = 'primary'; d.pressed = d.stage; d.stage++; }
          } else if (st.phase === 'idle' && d.stage < 3) {
            const want = ['chudan', 'gedan', 'jodan'][d.stage];
            if (st.stance !== want) key = 'stanceNext';
            else { key = 'primary'; d.stage++; }
          }
          if (key) h.input.press(key);
          h.step(1);
          if (key) h.input.release(key);
          const a = (h.legend.slashes?.() ?? [])[0];
          return { key, stage: d.stage, idle: h.blade.state().phase === 'idle', slash: a ? `${a.tech}${a.step} f${a.frame}` : '-', fx: (() => { const r = h.legend.raijinFx?.(), f = h.legend.fujinFx?.(), n = h.legend.rainbowFx?.(); return `${(r?.draws ?? 0) + (f?.draws ?? 0) + (n?.draws ?? 0)}/${(r?.tris ?? 0) + (f?.tris ?? 0) + (n?.tris ?? 0)}/${n?.bloomPasses ?? 0}`; })(), yk: (() => { const y = h.yokai.list()[0]; return y ? `${y.position.x.toFixed(1)},${y.position.z.toFixed(1)}` : 'none'; })() };
        }, [item === 'raijin_ken' || item === 'fujin_ken' || item === 'niji', home] as const);
        if (process.env.SLASH_LOG) appendFileSync(process.env.SLASH_LOG, `${name} ${i} ${JSON.stringify(q)}\n`);
        await page.screenshot({ path: `${dir}/${String(i + 1).padStart(4, '0')}.png`, clip: CLIPS[label] });
        if (q.slash.startsWith('kesa')) kesaSeen = true;
        quiet = kesaSeen && q.slash === '-' ? quiet + 1 : 0;
        if (quiet > 16) break; // けさの 消えるところまで
      }
      await page.evaluate(() => { (window as any).__drv = { stage: 0, pressed: -1, switching: false }; });
      encode(name, dir);
    }
  });
}
