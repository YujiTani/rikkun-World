// #293 試作: 大きい がしゃどくろ（?proto=gashaBig）を、本物の プレイヤーの 動き（前進・ジャンプの 入力を コマ送り）で
//   地面 → 間欠泉 → 肩の 雲 → 髪の 段（ツインテール → 横の 髪）→ 頭の 上 まで 行けるか、
//   頭の 上から 間欠泉めがけて とびおりても 体力が へらないか を 確かめる。
//   node scripts/climb-gasha-big.mjs     （開発サーバー http://localhost:5173 が 動いて いること）
//   環境変数: SIDE=L|R（のぼる 側の 肩）、START="x,z,向き(度)"（別の 場所から）、BASE、EXTRA（URL の おわりに 足す）、
//            DIVE=1（頭の 上から とびおる 確かめも する。ふだんは しない）、CONTROL=1（間欠泉から 離れた 方へ とびおりて、体力が へる ことも 確かめる）
//   全部 通ったら 終了コード 0。
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const SIDE = process.env.SIDE ?? 'L';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/?proto=gashaBig&nosave=1&char=boy${process.env.EXTRA ?? ''}`);
await page.waitForFunction(() => window.__rikkun?.ready === true && !!window.__gashaBig, null, { timeout: 120_000 });
await page.evaluate(() => window.__rikkun.suspendRender(true)); // 描かずに コマ送り（はやい）
const START = (process.env.START ?? '').split(',').map(Number);
const result = await page.evaluate(async ([side, START, dive, control]) => {
  const h = window.__rikkun, g = window.__gashaBig;
  h.achievements.mute(true); h.lock.simulate(true); h.pause(); h.input.releaseAll();
  h.settings.set('yokaiAutoSpawn', false); h.settings.set('yokaiWander', false); h.yokai.clear(); h.time.set(0);
  h.combat.setHp?.(20);
  if (START.length === 3 && START.every((v) => !Number.isNaN(v))) {
    const gy0 = h.world.groundHeight(Math.floor(START[0]), Math.floor(START[1])) + 1;
    h.player.set({ position: { x: START[0], y: gy0 + 2, z: START[1] }, velocity: { x: 0, y: 0, z: 0 }, yaw: START[2], pitch: 0 });
  }
  for (let i = 0; i < 90; i++) h.step(1);
  const log0 = [];
  g.place(); g.walk?.(false); // さまよい（動く 巨大がしゃ）を 止めて、決まった 姿勢で 調べる
  const early = g.geysers();
  log0.push(`置いた すぐ: ` + early.map((q) => `${q.state}${q.stage}`).join(' '));
  for (let i = 0; i < 780; i++) h.step(1); // ひびが 入って（10 秒）間欠泉に なり、わき出す まで
  const hits = g.colliders();
  const H = (n) => hits.find((c) => c.name === n);
  const log = log0;
  const hp = () => h.combat.get().hp;
  const me = () => h.player.get();
  const geys = g.geysers().filter((q) => q.state === 'up');
  log.push(`間欠泉 ${geys.length} 本: ` + geys.map((q) => `(${q.x.toFixed(0)},${q.z.toFixed(0)} ${q.state})`).join(' '));

  /** 目標へ 向かって 本物の 入力で 歩く。着いたら true */
  const lastTrace = [];
  const walkTo = (t, o = {}) => {
    const maxN = o.maxN ?? 900;
    let lastPos = null, still = 0;
    lastTrace.length = 0;
    for (let n = 0; n < maxN; n++) {
      const pl = me(), p = pl.position;
      if (n > maxN - 40 && n % 2 === 0) lastTrace.push(`(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}${pl.onGround ? 'g' : ''} vy${pl.velocity.y.toFixed(1)})`);
      const dx = t.x - p.x, dz = t.z - p.z;
      if (o.stop?.(pl)) return true;
      if (!o.stop && Math.hypot(dx, dz) < (o.r ?? 0.7) && Math.abs(p.y - t.y) < (o.dy ?? 2.5) && pl.onGround) return true;
      h.player.set({ yaw: (Math.atan2(dx, -dz) * 180) / Math.PI });
      h.input.press('moveForward');
      if (o.run) h.input.press('run');
      if (lastPos && Math.hypot(p.x - lastPos.x, p.z - lastPos.z) < 0.01 && pl.onGround) still++; else still = 0;
      lastPos = { x: p.x, z: p.z };
      if (still > 6 && !o.noJump) h.input.press('jump'); else h.input.release('jump');
      h.step(1);
    }
    return false;
  };
  const stopAll = () => { h.input.release('moveForward'); h.input.release('run'); h.input.release('jump'); };
  const inCol = (q, p) => p.x >= q.x0 && p.x < q.x0 + q.cells && p.z >= q.z0 && p.z < q.z0 + q.cells;

  // ---- 1. 地面 → 間欠泉 → 肩の 雲
  const clouds = hits.filter((c) => new RegExp(`^shoulder${side}\\d+$`).test(c.name));
  const dCloud = (q, c) => Math.hypot(c.center[0] - q.x, c.center[2] - q.z);
  // 肩の 雲に いちばん 近い 間欠泉（肩の 下の 1 本）と、その 間欠泉に いちばん 近い 雲
  const geyser = [...geys].sort((a, b) => Math.min(...clouds.map((c) => dCloud(a, c))) - Math.min(...clouds.map((c) => dCloud(b, c))))[0];
  const cloud = [...clouds].sort((a, b) => dCloud(geyser, a) - dCloud(geyser, b))[0];
  const cloudTop = cloud.center[1] + cloud.half[1];
  // 出発: 間欠泉から、からだと 反対 がわへ 6 ブロック はなれた 地面
  const bx = g.info().pos[0], bz = g.info().pos[2];
  const ox = geyser.x - bx, oz = geyser.z - bz, ol = Math.hypot(ox, oz);
  const sx = geyser.x + (ox / ol) * 6, sz = geyser.z + (oz / ol) * 6;
  const gy = h.world.groundHeight(Math.floor(sx), Math.floor(sz)) + 1;
  h.player.set({ position: { x: sx, y: gy, z: sz }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  for (let i = 0; i < 20; i++) h.step(1);
  const groundY0 = me().position.y;
  let ok = true;
  let enteredAt = -1, maxY = groundY0;
  const rideStop = (pl) => {
    const p = pl.position;
    maxY = Math.max(maxY, p.y);
    if (enteredAt < 0 && inCol(geyser, p)) enteredAt = p.y;
    return enteredAt >= 0 && pl.onGround && p.y > cloudTop - 1.5;
  };
  // 柱に 入る まで 柱の 中心へ、入ったら 肩の 雲の 中心へ（のぼる あいだは 柱が 横へ 出さない）
  let reached = false;
  const trace = [];
  for (let n = 0; n < 900 && !reached; n++) {
    const pl = me(), p = pl.position;
    if (n % 6 === 0 && trace.length < 60) trace.push(`(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}${pl.onGround ? 'g' : ''})`);
    const t = enteredAt >= 0 ? { x: cloud.center[0], z: cloud.center[2] } : { x: geyser.x, z: geyser.z };
    const dx = t.x - p.x, dz = t.z - p.z;
    h.player.set({ yaw: (Math.atan2(dx, -dz) * 180) / Math.PI });
    h.input.press('moveForward'); h.input.release('jump');
    h.step(1);
    reached = rideStop(me());
    // 雲の 上で ちゃんと 立っている（足が 雲の 上の 面）
  }
  stopAll();
  const pa = me().position;
  log.push(`${reached ? 'OK ' : 'NG '} 間欠泉 → 肩の 雲: 柱に 入った 高さ ${enteredAt.toFixed(2)}、いちばん 高い ${maxY.toFixed(2)}（雲の 上 ${cloudTop.toFixed(2)}、柱の 上 ${geyser.top.toFixed(2)}）、いま (${pa.x.toFixed(1)}, ${pa.y.toFixed(1)}, ${pa.z.toFixed(1)}) hp ${hp()}`);
  if (!reached) { ok = false; log.push('道 ' + trace.join(' ')); log.push(`柱 x ${geyser.x0}〜${geyser.x0 + geyser.cells} z ${geyser.z0}〜${geyser.z0 + geyser.cells}、雲 ${cloud.name} 中心 (${cloud.center.map((v) => v.toFixed(1))}) 半分 (${cloud.half.map((v) => v.toFixed(1))})`); }

  // ---- 2. 肩の 雲 → 髪の 段 → 頭の 上
  const sk = H('skull');
  let climbed = false;
  if (reached) {
    const seq = (key) => hits.filter((c) => new RegExp(`^${key}${side}\\d+$`).test(c.name)).sort((p, q) => Number(p.name.slice(key.length + 1)) - Number(q.name.slice(key.length + 1)));
    const W = [...seq('tail'), ...seq('side')].map((c) => ({ name: c.name, x: c.center[0], y: c.center[1] + c.half[1], z: c.center[2] }));
    W.push({ name: '頭の 上', x: sk.center[0], y: sk.center[1] + sk.half[1], z: sk.center[2] });
    // 髪の 段の はじめの 段（tail0）へ 雲から 歩く。雲の 上で 近い ところまで 先に 歩く
    climbed = true;
    for (const t of W) {
      const okw = walkTo(t, { maxN: 600, dy: 1.6, r: 0.8 });
      const p = me().position;
      log.push(`${okw ? 'OK ' : 'NG '} ${t.name} → (${t.x.toFixed(1)}, ${t.y.toFixed(1)}, ${t.z.toFixed(1)}) いま (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
      if (!okw) {
        climbed = false; ok = false;
        log.push('さいごの 動き ' + lastTrace.join(' '));
        const px = Math.floor(p.x), pz = Math.floor(p.z), py = Math.floor(p.y);
        const rows = [];
        for (let z = pz - 4; z <= pz + 4; z++) {
          let r = `z${z}: `;
          for (let x = px - 5; x <= px + 5; x++) { let top = '.'; for (let y = py + 6; y >= py - 8; y--) if (g.solidAt(x, y, z)) { top = String(y - py); break; } r += top.padStart(3); }
          rows.push(r);
        }
        for (let y = py + 4; y >= py - 1; y--) {
          let r = `y${y - py >= 0 ? '+' : ''}${y - py}: `;
          for (let z = pz - 2; z <= pz + 2; z++) { for (let x = px - 3; x <= px + 2; x++) r += g.solidAt(x, y, z) ? '#' : '.'; r += ' '; }
          log.push(r);
        }
        log.push(`とまった まわり（足の マスからの 高さ。x ${px - 5}〜${px + 5}、足は ${py}）\n` + rows.join('\n'));
        break;
      }
    }
    stopAll();
  }
  const pt = me().position;
  log.push(`頭の 上 ${climbed ? 'OK' : 'NG'}: 足 y=${pt.y.toFixed(2)}（頭の 上の 面 ${(sk.center[1] + sk.half[1]).toFixed(2)}）`);

  // ---- 3. 頭の 上 → とびおり
  let diveInfo = null;
  if (dive && climbed) {
    const heads = g.geysers().filter((q) => q !== undefined);
    const bk = control
      ? (() => { const I = g.info(), yw = (I.yawDeg * Math.PI) / 180; return { x: I.pos[0] - 30 * Math.sin(yw), z: I.pos[2] - 30 * Math.cos(yw) }; })() // 背中の ほう（リボンの 上。間欠泉は ない）へ
      : [...heads].sort((a, b) => Math.hypot(a.x - pt.x, a.z - pt.z) - Math.hypot(b.x - pt.x, b.z - pt.z))[0];
    // まず 頭の 上の その 間欠泉に いちばん 近い はし まで 歩く
    const dxk = bk.x - sk.center[0], dzk = bk.z - sk.center[2], dl = Math.hypot(dxk, dzk);
    const edge = { x: sk.center[0] + (dxk / dl) * (sk.half[0] - 0.8), y: sk.center[1] + sk.half[1], z: sk.center[2] + (dzk / dl) * (sk.half[2] - 0.8) };
    walkTo(edge, { maxN: 400, dy: 3, r: 0.6, noJump: true });
    stopAll();
    const hp0 = hp();
    const pe = me().position;
    let airborne = false, minHp = hp0, landed = false, usedCol = false, n = 0;
    const startY = pe.y;
    const dtrace = [];
    for (; n < 900 && !landed; n++) {
      const pl = me(), p = pl.position;
      if (n % 5 === 0 && dtrace.length < 70) dtrace.push(`(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}${pl.onGround ? 'g' : ''} vy${pl.velocity.y.toFixed(0)} hp${hp()})`);
      if (!pl.onGround) airborne = true;
      if (heads.some((q) => inCol(q, p) && p.y <= q.top)) usedCol = true;
      const dx = bk.x - p.x, dz = bk.z - p.z;
      h.player.set({ yaw: (Math.atan2(dx, -dz) * 180) / Math.PI });
      h.input.press('moveForward'); h.input.press('run'); h.input.release('jump');
      h.step(1);
      minHp = Math.min(minHp, hp());
      const q = me();
      // 地面まで 落ちて きて 止まった（頭の 高さより ずっと 下）
      if (airborne && q.onGround && q.position.y < startY - 6) landed = true;
    }
    stopAll();
    for (let i = 0; i < 30; i++) h.step(1);
    minHp = Math.min(minHp, hp());
    const pl = me().position;
    diveInfo = { control, from: [pe.x, pe.y, pe.z].map((v) => +v.toFixed(1)), fallBlocks: +(startY - pl.y).toFixed(1), hpBefore: hp0, hpMin: minHp, hpAfter: hp(), landed, usedColumn: usedCol, ticks: n, final: [pl.x, pl.y, pl.z].map((v) => +v.toFixed(1)) };
    const pass = control ? minHp < hp0 : (landed && minHp === hp0);
    log.push(`${pass ? 'OK ' : 'NG '} とびおり${control ? '（間欠泉と 反対 = 体力が へるはず）' : '（間欠泉めがけて = 体力は そのまま）'} ` + JSON.stringify(diveInfo));
    if (!pass) { ok = false; log.push('とびおりの 道 ' + dtrace.join(' ') + `\n目標の 間欠泉 (${bk.x}, ${bk.z}) 柱の 上 ${bk.top}`); }
  }
  h.input.releaseAll();
  return { ok, log, enteredAt, maxY, climbed };
}, [SIDE, START, process.env.DIVE === '1', process.env.CONTROL === '1']);
console.log(result.log.join('\n'));
console.log(JSON.stringify({ ok: result.ok, climbed: result.climbed }));
await browser.close();
process.exit(result.ok ? 0 : 1);
