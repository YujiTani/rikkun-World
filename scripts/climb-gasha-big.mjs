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
  const sk = H('skull');
  const rungs = (key) => hits.filter((c) => new RegExp(`^${key}${side}\\d+$`).test(c.name)).sort((p, q) => Number(p.name.slice(key.length + 1)) - Number(q.name.slice(key.length + 1)));
  const ramp = rungs('ramp'), head = rungs('head');
  const W = [];
  const add = (name, p) => W.push({ name, x: p[0], y: p[1], z: p[2] });
  const lowFirst = (c, ax) => { const [a, b] = ends(c, ax); return a[1] <= b[1] ? [a, b] : [b, a]; }; // 低い 方の はしから
  // 地面 → 手 → 前わん → 上わん → 肩の 下から 生える 雲の はしご（ramp）→ リボン → 頭の 横（head）→ 頭の 上
  const hand = H(`hand${side}`), fore = H(`foreArm${side}`), upper = H(`upperArm${side}`);
  add('地面（手の 先の 前）', [hand.center[0], 0, hand.center[2] + hand.half[2] + 2]);
  add('手', [hand.center[0], 0, hand.center[2]]);
  const fp = lowFirst(fore, 2);
  add('前わんの 下はし（手首）', fp[0]);
  // うでは はばが せまい ので、中心の 線に そって 3 ブロックごとに 道しるべを おく（まっすぐ ねらうと はしから 落ちる）
  const along = (name, a, b) => { const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 3)); for (let i = 1; i <= n; i++) add(`${name} ${i}/${n}`, [0, 1, 2].map((d) => a[d] + ((b[d] - a[d]) * i) / n)); };
  along('前わん', fp[0], fp[1]);
  const up = lowFirst(upper, 2);
  along('上わん', up[0], up[1]);
  ramp.forEach((c, i) => add(`リボンへ ${i}`, c.center));
  head.forEach((c, i) => add(`頭の 横 ${i}`, c.center));
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
      // どの 当たりの 箱の 上の 面か（名前の 最後の 数字だけ）
      const nameAt = (x, y, z) => { for (const c of hits) { const d = [x + 0.5 - c.center[0], y + 0.5 - c.center[1], z + 0.5 - c.center[2]]; let ok = true; for (let k = 0; k < 3; k++) { const u = c.axes[k]; if (Math.abs(d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) > c.half[k]) ok = false; } if (ok) return c.name.replace(/[LR]/, '').slice(0, 2) + c.name.replace(/\D/g, ''); } return '?'; };
      const nrows = [];
      for (let z = pz - 4; z <= pz + 4; z++) {
        let r = `z${z}: `;
        for (let x = px - 4; x <= px + 4; x++) { let top = '.'; for (let y = py + 6; y >= py - 8; y--) if (g.solidAt(x, y, z)) { top = nameAt(x, y, z); break; } r += top.padStart(7); }
        nrows.push(r);
      }
      log.push('当たりの 名前\n' + nrows.join('\n'));
      log.push(`とまった まわり（足の マスからの 高さ。x ${px - 4}〜${px + 4}）\n` + rows.join('\n'));
      if (false) { const q = [];
        for (let y = py + 3; y >= py - 3; y--) { let r = `y${y}: `; for (const [x, z] of [[px, pz], [px + 1, pz], [px, pz + 1], [px + 1, pz + 1], [px, pz - 1], [px + 1, pz - 1]]) r += `(${x},${z})=${h.world.isSolidForPlayer(x, y, z) ? '#' : '.'} `; q.push(r); }
        log.push('固い マス\n' + q.join('\n')); }
      // 1 つ 前の 道しるべの まわり（そこから 先へ すすめなかった 場所）
      const pv = W[wi - 1], qx = Math.floor(pv.x), qz = Math.floor(pv.z), qy = Math.floor(pv.y < 10 ? h.world.groundHeight(qx, qz) + 1 : pv.y);
      const rows2 = [];
      for (let z = qz - 6; z <= qz + 6; z++) {
        let r = `z${z}: `;
        for (let x = qx - 5; x <= qx + 5; x++) { let top = '.'; for (let y = qy + 8; y >= qy - 8; y--) if (g.solidAt(x, y, z)) { top = String(y - qy); break; } r += top.padStart(3); }
        rows2.push(r);
      }
      log.push(`1 つ 前（${pv.name}）の まわり（足の マスからの 高さ。x ${qx - 5}〜${qx + 5}、足は ${qy}）\n` + rows2.join('\n'));
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
