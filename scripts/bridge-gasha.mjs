// #293 試作: がしゃどくろの 体の 上に ブロックを 置く（すき間に 橋）を 本物の 入力で 確かめる + GIF
//   node scripts/bridge-gasha.mjs [出力フォルダ]     （開発サーバー http://localhost:5173 が 動いて いること）
//   環境変数: GIF=0 で GIF を 作らない（確認だけ）。BASE
//   最後に 向こうの 床から 刀（katana）で コアを なぐれる ことも 確かめる
//   穴の 手前の 床の ふちに 立ち → 下を 見て 前の 面に ブロックを 置く → 歩いて のる → くりかえして 橋 → 向こうの 床 → コアの 前まで
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const OUT = process.argv[2] ?? '/mnt/project-files/gashadokuro/core-heart/v2/';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const GIF = process.env.GIF !== '0';
const N = Number(process.env.BLOCKS ?? 6);
const ITEM = process.env.ITEM ?? 'brick';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 560 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/?proto=gashaBig&menu=0&nosave=1&char=boy`);
await page.waitForFunction(() => window.__rikkun?.ready === true && !!window.__gashaBig, null, { timeout: 300_000 });
await page.evaluate(() => window.__rikkun.suspendRender(true));
await page.waitForFunction(() => { window.__rikkun.step(1); return window.__rikkun.player.doll().sprite.loaded === true; }, null, { timeout: 120_000 });
await page.evaluate(() => {
  const h = window.__rikkun, g = window.__gashaBig;
  h.achievements.mute(true); h.lock.simulate(true); h.pause(); h.input.releaseAll();
  h.settings.set('yokaiAutoSpawn', false); h.settings.set('yokaiWander', false); h.yokai.clear(); h.time.set(0); h.combat.setHp?.(20);
  for (let i = 0; i < 60; i++) h.step(1);
  g.place(); g.walk?.(false);
  for (let i = 0; i < 300; i++) h.step(1);
});
const work = mkdtempSync(join(tmpdir(), 'bridgegif-'));
let nf = 0;
let cap = true; // 下を うしろむきに ねらって いる 間は 撮らない（画面が 見にくい）
const frame = async () => {
  if (!GIF || !cap) return;
  await page.evaluate(() => window.__rikkun.suspendRender(false));
  await page.screenshot({ path: join(work, `f${String(nf++).padStart(3, '0')}.png`) });
  await page.evaluate(() => window.__rikkun.suspendRender(true));
};
/** n コマ 進める。GIF の ときは per コマごとに 1 まい 撮る（ふつう 速さ: 60 コマ = 1 秒 = per 6 で 10 まい） */
const adv = async (n, per = 6) => {
  for (let i = 0; i < n; i += per) {
    await page.evaluate((k) => { for (let j = 0; j < k; j++) window.__rikkun.step(1); }, Math.min(per, n - i));
    await frame();
  }
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const log = []; let ok = true;
const check = (pass, msg) => { log.push(`${pass ? 'OK ' : 'NG '} ${msg}`); if (!pass) ok = false; return pass; };
const f1 = (v) => Number(v).toFixed(1);
const me = () => ev(() => { const p = window.__rikkun.player.get(); return { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch, onGround: p.onGround }; });
const B = await ev(() => {
  const g = window.__gashaBig;
  const H = (n) => g.colliders().find((c) => c.name === n);
  const fl = H('chestCoreFloor'), far = H('chestFarFloor'), core = H('core');
  const fa = fl.axes[2], hd = Math.hypot(fa[0], fa[2]);
  const dir = { x: fa[0] / hd, z: fa[2] / hd };
  return { fl: { c: fl.center, h: fl.half }, far: { c: far.center, h: far.half }, core: { c: core.center, h: core.half }, dir, yaw: (Math.atan2(dir.x, -dir.z) * 180) / Math.PI };
});
log.push(`floor ${B.fl.c.map(f1)} far ${B.far.c.map(f1)} core ${B.core.c.map(f1)} dir ${f1(B.dir.x)},${f1(B.dir.z)}`);
const THIRD = Number(process.env.CAM ?? 5);
if (process.env.MOSS !== '1') await ev(() => { window.__gashaBig.group.traverse((o) => { if (/^(plants|mossOut)/.test(o.name)) o.visible = false; }); }); // 道の 中が 見やすい ように こけは かくす（MOSS=1 で 見せる）
await page.addStyleTag({ content: (process.env.HUD === '1' ? '#gashaBigHp{display:none !important}' : '#hud,#gashaBigHp,#toast{display:none !important}') });
await ev(([d, ITEM]) => { const h = window.__rikkun; h.settings.set('thirdPersonDistance', d); h.combat.setHp?.(20); h.armor.set(null, null, null, null); h.inventory.setSlot(0, { item: ITEM, count: 20 }); h.inventory.select(0); }, [THIRD, ITEM]);
// 床の はじめに 立つ
await ev((B) => {
  const h = window.__rikkun, g = window.__gashaBig;
  const topAt = (x, z, ymax) => { for (let j = Math.floor(ymax); j >= 0; j--) if (g.solidAt(Math.floor(x), j, Math.floor(z)) && !g.solidAt(Math.floor(x), j + 1, Math.floor(z)) && !g.solidAt(Math.floor(x), j + 2, Math.floor(z))) return j + 1; return null; };
  const sx = B.fl.c[0] + B.dir.x * -1.2, sz = B.fl.c[2] + B.dir.z * -1.2, sy = topAt(sx, sz, B.fl.c[1] + B.fl.h[1] + 2);
  h.player.set({ position: { x: sx, y: sy, z: sz }, velocity: { x: 0, y: 0, z: 0 }, yaw: B.yaw, pitch: -28 });
  for (let i = 0; i < 20; i++) h.step(1);
}, B);
for (let i = 0; i < 3; i++) await frame();
// ふちまで あるく（本物の 入力）。ふちの すぐ 先に 床が なくなる ところで 止まる（体の はば 0.3 までは のっていられる）
const edgeWalk = async (maxSteps = 200) => {
  for (let i = 0; i < maxSteps; i++) {
    const done = await ev((B) => {
      const h = window.__rikkun, g = window.__gashaBig, p = h.player.get().position;
      const ahead = (d) => [1, 2, 3].some((k) => g.solidAt(Math.floor(p.x + B.dir.x * d), Math.floor(p.y + 0.15) - k, Math.floor(p.z + B.dir.z * d)));
      h.player.set({ yaw: B.yaw });
      if (!ahead(-0.12)) { h.input.release('moveForward'); h.player.set({ velocity: { x: 0, y: 0, z: 0 } }); h.step(2); return true; }
      h.input.press('moveForward');
      h.step(1);
      h.input.release('moveForward');
      return false;
    }, B);
    if (i % 6 === 0) await frame();
    if (done) break;
  }
  await ev(() => { window.__rikkun.input.release('moveForward'); });
  await adv(10);
};
await edgeWalk();
let p = await me();
log.push(`ふちに 立った (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)}) 地面 ${p.onGround}`);
check(p.onGround, 'ふちに 立てた（おちて いない）');
const farZ = B.far.c[2] - B.far.h[2];
let placed = 0, prevZ = p.z;
for (let k = 0; k < N; k++) {
  // 下を 見て（ふちの 前の 面が 見える）右クリックで 置く
  const before = await ev(() => window.__gashaBig.bodyBlocks.count);
  let tgt = null;
  // うしろむきに 下を 見ると、足もとの ふちの「前の 面」が 見える（ふちから 体が 少し はみ出して 立つ）。
  // 橋は 1 だん 低く かける（天井が 前へ むかって 低く なる ので、2 ブロックの 高さが ほしい）: 床の ふちの 前の 面の 下の だんを ねらう
  cap = false;
  const rowWant = (await me()) && Math.floor((await me()).y + 0.15) - (k === 0 ? 2 : 1);
  for (const pitch of [-89, -88, -87, -86, -85, -84, -83, -82, -80, -78, -75, -72, -70, -65, -60]) {
    await ev(([yaw, pitch]) => { window.__rikkun.player.set({ yaw: yaw + 180, pitch }); }, [B.yaw, pitch]);
    await adv(2, 2);
    tgt = await ev(() => window.__rikkun.target.get());
    if (tgt && tgt.face.z === 1 && tgt.face.y === 0 && tgt.place.y === rowWant) break;
  }
  log.push(`  ${k + 1} こ目: ねらい ${tgt ? `${tgt.id} 面 ${tgt.face.x},${tgt.face.y},${tgt.face.z} 置く ${tgt.place.x},${tgt.place.y},${tgt.place.z}` : 'なし'}（立ち位置 ${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)}）`);
  await ev(() => { window.__rikkun.input.press('secondary'); });
  await adv(3, 3);
  await ev(() => { window.__rikkun.input.release('secondary'); });
  await adv(6, 3);
  const after = await ev(() => window.__gashaBig.bodyBlocks.count);
  if (!check(after === before + 1, `${k + 1} こ目を 置けた（体の ブロック ${before} → ${after}）`)) break;
  placed++;
  // 置いた ブロックの 上へ 歩いて のる（ふちまで）
  cap = true;
  await ev(([yaw]) => { window.__rikkun.player.set({ yaw, pitch: -28 }); }, [B.yaw]);
  for (let i = 0; i < 300; i++) {
    const r = await ev((B) => {
      const h = window.__rikkun, g = window.__gashaBig, q = h.player.get().position;
      const ahead = (d) => [1, 2, 3].some((k) => g.solidAt(Math.floor(q.x + B.dir.x * d), Math.floor(q.y + 0.15) - k, Math.floor(q.z + B.dir.z * d)));
      h.player.set({ yaw: B.yaw });
      if (!ahead(-0.12)) { h.input.release('moveForward'); h.player.set({ velocity: { x: 0, y: 0, z: 0 } }); h.step(2); return true; }
      h.input.press('moveForward'); h.step(1); h.input.release('moveForward');
      return false;
    }, B);
    if (i % 5 === 0) await frame();
    if (r) break;
  }
  await adv(8, 4);
  p = await me();
  log.push(`  あるいて のった (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)}) 地面 ${p.onGround}`);
  if (!check(p.onGround && p.y > B.far.c[1] + B.far.h[1] + 1, `置いた ブロックの 上に 立てる（足の 高さ ${f1(p.y)}）`)) break;
  if (p.z + 0.5 >= farZ) break; // 向こうの 床に とどいた
}
// 橋を わたりきる: 向こうの 床の 手前まで ブロックが つながって いる か（のこりは 飛び降り）
p = await me();
log.push(`橋の 先 (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)})、向こうの 床の ふち z ${f1(farZ)}、置いた ブロック ${await ev(() => window.__gashaBig.bodyBlocks.count)} こ`);
// 橋の はしから よこへ おりて（3 ブロック。足袋なしでも ダメージなし）、向こうの 床を あるいて コアの 前まで
await ev((B) => { const h = window.__rikkun; h.player.set({ yaw: B.yaw + 90, pitch: -5 }); h.input.press('moveForward'); }, B);
let reached = false;
const farTop = B.far.c[1] + B.far.h[1];
for (let i = 0; i < 60; i++) {
  await adv(4, 4);
  const q = await me();
  if (q.onGround && q.y < farTop + 1.2) {
    // 向こうの 床の 上。コアの ほうを むいて あるく
    const hdg = await ev((B) => { const p = window.__rikkun.player.get().position; const yaw = (Math.atan2(B.core.c[0] - p.x, -(B.core.c[2] - p.z)) * 180) / Math.PI; window.__rikkun.player.set({ yaw, pitch: -5 }); return Math.hypot(B.core.c[0] - p.x, B.core.c[2] - p.z); }, B);
    if (hdg < 2.5) { reached = true; break; }
  }
}
await ev(() => { window.__rikkun.input.release('moveForward'); });
await adv(12, 6);
p = await me();
const hpNow = await ev(() => window.__rikkun.combat.get().hp);
log.push(`向こうの 床 (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)}) コアまで 横 ${f1(Math.hypot(B.core.c[0] - p.x, B.core.c[2] - p.z))}、体力 ${hpNow}`);
check(reached, '置いた 橋を わたって（のこりは 飛び降りて）コアの 前の 床まで あるけた');
// 刀で コアを なぐれるか
const SW = await ev(async (B) => {
  const h = window.__rikkun, g = window.__gashaBig;
  h.inventory.setSlot(1, { item: 'katana', count: 1 }); h.inventory.select(1);
  const out = [];
  for (const [dx, dz] of [[0, 0]]) {
    const q0 = h.player.get().position;
    h.player.set({ position: { x: q0.x + dx, y: q0.y, z: q0.z + dz }, velocity: { x: 0, y: 0, z: 0 } });
    for (let i = 0; i < 6; i++) h.step(1);
    const q = h.player.get().position;
    const hp0 = g.hp(); let best = hp0;
    const yaw = (Math.atan2(B.core.c[0] - q.x, -(B.core.c[2] - q.z)) * 180) / Math.PI;
    for (let t = 0; t < 3; t++) {
      h.player.set({ yaw, pitch: 10 });
      h.input.press('primary'); for (let i = 0; i < 4; i++) h.step(1); h.input.release('primary');
      for (let i = 0; i < 60; i++) { h.step(1); best = Math.min(best, g.hp()); }
    }
    out.push({ at: [q.x, q.y, q.z].map((v) => +v.toFixed(2)), dmg: hp0 - best, last: g.info().lastHit?.part ?? null });
  }
  return out;
}, B);
log.push('刀: ' + JSON.stringify(SW));
check(SW[0].dmg > 0 && SW[0].last === 'core', `橋の むこうの 床から 刀で コアを なぐれた（ダメージ ${SW[0].dmg}）`);
// こわす: 置いた ブロックを 1 つ 左クリックで ほると 持ち物に もどる
const stone0 = await ev((it) => window.__rikkun.inventory.count(it), ITEM);
log.push(`持ち物の いし ${stone0} こ（20 こ から ${placed} こ 置いた）`);
check(stone0 === 20 - placed, `置いた 数だけ 持ち物が へった（いし ${stone0} = 20 - ${placed}）`);
console.log(log.join('\n'));
if (GIF && nf > 0) {
  const pal = join(work, 'pal.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '10', '-i', join(work, 'f%03d.png'), '-vf', 'scale=560:-1:flags=lanczos,palettegen', pal]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '10', '-i', join(work, 'f%03d.png'), '-i', pal, '-lavfi', 'scale=560:-1:flags=lanczos[x];[x][1:v]paletteuse', join(OUT, 'place-bridge.gif')]);
  console.log(`place-bridge.gif ${nf} フレーム`);
}
console.log(JSON.stringify({ ok }));
await browser.close();
process.exit(ok ? 0 : 1);
