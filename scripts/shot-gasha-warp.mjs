// #293 試作: 少女の「ワープ → 詠唱 → 魔法 4 種」の GIF・スクショを 撮る（開発サーバー http://localhost:5173 が 動いている こと）
//   node scripts/shot-gasha-warp.mjs [出力フォルダ]
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? '/mnt/project-files/gashadokuro/design-v2/girl-warp/';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const ONLY = (process.env.ONLY ?? '1,2,3,4').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(process.env.WORK ?? tmpdir(), 'warp-'));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('console', (m) => { if (/proto|error/i.test(m.text())) console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/?proto=gashaGirl&nosave=1&char=boy`);
await page.waitForFunction(() => window.__rikkun?.ready === true, null, { timeout: 120_000 });
await page.waitForFunction(() => !!window.__gashaGirl, null, { timeout: 60_000 });
await page.evaluate(() => window.__rikkun.suspendRender(true));
await page.waitForFunction(() => { window.__rikkun.step(1); return window.__rikkun.player.doll().sprite.loaded === true; }, null, { timeout: 120_000 });
await page.evaluate(() => window.__rikkun.suspendRender(false));

const X0 = 20.5, Z0 = 40.5;
const floorY = await page.evaluate(([x, z]) => {
  const h = window.__rikkun;
  h.achievements.mute(true); h.lock.simulate(true); h.pause(); h.input.releaseAll();
  h.settings.set('yokaiAutoSpawn', false); h.settings.set('yokaiWander', false); h.yokai.clear(); h.time.set(0);
  const fy = h.world.groundHeight(Math.floor(x), Math.floor(z));
  for (let dx = -16; dx <= 16; dx++) for (let dz = -26; dz <= 14; dz++) {
    h.world.setBlock(Math.floor(x) + dx, fy, Math.floor(z) + dz, 'stone');
    for (let y = fy + 1; y <= fy + 14; y++) h.world.setBlock(Math.floor(x) + dx, y, Math.floor(z) + dz, 'air');
  }
  h.player.set({ position: { x, y: fy + 1, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  window.__gashaGirl.camera('overview');
  return fy;
}, [X0, Z0]);
await page.evaluate(() => window.__rikkun.step(60));

await page.addStyleTag({ content: '#hud{display:none !important}' });
const info = () => page.evaluate(() => window.__gashaGirl.info());
const step = (n) => page.evaluate((n) => window.__rikkun.step(n), n);
let frameNo = 0;
async function shot(dir, tag) {
  const f = join(dir, `f${String(frameNo++).padStart(4, '0')}.png`);
  await page.screenshot({ path: f });
  return f;
}
function gif(dir, frames, out, fps = 30) {
  const list = join(dir, `list-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(list, frames.map((f) => `file '${f}'\nduration ${1 / fps}`).join('\n') + '\n');
  const pal = join(dir, 'pal.png');
  const vf = 'scale=640:-1:flags=lanczos';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `${vf},palettegen=stats_mode=diff:max_colors=160`, pal]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', pal, '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4`, '-r', String(fps), join(OUT, out)]);
}

/** 1 つの 魔法の 回を 撮る。slowKey: ゆっくり 見せる 区間の 終わりを 決める info の 名前 */
async function cycle(n) {
  const dir = join(work, `s${n}`); mkdirSync(dir, { recursive: true });
  const player = await page.evaluate(() => window.__rikkun.player.get().position);
  await page.evaluate(([x, y, z]) => window.__rikkun.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }), [X0, floorY + 1, Z0]);
  await page.evaluate(() => window.__gashaGirl.camera('overview'));
  await step(90);
  // 前の 魔法の のこりを 消す
  for (let i = 0; i < 400; i++) { const k = await info(); if (k.phase === 'stand' && k.eruptionT < 0 && k.vortexT < 0 && k.fireballs === 0 && k.waves === 0) break; await step(6); }
  let seed = 100 + n;
  if (n === 1) { // 左横に 出る シード
    for (seed = 1; seed < 200; seed++) {
      const ok = await page.evaluate((s) => { window.__gashaGirl.setSeed(s); return window.__gashaGirl.predictSide() === 'left'; }, seed);
      if (ok) break;
    }
  }
  await page.evaluate(() => window.__gashaGirl.standNow());
  await step(50); // 前の 爆発の のこりを 消す
  await page.evaluate(() => window.__gashaGirl.standNow());
  await page.evaluate(([n, s]) => { window.__gashaGirl.setSeed(s); window.__gashaGirl.nextSpell(n); }, [n, seed]);
  const norm = [], slow = [];
  let slowing = false, slowDone = false, shotsFiredAt = -1;
  const peak = { eruption: null, vortex: null, wave: null };
  let warped = false, ticks = 0;
  const fast = [];
  for (let i = 0; i < 100; i++) { // ふだんの 立ち姿 約 0.5 秒
    await step(2); fast.push(await shot(dir)); if (i === 14) break;
  }
  console.log('before warp', JSON.stringify(await info()));
  await page.evaluate(() => window.__gashaGirl.warpNow());
  warped = true;
  const allNorm = [...fast];
  const stats0 = await info();
  let sawCast = false;
  for (let g = 0; g < 1200; g++) {
    const k = await info();
    const slowWin = (n === 1 && k.phase === 'cast' && k.castT >= 1.5 && k.eruptionT >= 0) || (n === 1 && k.eruptionT > 0)
      || (n === 2 && k.phase === 'cast' && k.castT >= 1.5) || (n === 2 && k.vortexT > 0);
    // よける（魔法 3）: 最初の 1 発から 少しあと、右へ 3 ブロック すばやく 動く
    if (n === 3 && k.fired > stats0.fired) {
      if (shotsFiredAt < 0) shotsFiredAt = k.castT;
      const u = k.castT - shotsFiredAt;
      const dx = Math.min(3.2, Math.max(0, (u - 0.35) * 8));
      await page.evaluate(([x, y, z]) => window.__rikkun.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }), [X0 + dx, floorY + 1, Z0]);
    }
    if (slowWin) {
      await step(1); const f = await shot(dir); slow.push(f);
      if (k.eruptionT >= 1.2 && !peak.eruption) peak.eruption = f;
      if (k.vortexT >= 1.0 && !peak.vortex) peak.vortex = f;
      if (slow.length % 2 === 0) allNorm.push(f);
    } else {
      await step(2); const f = await shot(dir); allNorm.push(f);
      if (n === 4 && k.waves > 0 && k.castT >= 1.6 + 1.3 && !peak.wave) peak.wave = f;
    }
    const e = await info();
    if (e.phase === 'cast') sawCast = true;
    if (sawCast && (e.phase === 'vanish' || e.phase === 'gone' || e.phase === 'appear')) break; // 次の ワープが はじまる前に おわる
    if (g > 30 && e.phase === 'stand' && e.eruptionT < 0 && e.vortexT < 0 && e.fireballs === 0 && e.waves === 0) { await step(2); allNorm.push(await shot(dir)); break; }
    void warped; void ticks; void slowing; void slowDone;
  }
  const end = await info();
  console.log(`spell ${n}: frames ${allNorm.length} slow ${slow.length} seed ${seed} side ${end.side} dist ${end.dist.toFixed(1)} fbHit ${end.fbHit} fbMiss ${end.fbMiss} waveHit ${end.waveHit} waveMiss ${end.waveMiss}`);
  return { dir, allNorm, slow, peak, player };
}

for (const n of ONLY) {
  const r = await cycle(n);
  gif(r.dir, r.allNorm, `warp-cast-${n}.gif`);
  if (n === 1) { gif(r.dir, r.slow, 'warp-cast-slow.gif'); if (r.peak.eruption) copyFileSync(r.peak.eruption, join(OUT, 'eruption.png')); copyFileSync(join(OUT, 'warp-cast-1.gif'), join(OUT, 'warp-cast.gif')); }
  if (n === 2) { gif(r.dir, r.slow, 'vortex-slow.gif'); if (r.peak.vortex) copyFileSync(r.peak.vortex, join(OUT, 'vortex.png')); }
  if (n === 3) copyFileSync(join(OUT, 'warp-cast-3.gif'), join(OUT, 'fireball.gif'));
  if (n === 4) { copyFileSync(join(OUT, 'warp-cast-4.gif'), join(OUT, 'wave.gif')); if (r.peak.wave) copyFileSync(r.peak.wave, join(OUT, 'wave.png')); }
}
await browser.close();
console.log('done', OUT, 'work', work);
