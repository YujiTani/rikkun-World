// #293 試作: がしゃどくろ大の ガラスの 雲・とぎれた 道・こけ・飛び降りの スクショ（開発サーバー http://localhost:5173 が 動いて いること）
//   node scripts/shot-gasha-v2.mjs <出力フォルダ>
//   → glass-front.png / glass-diagonal.png / glass-closeup.png / tunnel-gap.png / tunnel-moss.png / jump-down.png / glass-break.gif / throw-off.gif
//   開発サーバーは shot-gasha-big.mjs の 冒頭の 環境変数で 立てる
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const OUT = process.argv[2] ?? '/mnt/project-files/gashadokuro/core-heart/v2/';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = (n) => !ONLY || ONLY.has(n);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/?proto=gashaBig&nosave=1&char=boy&ring=full`);
await page.waitForFunction(() => window.__rikkun?.ready === true && !!window.__gashaBig, null, { timeout: 120_000 });
await page.evaluate(() => window.__rikkun.suspendRender(true));
await page.waitForFunction(() => { window.__rikkun.step(1); return window.__rikkun.player.doll().sprite.loaded === true; }, null, { timeout: 120_000 });
await page.evaluate(() => window.__rikkun.suspendRender(false));
const step = (n) => page.evaluate((n) => window.__rikkun.step(n), n);
const X0 = 0.5, Z0 = 200.5;
await page.evaluate(([x, z]) => {
  const h = window.__rikkun;
  h.achievements.mute(true); h.lock.simulate(true); h.pause(); h.input.releaseAll();
  h.settings.set('yokaiAutoSpawn', false); h.settings.set('yokaiWander', false); h.yokai.clear(); h.time.set(0);
  h.player.set({ position: { x, y: h.world.groundHeight(Math.floor(x), Math.floor(z)) + 2, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
}, [X0, Z0]);
await step(30);
await page.evaluate(([x, z]) => {
  const h = window.__rikkun;
  const base = h.world.groundHeight(Math.floor(x), Math.floor(z - 40));
  h.world.fill(Math.floor(x) - 90, base - 12, Math.floor(z) - 130, Math.floor(x) + 90, base, Math.floor(z) + 130, 'grass');
  h.world.fill(Math.floor(x) - 90, base + 1, Math.floor(z) - 130, Math.floor(x) + 90, base + 60, Math.floor(z) + 130, 'air');
}, [X0, Z0]);
await step(60);
await page.evaluate(() => window.__gashaBig.place());
await page.evaluate(() => window.__gashaBig.walk(false));
const info = await page.evaluate(() => window.__gashaBig.info());
console.log('info', JSON.stringify({ pos: info.pos, drawCalls: info.drawCalls, hitBoxes: info.hitBoxes }), 'glass', JSON.stringify(await page.evaluate(() => window.__gashaBig.glassInfo())));
await page.addStyleTag({ content: '#hud,#gashaBigHp{display:none !important}' });
const cam = (d) => page.evaluate((d) => window.__rikkun.settings.set('thirdPersonDistance', d), d);
await cam(0);
const mp = info.pos;
const put = (x, y, z, yaw, pitch) => page.evaluate(([x, y, z, yaw, pitch]) => window.__rikkun.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch }), [x, y, z, yaw, pitch]);
const gh = (x, z) => page.evaluate(([x, z]) => window.__rikkun.world.groundHeight(Math.floor(x), Math.floor(z)) + 1, [x, z]);
const yawOf = (lx, lz) => (Math.atan2(lx, -lz) * 180) / Math.PI;
const box = async (n) => (await page.evaluate((n) => window.__gashaBig.colliders().filter((c) => c.name === n).map((c) => ({ c: c.center, h: c.half, a: c.axes })), n))[0];
const shot = (name) => page.screenshot({ path: join(OUT, name) });
// 地面に 立つ 見張り台（ななめ上から 見る 用）
const tower = async (x, z, h) => {
  await page.evaluate(([x, z, h]) => { const w = window.__rikkun.world; const g = w.groundHeight(Math.floor(x), Math.floor(z)); w.fill(Math.floor(x) - 1, g, Math.floor(z) - 1, Math.floor(x) + 1, g + h, Math.floor(z) + 1, 'stone'); }, [x, z, h]);
  return gh(x, z);
};

// 1・2: ぜんたい（正面 / ななめ）。地面に 立って
if (want('glass-front')) {
  const BACK = Number(process.env.BACK1 ?? 52), fy = await gh(X0, Z0 + BACK);
  await put(X0, fy, Z0 + BACK, 0, Number(process.env.PITCH1 ?? 16)); await step(60);
  await shot('glass-front.png');
}
if (want('glass-diagonal')) {
  const BACK = Number(process.env.BACK2 ?? 46), SIDE = Number(process.env.SIDE2 ?? 40), x = X0 - SIDE, z = Z0 + BACK - 20, fy = await gh(x, z);
  await put(x, fy, z, yawOf(mp[0] - x, mp[2] - z), Number(process.env.PITCH2 ?? 16)); await step(60);
  await shot('glass-diagonal.png');
}
// 2b: 体の 外がわの こけ（全身。ななめ前から）
if (want('moss-body')) {
  const BACK = Number(process.env.BACK9 ?? 24), SIDE = Number(process.env.SIDE9 ?? 22), x = X0 - SIDE, z = Z0 + BACK - 12, fy = await gh(x, z);
  await put(x, fy, z, yawOf(mp[0] - x, mp[2] - z), Number(process.env.PITCH9 ?? 14)); await step(60);
  await shot('moss-body.png');
}
// 2c: 体の 上に 立つ と 足もとに 丸い 影（うでの 上。うしろから 三人称）
if (want('shadow-on-body')) {
  const arm = await box(process.env.ARM10 ?? 'upperArmL');
  const top = arm.c[1] + arm.h[1] * arm.a[1][1] + 0 ; // 上の 面（軸 1 は ほぼ 上）
  const ax = arm.a[2]; // 腕の ながい 軸
  const px = arm.c[0] - ax[0] * Number(process.env.ALONG10 ?? 4), pz = arm.c[2] - ax[2] * Number(process.env.ALONG10 ?? 4);
  const standY = await page.evaluate(([x, z, y0]) => { const g = window.__gashaBig; for (let j = Math.floor(y0 + 3); j > 0; j--) if (g.solidAt(Math.floor(x), j, Math.floor(z)) && !g.solidAt(Math.floor(x), j + 1, Math.floor(z))) return j + 1; return null; }, [px, pz, top]);
  await cam(Number(process.env.CAM10 ?? 5));
  await put(px, standY, pz, yawOf(-ax[0], -ax[2]) + Number(process.env.YAW10 ?? 180), Number(process.env.PITCH10 ?? -28)); await step(60);
  await page.evaluate(() => { document.getElementById('hud')?.style.setProperty('display', 'none'); });
  await shot('shadow-on-body.png');
  console.log('shadow', JSON.stringify(await page.evaluate(() => window.__rikkun.player.get().position)), standY, JSON.stringify(await page.evaluate(() => window.__rikkun.render.blobShadow())));
  await cam(0);
}
// 3: ガラスの 雲の アップ（腰の まわりの 雲を 近くで）
if (want('glass-closeup')) {
  const b = await box(process.env.CLOUD3 ?? 'bank30');
  const x = b.c[0] + Number(process.env.DX3 ?? 7), z = b.c[2] + Number(process.env.DZ3 ?? 8), fy = await gh(x, z);
  await put(x, fy, z, yawOf(b.c[0] - x, b.c[2] - z), Number(process.env.PITCH3 ?? 12)); await step(60);
  await shot('glass-closeup.png');
}
// 4: 飛び降り（最後の 雲の ふちに 立って、下の 床の だんを 見おろす）
if (want('jump-down')) {
  const jb = await box('backJump'), fl = await box('chestCoreFloor');
  const top = jb.c[1] + jb.h[1];
  await cam(Number(process.env.CAM4 ?? 6));
  // 雲の 上で、床の だんに 近い ふち（床の だんの 方へ 1 ブロック）
  const dx = fl.c[0] - jb.c[0], dz = fl.c[2] - jb.c[2], dl = Math.hypot(dx, dz);
  const px = jb.c[0] + (dx / dl) * Number(process.env.EDGE4 ?? 1.4), pz = jb.c[2] + (dz / dl) * Number(process.env.EDGE4 ?? 1.4);
  await put(px, top + 0.05, pz, yawOf(dx, dz) + Number(process.env.YAW4 ?? 0), Number(process.env.PITCH4 ?? -35)); await step(90);
  await shot('jump-down.png');
  await cam(0);
}
// 5・6: 道の 中（床の だんから とぎれた 道と むこうの コアを 見る / 近くの こけ）
if (want('tunnel-gap')) {
  const fl = await box('chestCoreFloor'), core = await box('core');
  // 床の だんの 上、穴の ふちの 手前に 立つ（コアの 向きを 見る）
  const f = fl.a[2]; // 道の 前向きの 軸（z）
  const sx = fl.c[0] + f[0] * Number(process.env.IN5 ?? 0.6), sy = fl.c[1] + fl.h[1] + Number(process.env.UP5 ?? 0.3), sz = fl.c[2] + f[2] * Number(process.env.IN5 ?? 0.6);
  const eye = sy + 0.6 + 1.6, hd = Math.hypot(core.c[0] - sx, core.c[2] - sz), pitch = process.env.PITCH5 ? Number(process.env.PITCH5) : (Math.atan2(core.c[1] - eye, hd) * 180) / Math.PI;
  await put(sx, sy + 0.6, sz, yawOf(core.c[0] - sx, core.c[2] - sz), pitch); await step(90);
  await shot('tunnel-gap.png');
  console.log('player', JSON.stringify(await page.evaluate(() => window.__rikkun.player.get().position)));
}
if (want('tunnel-moss')) {
  const fl = await box('chestCoreFloor'), core = await box('core');
  const f = fl.a[2];
  const sx = fl.c[0] + f[0] * 1.2, sy = fl.c[1] + fl.h[1] + 0.3, sz = fl.c[2] + f[2] * 1.2;
  // 道の かべ ぎわを むく（左がわの かべの こけ）
  await put(sx, sy + 0.6, sz, yawOf(core.c[0] - sx, core.c[2] - sz) + Number(process.env.YAW6 ?? 40), Number(process.env.PITCH6 ?? 10)); await step(90);
  await shot('tunnel-moss.png');
}
// 7: 割れて もどる GIF（割る → かけらが 消える → 1 つずつ 生えなおす）
if (want('glass-break')) {
  await page.evaluate(() => window.__gashaBig.tune({ glass: { regenDelaySec: 1.0, regenGapSec: 0.04 } }));
  // 肩の いちばん 外の 雲を、同じ 高さの 見張り台から 空を 背に 見る
  const all = await page.evaluate(() => window.__gashaBig.colliders().filter((c) => /^shoulderL\d+$/.test(c.name)).map((c) => ({ n: c.name, c: c.center, h: c.half })));
  const pick = all.find((c) => c.n === (process.env.CLOUD7 ?? 'shoulderL10'));
  const b = { c: pick.c, h: pick.h };
  const x = b.c[0] + Number(process.env.DX7 ?? 4), z = b.c[2] + Number(process.env.DZ7 ?? 11), eyeY = b.c[1] + b.h[1] + Number(process.env.UP7 ?? 0.5);
  const g0 = await gh(x, z);
  await page.evaluate(([x, z, g0, top]) => { const w = window.__rikkun.world; w.fill(Math.floor(x) - 1, g0 - 1, Math.floor(z) - 1, Math.floor(x) + 1, Math.floor(top) - 1, Math.floor(z) + 1, 'stone'); }, [x, z, g0, eyeY]);
  await put(x, Math.floor(eyeY), z, yawOf(b.c[0] - x, b.c[2] - z), Number(process.env.PITCH7 ?? 6));
  await cam(0);
  await step(40);
  const work = mkdtempSync(join(tmpdir(), 'glassgif-'));
  let n = 0;
  await step(3);
  const frame = async () => { await page.screenshot({ path: join(work, `f${String(n++).padStart(3, '0')}.png`) }); };
  await frame(); await frame();
  const topY = b.c[1] + b.h[1];
  const broke = await page.evaluate(([cx, cy, cz, r]) => window.__gashaBig.breakGlass({ x: cx, y: cy, z: cz }, r), [b.c[0], topY - 0.5, b.c[2], Number(process.env.R7 ?? 2.6)]);
  console.log('割れた', broke, JSON.stringify(await page.evaluate(() => window.__gashaBig.glassInfo())));
  for (let i = 0; i < 2; i++) { await step(6); await frame(); }
  for (let i = 0; i < 40; i++) { await step(14); await frame(); if ((await page.evaluate(() => window.__gashaBig.glassInfo().broken)) === 0) break; }
  await frame(); await frame();
  console.log('もどった あと', JSON.stringify(await page.evaluate(() => window.__gashaBig.glassInfo())));
  const pal = join(work, 'pal.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '5', '-i', join(work, 'f%03d.png'), '-vf', 'scale=640:-1:flags=lanczos,palettegen', pal]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '5', '-i', join(work, 'f%03d.png'), '-i', pal, '-lavfi', 'scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse', join(OUT, 'glass-break.gif')]);
}
// 8: ふり落とし GIF（コアを たたく → 予兆: 画面が ゆれる・コアが ゆれて 半透明 → 飛ばされる（カメラが 1 回転）→ 着地）。ふつうの 速さ（10 コマ / 秒）
if (want('throw-off')) {
  const fl = await box('chestCoreFloor'), core = await box('core');
  const f = fl.a[2];
  const sx = fl.c[0] + f[0] * 0.6, sy = fl.c[1] + fl.h[1] + 0.3, sz = fl.c[2] + f[2] * 0.6;
  const pitch = (Math.atan2(core.c[1] - (sy + 2.2), Math.hypot(core.c[0] - sx, core.c[2] - sz)) * 180) / Math.PI;
  await cam(0);
  await put(sx, sy + 0.6, sz, yawOf(core.c[0] - sx, core.c[2] - sz), pitch); await step(60);
  const work = mkdtempSync(join(tmpdir(), 'throwgif-'));
  let n = 0;
  const frame = async () => { await page.screenshot({ path: join(work, `f${String(n++).padStart(3, '0')}.png`) }); };
  const st = () => page.evaluate(() => ({ w: window.__gashaBig.info().coreWarn, p: window.__rikkun.player.get() }));
  for (let i = 0; i < 6; i++) { await step(6); await frame(); }
  await page.evaluate(() => window.__gashaBig.damage('core', 10));
  let last = null, grounded = 0;
  for (let i = 0; i < 90; i++) {
    await step(6); await frame();
    const s = await st(); last = s;
    if (n % 10 === 0) console.log(n, JSON.stringify({ w: s.w, y: s.p.position.y.toFixed(1), yaw: s.p.yaw.toFixed(0), g: s.p.onGround }));
    if (s.w.warnLeft <= 0 && s.w.throwLeft <= 0 && s.w.spinLeft <= 0 && s.p.onGround) { if (++grounded >= 8) break; }
  }
  console.log('throw-off フレーム', n, JSON.stringify(last.p.position));
  const pal = join(work, 'pal.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '10', '-i', join(work, 'f%03d.png'), '-vf', 'scale=560:-1:flags=lanczos,palettegen', pal]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '10', '-i', join(work, 'f%03d.png'), '-i', pal, '-lavfi', 'scale=560:-1:flags=lanczos[x];[x][1:v]paletteuse', join(OUT, 'throw-off.gif')]);
}
await browser.close();
