// #293 試作: 大きい がしゃどくろ（?proto=gashaBig）の「全身に のれる」を、本物の プレイヤーの 動き（前進・ジャンプの 入力を コマ送り）で 確かめる。
//   ・うでの 道: 地面 → 手（指）→ 前わん → 上わん → 肩の ぬの（体を 45 度 むけても）   ARMS=1（ふだんは しない。START の 向きを 45 に する）
//   ・間欠泉 → 肩の 雲 → 胴体の 上（えり・さこつ）→ 首の よこ → 背中の おなか（おりる）
//   ・髪の 段 → 頭の てっぺんの わく → 顔の 前の ふち（60 ステップ 落ちずに 立つ）→ てっぺんの 穴に おりて みる（ふさがって いない）
//   node scripts/climb-gasha-body.mjs     （開発サーバー http://localhost:5173 が 動いて いること。BASE=http://localhost:5391 など で かえる）
//   環境変数: SIDE=L|R、START="x,z,向き(度)"、ARMS=1（うでの 道だけ）、EXTRA、BASE
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
const result = await page.evaluate(async ([side, START, arms]) => {
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
  for (let i = 0; i < 1000; i++) h.step(1); // 間欠泉が できて わき出す まで
  const log = [];
  let ok = true;
  const hits = g.colliders();
  const H = (n) => hits.find((c) => c.name === n);
  const hp = () => h.combat.get().hp;
  const me = () => h.player.get();
  const stopAll = () => { h.input.release('moveForward'); h.input.release('run'); h.input.release('jump'); };
  const check = (pass, msg) => { log.push(`${pass ? 'OK ' : 'NG '} ${msg}`); if (!pass) ok = false; return pass; };
  const f1 = (v) => v.toFixed(1);

  /** x, z の 立てる 高さ（足の 高さ。ymax より 下で いちばん 上の、上が 2 マス あいた 固い マスの 上）。なければ null */
  const topAt = (x, z, ymax = 60) => {
    for (let j = Math.floor(ymax); j >= 0; j--) if (g.solidAt(Math.floor(x), j, Math.floor(z)) && !g.solidAt(Math.floor(x), j + 1, Math.floor(z)) && !g.solidAt(Math.floor(x), j + 2, Math.floor(z))) return j + 1;
    return null;
  };
  /** 箱の 上の 面の まんなか（箱の 中心の 真上から 見た 立てる 高さ） */
  const topOf = (c, dx = 0, dz = 0, ymax) => {
    const x = c.center[0] + dx, z = c.center[2] + dz;
    return { x, z, y: topAt(x, z, ymax ?? c.center[1] + c.half[1] + 3) };
  };
  const lastTrace = [];
  /** 目標へ 向かって 本物の 入力で 歩く。着いたら true */
  const walkTo = (t, o = {}) => {
    const maxN = o.maxN ?? 900;
    let lastPos = null, still = 0;
    lastTrace.length = 0;
    for (let n = 0; n < maxN; n++) {
      const pl = me(), p = pl.position;
      if (n > maxN - 40 && n % 2 === 0) lastTrace.push(`(${f1(p.x)},${f1(p.y)},${f1(p.z)}${pl.onGround ? 'g' : ''})`);
      const dx = t.x - p.x, dz = t.z - p.z;
      if (Math.hypot(dx, dz) < (o.r ?? 0.7) && Math.abs(p.y - t.y) < (o.dy ?? 1.6) && pl.onGround) return true;
      h.player.set({ yaw: (Math.atan2(dx, -dz) * 180) / Math.PI });
      h.input.press('moveForward');
      if (o.run) h.input.press('run');
      if (lastPos && Math.hypot(p.x - lastPos.x, p.z - lastPos.z) < 0.01 && pl.onGround) still++; else still = 0;
      if (still > 6 && !o.noJump) h.input.press('jump'); else h.input.release('jump');
      h.step(1);
    }
    return false;
  };
  const stand = (n) => { stopAll(); const p0 = { ...me().position }; let drop = 0, off = true; for (let i = 0; i < n; i++) { h.step(1); const p = me().position; drop = Math.max(drop, p0.y - p.y); if (me().onGround) off = false; } return { drop, p: me().position, onGround: me().onGround, off }; };
  const inBody = () => { const p = me().position; return g.solidAt(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z)) || g.solidAt(Math.floor(p.x), Math.floor(p.y + 1.5), Math.floor(p.z)); };
  const dumpAround = () => {
    const p = me().position, px = Math.floor(p.x), pz = Math.floor(p.z), py = Math.floor(p.y);
    const rows = [];
    for (let z = pz - 4; z <= pz + 4; z++) {
      let r = `z${z}: `;
      for (let x = px - 5; x <= px + 5; x++) { let top = '.'; for (let y = py + 6; y >= py - 8; y--) if (g.solidAt(x, y, z)) { top = String(y - py); break; } r += top.padStart(3); }
      rows.push(r);
    }
    return `とまった まわり（足の マスからの 高さ。x ${px - 5}〜${px + 5}、足は ${py}）\n` + rows.join('\n');
  };
  const info = g.info();
  log.push(`からだ 向き ${f1(info.yawDeg)} 度、当たりの 箱 ${hits.length} こ、間欠泉 ${g.geysers().map((q) => q.state).join(' ')}`);

  // ============================================================ うでの 道（地面 → 手 → 前わん → 上わん → 肩の ぬの）
  if (arms) {
    const S = side === 'L' ? 'L' : 'R';
    const route = [
      ['指（ひらいた 4 本の 外）', H(`handFingersA${S}`), 0, 0],
      ['てのひら', H(`hand${S}`), 0, 0],
      ['前わん（手首ぎわ）', H(`foreArm${S}`), 0, 1],
      ['前わん（ひじぎわ）', H(`foreArm${S}`), 0, -1],
      ['上わん（ひじぎわ）', H(`upperArm${S}`), 0, 0],
      ['上わん（かたぎわ）', H(`upperArm${S}`), 0, 0],
    ];
    const sgn = side === 'L' ? 1 : -1;
    // 地面から 手の 先の 前へ
    const hand = H(`hand${S}`);
    const gy = h.world.groundHeight(Math.floor(hand.center[0]), Math.floor(hand.center[2])) + 1;
    const yaw = (g.info().yawDeg * Math.PI) / 180;
    const fwd = [Math.sin(yaw), Math.cos(yaw)]; // からだの 前（+z）の 世界の 向き
    void sgn; void route; void fwd;
    // はじめの 立ち位置: 手の 先から 6 ブロック 前
    const tipD = hand.half[2] + 6;
    const ax = hand.axes[2];
    const sx = hand.center[0] + ax[0] * tipD, sz = hand.center[2] + ax[2] * tipD;
    h.player.set({ position: { x: sx, y: h.world.groundHeight(Math.floor(sx), Math.floor(sz)) + 1, z: sz }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    for (let i = 0; i < 30; i++) h.step(1);
    // 道の 通る 点: 手の 先 → てのひら → 前わんの 中心 → 上わんの 中心 → 肩の ぬの（箱の 軸に そって 少しずつ。1 つ 前の 点から あるいて いける）
    const pts = [];
    const along = (c, tFrom, tTo, n) => {
      const a = c.axes[2];
      for (let i = 0; i < n; i++) { const t = tFrom + (tTo - tFrom) * (i / (n - 1)); pts.push({ name: `${c.name} ${(t).toFixed(2)}`, x: c.center[0] + a[0] * c.half[2] * t, z: c.center[2] + a[2] * c.half[2] * t, top: c.center[1] + a[1] * c.half[2] * t + c.axes[1][1] * c.half[1] }); }
    };
    along(H(`hand${S}`), 0.9, -0.3, 3);
    along(H(`foreArm${S}`), 0.8, -0.9, 5);
    along(H(`upperArm${S}`), 0.8, -0.9, 5);
    pts.push({ name: `shoulderCloth${S}`, ...(() => { const c = H(`shoulderCloth${S}`); return { x: c.center[0], z: c.center[2], top: c.center[1] + c.half[1] }; })() });
    let allOk = true;
    for (const t of pts) {
      const y = topAt(t.x, t.z, t.top + 2);
      if (y === null) { check(false, `${t.name}: 立てる 高さが ない (${f1(t.x)}, ${f1(t.z)})`); allOk = false; break; }
      const okw = walkTo({ x: t.x, z: t.z, y }, { maxN: 500, r: 0.8, dy: 1.7 });
      const p = me().position;
      if (!okw) { check(false, `${t.name} → (${f1(t.x)}, ${f1(y)}, ${f1(t.z)}) いま (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)}) 道 ${lastTrace.join(' ')}\n${dumpAround()}`); allOk = false; break; }
    }
    stopAll();
    if (allOk) check(true, `うでの 道: 手 → 前わん → 上わん → 肩の ぬの（からだ ${f1(g.info().yawDeg)} 度）。いま (${f1(me().position.x)}, ${f1(me().position.y)}, ${f1(me().position.z)})`);
    h.input.releaseAll();
    return { ok, log };
  }

  // ============================================================ 間欠泉 → 肩の 雲
  const S = side;
  const geys = g.geysers().filter((q) => q.state !== 'cracking' && q.state !== 'wait');
  check(geys.length >= 2, `間欠泉 ${geys.length} 本`);
  const clouds = hits.filter((c) => new RegExp(`^shoulder${S}\\d+$`).test(c.name));
  const dCloud = (q, c) => Math.hypot(c.center[0] - q.x, c.center[2] - q.z);
  const geyser = [...geys].sort((a, b) => Math.min(...clouds.map((c) => dCloud(a, c))) - Math.min(...clouds.map((c) => dCloud(b, c))))[0];
  const cloud = [...clouds].sort((a, b) => dCloud(geyser, a) - dCloud(geyser, b))[0];
  const cloudTop = cloud.center[1] + cloud.half[1];
  const bx = info.pos[0], bz = info.pos[2];
  const ox = geyser.x - bx, oz = geyser.z - bz, ol = Math.hypot(ox, oz);
  const sx = geyser.x + (ox / ol) * 6, sz = geyser.z + (oz / ol) * 6;
  h.player.set({ position: { x: sx, y: h.world.groundHeight(Math.floor(sx), Math.floor(sz)) + 1, z: sz }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  for (let i = 0; i < 20; i++) h.step(1);
  const inCol = (q, p) => p.x >= q.x0 && p.x < q.x0 + q.cells && p.z >= q.z0 && p.z < q.z0 + q.cells;
  let enteredAt = -1, reached = false;
  for (let n = 0; n < 900 && !reached; n++) {
    const pl = me(), p = pl.position;
    const t = enteredAt >= 0 ? { x: cloud.center[0], z: cloud.center[2] } : { x: geyser.x, z: geyser.z };
    h.player.set({ yaw: (Math.atan2(t.x - p.x, -(t.z - p.z)) * 180) / Math.PI });
    h.input.press('moveForward'); h.input.release('jump');
    h.step(1);
    const q = me();
    if (enteredAt < 0 && inCol(geyser, q.position)) enteredAt = q.position.y;
    reached = enteredAt >= 0 && q.onGround && q.position.y > cloudTop - 1.5;
  }
  stopAll();
  check(reached, `間欠泉 → 肩の 雲（${geyser.state}、高さ ${f1(geyser.visTop - geyser.ground)} / 打ち上げ ${f1(geyser.top - geyser.ground)}）。いま (${f1(me().position.x)}, ${f1(me().position.y)}, ${f1(me().position.z)})`);
  if (!reached) { h.input.releaseAll(); return { ok, log }; }

  // ============================================================ 胴体の 上
  const sgn = side === 'L' ? 1 : -1;
  const chestTop = H('chestTop'), neck = H('neck'), collar = H('collarbone'), waist = H('torsoWaist');
  {
    const t = topOf(chestTop, sgn * 2.5, 0);
    const okw = t.y !== null && walkTo(t, { maxN: 500, r: 0.9 });
    check(okw, `胴体の 上（えりの 上の 面）に 歩いて のぼれる (${f1(t.x)}, ${t.y}, ${f1(t.z)}) いま (${f1(me().position.x)}, ${f1(me().position.y)}, ${f1(me().position.z)})${okw ? '' : '\n' + dumpAround()}`);
    check(!inBody(), '胴体の 中に 入って いない');
  }
  {
    // 胸から 首へ: 首の よこ（首の 箱から 1 ブロック はなれた えりの 上）まで
    const t = topOf(chestTop, 0, 0);
    t.x = neck.center[0] + sgn * (neck.half[0] + 1.2); t.z = neck.center[2] - 0.5; t.y = topAt(t.x, t.z, neck.center[1] + 6);
    const okw = t.y !== null && walkTo(t, { maxN: 500, r: 0.8 });
    const s = stand(30);
    check(okw && !s.off && s.drop < 0.2, `胸から 首の よこへ（首の 箱 x ${f1(neck.center[0])}、高さ ${f1(neck.center[1] + neck.half[1])}）。(${f1(s.p.x)}, ${f1(s.p.y)}, ${f1(s.p.z)}) 立って いられる`);
    check(!inBody(), '首の まわりでも 中に 入って いない');
  }
  {
    const t = topOf(collar, sgn * 7, 0);
    const okw = t.y !== null && walkTo(t, { maxN: 500, r: 0.9 });
    check(okw, `さこつの 上（肩の ほう）に 歩ける (${f1(t.x)}, ${t.y}, ${f1(t.z)})`);
  }
  {
    // 背中の ほうへ おりて、おなか（torsoWaist）の 上に 立つ
    const t = topOf(waist, 0, -2);
    let okw = false;
    if (t.y !== null) okw = walkTo(t, { maxN: 700, r: 1.2, dy: 2 });
    check(okw, `おなかの 上に 歩いて おりられる (${f1(t.x)}, ${t.y}, ${f1(t.z)}) いま (${f1(me().position.x)}, ${f1(me().position.y)}, ${f1(me().position.z)})`);
    check(!inBody(), 'おなかの 中に 入って いない');
  }

  // ============================================================ 髪の 段 → 頭の てっぺん → 顔の 前
  // もういちど 肩の 雲へ（おなかから 戻る）。雲の 上へ 直接 おいて 本物の 入力で 髪の 段を のぼる
  h.player.set({ position: { x: cloud.center[0], y: cloudTop, z: cloud.center[2] }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  for (let i = 0; i < 30; i++) h.step(1);
  const seq = (key) => hits.filter((c) => new RegExp(`^${key}${S}\\d+$`).test(c.name)).sort((p, q) => Number(p.name.slice(key.length + 1)) - Number(q.name.slice(key.length + 1)));
  const W = seq('tail').map((c) => ({ name: c.name, x: c.center[0], y: c.center[1] + c.half[1], z: c.center[2] }));
  const top1 = H('skullTop1'), top0 = H('skullTop0'), top2 = H('skullTop2');
  const ring = sgn > 0 ? top1 : top0;
  W.push({ name: 'てっぺんの わく（よこ）', x: ring.center[0] + sgn * 1, y: ring.center[1] + ring.half[1], z: ring.center[2] });
  let climbed = true;
  for (const t of W) {
    const okw = walkTo(t, { maxN: 600, dy: 1.7, r: 0.8 });
    if (!okw) {
      const p = me().position;
      check(false, `${t.name} → (${f1(t.x)}, ${f1(t.y)}, ${f1(t.z)}) いま (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)}) 道 ${lastTrace.join(' ')}\n${dumpAround()}`);
      climbed = false; break;
    }
  }
  stopAll();
  check(climbed, `髪の 段 → 頭の てっぺんの わく。いま (${f1(me().position.x)}, ${f1(me().position.y)}, ${f1(me().position.z)})`);
  if (climbed) {
    // 前の わく（穴の 前）→ 顔の 前の ふち（からだの 前 = 軸 2）
    const a2 = top2.axes[2];
    const edge = { x: top2.center[0] + a2[0] * (top2.half[2] - 0.6), z: top2.center[2] + a2[2] * (top2.half[2] - 0.6) };
    edge.y = topAt(edge.x, edge.z, top2.center[1] + 4);
    const okw = edge.y !== null && walkTo(edge, { maxN: 500, r: 0.6, noJump: true });
    const s = stand(60);
    check(okw && !s.off && s.drop < 0.2, `顔の 前の ふち（頭の てっぺんの 前）に 落ちずに 立てる (${f1(edge.x)}, ${edge.y}, ${f1(edge.z)}) → (${f1(s.p.x)}, ${f1(s.p.y)}, ${f1(s.p.z)}) 60 ステップ 立って 落ち ${f1(s.drop)}`);
    // てっぺんの 穴: 穴の まんなかへ あるいて おりられる（ふさがって いない）
    const sk = H('skull');
    const hole = { x: top2.center[0] - a2[0] * (top2.half[2] + 1.2), z: top2.center[2] - a2[2] * (top2.half[2] + 1.2) };
    const hy = topAt(hole.x, hole.z, sk.center[1] + sk.half[1] + 3);
    const skTop = sk.center[1] + sk.half[1];
    const holeOk = hy !== null && hy < top2.center[1] + top2.half[1] - 0.9 && hy > skTop - 1.6;
    check(holeOk, `てっぺんの 穴は あいて いる（穴の 底の 立てる 高さ ${hy}、わくの 上 ${f1(top2.center[1] + top2.half[1])}、頭がいの 上 ${f1(skTop)}）`);
    if (holeOk) {
      const okh = walkTo({ x: hole.x, z: hole.z, y: hy }, { maxN: 300, r: 0.5, dy: 1.2, noJump: true });
      const p = me().position;
      check(okh, `穴の 中へ おりられる いま (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)})`);
    }
  }
  check(hp() === 20, `体力は そのまま ${hp()}`);
  h.input.releaseAll();
  return { ok, log };
}, [SIDE, START, process.env.ARMS === '1']);
console.log(result.log.join('\n'));
console.log(JSON.stringify({ ok: result.ok }));
await browser.close();
process.exit(result.ok ? 0 : 1);
