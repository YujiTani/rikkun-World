// #293 試作: 大きい がしゃどくろ（?proto=gashaBig）を、本物の プレイヤーの 動き（前進・ジャンプの 入力を コマ送り）で 地面から 頭の上まで 登れるか 確かめる。
//   node scripts/climb-gasha-big.mjs     （開発サーバー http://localhost:5173 が 動いて いること。環境変数は shot-gasha-big.mjs の 先頭を 見る）
//   通った 道と、とまった 場所を 出す。頭の 上に 着いたら 終了コード 0。
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const SIDE = process.env.SIDE ?? 'L'; // L | R
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/?proto=gashaBig&nosave=1&char=boy${process.env.EXTRA ?? ''}`);
await page.waitForFunction(() => window.__rikkun?.ready === true && !!window.__gashaBig, null, { timeout: 120_000 });
await page.evaluate(() => window.__rikkun.suspendRender(true)); // 描かずに コマ送り（はやい）
const START = (process.env.START ?? '').split(',').map(Number); // 例: START=120,-80,90（x, z, 向き（度））で 別の 場所から
const result = await page.evaluate(async ([side, START]) => {
  const h = window.__rikkun, g = window.__gashaBig;
  h.achievements.mute(true); h.lock.simulate(true); h.pause(); h.input.releaseAll();
  h.settings.set('yokaiAutoSpawn', false); h.settings.set('yokaiWander', false); h.yokai.clear(); h.time.set(0);
  h.combat.setHp?.(20);
  if (START.length === 3 && START.every((v) => !Number.isNaN(v))) {
    const gy0 = h.world.groundHeight(Math.floor(START[0]), Math.floor(START[1])) + 1;
    h.player.set({ position: { x: START[0], y: gy0 + 2, z: START[1] }, velocity: { x: 0, y: 0, z: 0 }, yaw: START[2], pitch: 0 });
  }
  for (let i = 0; i < 90; i++) h.step(1);
  g.place(); g.walk?.(false); // さまよい（動く 巨大がしゃ）を 止めて、決まった 姿勢で 調べる
  for (let i = 0; i < 30; i++) h.step(1);
  const hits = g.colliders();
  const H = (n) => hits.find((c) => c.name === n);
  const ends = (c, ax) => { const u = c.axes[ax], l = c.half[ax]; return [[c.center[0] - u[0] * l, c.center[1] - u[1] * l, c.center[2] - u[2] * l], [c.center[0] + u[0] * l, c.center[1] + u[1] * l, c.center[2] + u[2] * l]]; };
  const hand = H(`hand${side}`), fore = H(`foreArm${side}`), upper = H(`upperArm${side}`), sh = H(`shoulder${side}`), ro = H(`rampOut${side}`), wing = H(`ribbonWing${side}`), ri = H(`rampIn${side}`), sk = H('skull');
  // 道しるべ（x, z だけ 見る）。名前は 通った 場所
  const W = [];
  const add = (name, p) => W.push({ name, x: p[0], y: p[1], z: p[2] });
  add('地面（手の 先の 前）', [hand.center[0], 0, hand.center[2] + hand.half[2] + 2]);
  add('手', [hand.center[0], 0, hand.center[2]]);
  const lowFirst = (c, ax) => { const [a, b] = ends(c, ax); return a[1] <= b[1] ? [a, b] : [b, a]; }; // 低い 方の はしから
  const fp = lowFirst(fore, 2);
  add('前わんの 下はし（手首）', fp[0]);
  add('前わんの 上はし（ひじ）', fp[1]);
  const up = lowFirst(upper, 2);
  add('上わんの 下はし（ひじ）', up[0]);
  add('上わんの 上はし（肩）', up[1]);
  add('肩の 雲', sh.center);
  // 坂は 雲の 上を 通るので、坂の かげを よけて 雲の 前がわを とおり、外の ひろばに 出てから 坂に はいる
  const sgn = Math.sign((up[1][0] - sh.center[0]) * sh.axes[2][0] + (up[1][2] - sh.center[2]) * sh.axes[2][2]) || 1;
  const at = (fu, fs) => [0, 1, 2].map((d) => sh.center[d] + sh.axes[0][d] * sh.half[0] * fu + sh.axes[2][d] * sh.half[2] * fs * sgn);
  add('肩の 雲の 前がわ', at(0.3, 0.6));
  add('肩の 雲の 外の ひろば', at(0.85, 0.6));
  const rp = lowFirst(ro, 0);
  add('坂（外）の 下はし', rp[0]);
  add('坂（外）の 上はし', rp[1]);
  add('リボンの 羽', wing.center);
  const ip = lowFirst(ri, 0);
  add('坂（内）の 下はし', ip[0]);
  add('坂（内）の 上はし', ip[1]);
  add('頭の 上', [sk.center[0], sk.center[1] + sk.half[1], sk.center[2]]);
  // 出発: 地面
  const gy = h.world.groundHeight(Math.floor(W[0].x), Math.floor(W[0].z)) + 1;
  h.player.set({ position: { x: W[0].x, y: gy, z: W[0].z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  for (let i = 0; i < 20; i++) h.step(1);
  const log = [];
  let ok = true, steps = 0, lastMove = 0, lastPos = null;
  for (let wi = 1; wi < W.length; wi++) {
    const t = W[wi];
    let reached = false;
    const trace = [];
    for (let n = 0; n < 900; n++, steps++) {
      const p = h.player.get().position;
      const dx = t.x - p.x, dz = t.z - p.z;
      // 横が 近く、高さも あって（落ちて 通りすぎて いない）いれば 着いた
      if (Math.hypot(dx, dz) < 0.9 && (t.y < 10 || Math.abs(p.y - t.y) < 5)) { reached = true; break; }
      if (n % 8 === 0) trace.push(`(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)})`);
      h.player.set({ yaw: (Math.atan2(dx, -dz) * 180) / Math.PI });
      h.input.press('moveForward');
      // 止まって いる とき（0.25 秒 うごかない）は ジャンプ
      if (lastPos && Math.hypot(p.x - lastPos.x, p.z - lastPos.z) < 0.01) lastMove++; else lastMove = 0;
      lastPos = { x: p.x, z: p.z };
      if (lastMove > 6) h.input.press('jump'); else h.input.release('jump');
      h.step(1);
    }
    const p = h.player.get().position;
    log.push(`${reached ? 'OK ' : 'NG '} ${t.name} → 目標(${t.x.toFixed(1)}, ${t.y.toFixed(1)}, ${t.z.toFixed(1)}) いま(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
    if (!reached) {
      ok = false;
      log.push('通った 道 ' + trace.join(' '));
      // とまった 場所の まわりの 高さ（上から 見た いちばん 高い 固いマス。足もとより 上 3 まで）
      const px = Math.floor(p.x), pz = Math.floor(p.z), py = Math.floor(p.y);
      const rows = [];
      for (let z = pz - 4; z <= pz + 4; z++) {
        let r = `z${z}: `;
        for (let x = px - 4; x <= px + 4; x++) { let top = '.'; for (let y = py + 6; y >= py - 8; y--) if (g.solidAt(x, y, z)) { top = String(y - py); break; } r += top.padStart(3); }
        rows.push(r);
      }
      log.push(`とまった まわり（足の マスからの 高さ。x ${px - 4}〜${px + 4}）\n` + rows.join('\n'));
      break;
    }
  }
  h.input.releaseAll();
  const p = h.player.get().position;
  return { ok, log, steps, final: [p.x, p.y, p.z], skullTop: sk.center[1] + sk.half[1] };
}, [SIDE, START]);
console.log(result.log.join('\n'));
console.log(JSON.stringify({ ok: result.ok, steps: result.steps, final: result.final.map((v) => +v.toFixed(2)), skullTop: +result.skullTop.toFixed(2) }));
await browser.close();
process.exit(result.ok ? 0 : 1);
