// #293 直し 4: 少女の 間、コアを まもる 虹色の バリア(ふつうの ゲーム = release 経由)の ゲーム内 GIF。開発サーバー http://localhost:5173 が 動いて いること
//   node scripts/shot-gasha-barrier.mjs <出力フォルダ>   → core-barrier.gif(ふつう)・core-barrier-slow.gif(おそい)・core-barrier-0.png(1 枚)
//   開発サーバーは e2e と おなじ 環境変数で 立てる(playwright.config.ts の webServer.command)。ffmpeg が 必要。
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const OUT = process.argv[2] ?? '/mnt/project-files/gashadokuro/';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const W = 640, H = 420;
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'barrier-'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/`);
await page.waitForFunction(() => window.__rikkun?.ready === true, null, { timeout: 120_000 });
await page.evaluate(() => { const h = window.__rikkun; h.lock.simulate(true); h.pause(); h.achievements?.mute?.(true); });
await page.evaluate(() => window.__rikkun.world.settle({ full: true }));
const step = (n) => page.evaluate((n) => window.__rikkun.step(n), n);
// ぼうを 出して、少女を 読みこんで、体力を へらして 笑う ところ(固まる)まで
await page.evaluate(async () => {
  const h = window.__rikkun;
  const ok = await h.gasha.spawn({ distance: 60, angleDeg: -90 });
  if (!ok) throw new Error('出せなかった');
  window.__gashaBig.walk(false);
  const g = window.__gashaBig;
  const dmg = (frac) => { const d = g.hp() - g.maxHp() * frac; if (d > 0) g.damage('girl', d / 5); };
  window.__dmg = dmg;
  h.player.set({ position: { x: 64.5, y: h.world.groundHeight(64, 64) + 1, z: 64.5 }, velocity: { x: 0, y: 0, z: 0 } });
  dmg(0.55); h.step(70);
});
await page.waitForFunction(() => !!window.__gashaGirl, null, { timeout: 90_000 });
await page.evaluate(() => {
  const h = window.__rikkun, g = window.__gashaBig;
  window.__dmg(0.3);
  for (let i = 0; i < 2000 && h.gasha.info().form !== 'laugh'; i += 5) { h.combat.setHp(h.combat.get().maxHp); h.step(5); }
});
await page.addStyleTag({ content: '#hud,#gashaBigHp{display:none !important}' });
await page.evaluate(() => window.__rikkun.settings.set('thirdPersonDistance', 0));
// 道の 中から コアを 見る(見る 場所に 浮かせたまま 毎コマ 置きなおす: 道の 床には 深い 穴が あるので)
const DIST = Number(process.env.DIST ?? 5.2), EYE = 1.62;
const view = await page.evaluate(({ DIST, EYE }) => {
  const h = window.__rikkun, g = window.__gashaBig;
  const core = g.colliders().find((c) => c.name === 'core');
  const az = core.axes[2];
  const hz = Math.hypot(az[0], az[2]) || 1;
  const dir = [az[0] / hz, az[2] / hz]; // 水平の 奥行(道の むき)
  const x = core.center[0] - dir[0] * DIST, z = core.center[2] - dir[1] * DIST;
  const y = core.center[1] - EYE; // 目の 高さが コアの 高さ
  const yaw = (Math.atan2(dir[0], -dir[1]) * 180) / Math.PI;
  window.__view = { x, y, z, yaw };
  return window.__view;
}, { DIST, EYE });
console.log('view', JSON.stringify(view));
if (process.env.TUNE) await page.evaluate((t) => Object.assign(window.__rikkun.gasha.bigTune.freeze.barrier, JSON.parse(t)), process.env.TUNE); // 例: TUNE='{"opacity":1}'
const hold = () => page.evaluate(() => { const h = window.__rikkun; h.combat.setHp(h.combat.get().maxHp); });
const stepAt = (n) => page.evaluate((n) => {
  const h = window.__rikkun, v = window.__view;
  for (let i = 0; i < n; i++) { h.player.set({ position: { x: v.x, y: v.y, z: v.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: v.yaw, pitch: 0 }); h.combat.setHp(h.combat.get().maxHp); h.step(1); }
}, n);
await stepAt(20);
const frames = [];
const shot = async (i) => { const f = join(tmp, `f${String(i).padStart(3, '0')}.png`); await page.screenshot({ path: f }); frames.push(f); };
// 0〜1.2 秒: ただよう。1.2 秒で コアを たたく(はじく 波紋)。そのあと 1.8 秒
const PER = 4; // 1 枚あたり 4 コマ(約 0.067 秒)→ 15 fps
const TOTAL = 48;
for (let i = 0; i < TOTAL; i++) {
  if (i === 18) await page.evaluate(() => window.__gashaBig.damage('core', 50));
  if (i === 30) await page.evaluate(() => window.__gashaBig.damage('core', 50));
  await stepAt(PER);
  await shot(i);
}
console.log('barrier', JSON.stringify(await page.evaluate(() => window.__gashaBig.barrier())));
await page.screenshot({ path: join(OUT, 'core-barrier-0.png') });
const list = join(tmp, 'list.txt');
const mk = (fps, name) => {
  writeFileSync(list, frames.map((f) => `file '${f}'\nduration ${1 / fps}`).join('\n') + `\nfile '${frames[frames.length - 1]}'\n`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${fps},split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`, '-loop', '0', join(OUT, name)]);
};
mk(15, 'core-barrier.gif'); // ふつう(ゲームの 速さ)
mk(5, 'core-barrier-slow.gif'); // おそい(3 倍 ゆっくり)
await browser.close();
console.log('done', OUT);
