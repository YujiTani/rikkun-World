// #293 試作: 大きい がしゃどくろ（?proto=gashaBig）の「全身に のれる」を、本物の プレイヤーの 動き（前進・ジャンプの 入力を コマ送り）で 確かめる。
//   ・うでの 道: 地面 → 手（指）→ 前わん → 上わん → 肩の ぬの（体を 45 度 むけても）   ARMS=1（ふだんは しない。START の 向きを 45 に する）
//   ・間欠泉 → 肩の 雲 → 胴体の 上（えり・さこつ）→ 首の よこ → 背中の おなか（おりる）
//   ・肩の 雲 → 雲の らせん（rise）→ 頭の てっぺんの わく → 顔の 前の ふち（60 ステップ 落ちずに 立つ）→ てっぺんの 穴に おりて みる（ふさがって いない）
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
await page.goto(`${BASE}/?proto=gashaBig&menu=0&nosave=1&char=boy${process.env.EXTRA ?? ''}`);
await page.waitForFunction(() => window.__rikkun?.ready === true && !!window.__gashaBig, null, { timeout: 300_000 });
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
  /** その 柱の 固い マスの かたまり（デバッグ用。"下-上" の 高さ） */
  const colRuns = (x, z, y0 = 150, y1 = 200) => { const runs = []; let st = null; for (let j = y0; j <= y1; j++) { const s = g.solidAt(Math.floor(x), j, Math.floor(z)); if (s && st === null) st = j; if (!s && st !== null) { runs.push(`${st}-${j - 1}`); st = null; } } if (st !== null) runs.push(`${st}-${y1}`); return runs.join(' '); };
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

  /** 固い マス（からだの 当たり ＋ 地面などの ブロック） */
  const solid = (x, y, z) => g.solidAt(x, y, z) || !['air', 'water', 'outside'].includes(h.world.getBlock(x, y, z));
  /** 立てる マス（足の マス y: 足もと y-1 が 固く、y・y+1 が あいて いる） */
  const standable = (x, y, z) => solid(x, y - 1, z) && !solid(x, y, z) && !solid(x, y + 1, z);
  /** マス（足の 高さ y）が その 箱の 上に 立って いる 点か（足もとの マスの 中心が 箱の 中・または すぐ 近く） */
  const onBox = (c, x, y, z, m = 0.55) => {
    const d = [x + 0.5 - c.center[0], y - 0.5 - c.center[1], z + 0.5 - c.center[2]];
    for (let k = 0; k < 3; k++) { const a = c.axes[k]; if (Math.abs(d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) > c.half[k] + m) return false; }
    return true;
  };
  /** 今の 場所から、goal(x, y, z) を みたす 立てる マスへの 道（マスの 列）。1 マス 上り・3 マス 下り まで、ななめ なし */
  const findPath = (goal, R = 34, relaxed = false) => {
    const p0 = me().position, sx = Math.floor(p0.x), sz = Math.floor(p0.z);
    let sy = Math.floor(p0.y + 0.01);
    if (!standable(sx, sy, sz)) { for (let d = -1; d <= 1 && !standable(sx, sy, sz); d++) if (standable(sx, Math.floor(p0.y) + d, sz)) sy = Math.floor(p0.y) + d; }
    const key = (x, y, z) => `${x},${y},${z}`;
    const prev = new Map([[key(sx, sy, sz), null]]);
    const q = [[sx, sy, sz]];
    for (let qi = 0; qi < q.length; qi++) {
      const [x, y, z] = q[qi];
      if (goal(x, y, z)) { const out = []; let k = key(x, y, z); while (k) { out.push(k.split(',').map(Number)); k = prev.get(k); } return out.reverse(); }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (Math.abs(nx - sx) > R || Math.abs(nz - sz) > R) continue;
        for (const dy of [0, 1, -1, -2, -3]) {
          const ny = y + dy;
          if (dy === 1 && (solid(x, y + 2, z) || (!relaxed && (solid(x, y + 3, z) || solid(nx, y + 3, nz))))) continue; // ジャンプの 頭の 上が ふさがって いる（とびあがる 高さ 1.25 + 背たけ 1.8）
          if (!standable(nx, ny, nz)) continue;
          if (dy < 0 && (solid(nx, y, nz) || solid(nx, y + 1, nz))) continue;
          const k = key(nx, ny, nz);
          if (prev.has(k)) continue;
          prev.set(k, key(x, y, z)); q.push([nx, ny, nz]);
          break;
        }
      }
    }
    return null;
  };
  /** 道を 本物の 入力で 歩く。できたら { ok, at }（失敗した マス）。2 マスごとの 点を めざす */
  const followPath = (path) => {
    for (let i = 1; i < path.length; i++) {
      const last = i === path.length - 1;
      if (!last && i % 2 === 1 && Math.abs(path[i][1] - path[i + 1]?.[1]) === 0) continue;
      const t = { x: path[i][0] + 0.5, z: path[i][2] + 0.5, y: path[i][1] };
      if (!walkTo(t, { maxN: 200, r: 0.45, dy: 1.2 })) return { ok: false, at: path[i], i, n: path.length };
    }
    return { ok: true, at: path[path.length - 1], i: path.length - 1, n: path.length };
  };
  const goOnBox = (label, c, extra = () => true) => {
    const path = findPath((x, y, z) => onBox(c, x, y, z) && extra(x, y, z));
    if (!path) { check(false, `${label}: 箱 ${c.name} の 上に 立てる 道が みつからない\n${dumpAround()}`); return false; }
    const r = followPath(path);
    stopAll();
    const p = me().position;
    check(r.ok, `${label}: ${c.name} の 上へ 道 ${path.length} マス を 歩いた。いま (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)})${r.ok ? '' : ` 止まった マス ${r.at.join(',')}（${r.i}/${r.n}）\n道 ${lastTrace.join(' ')}\n${dumpAround()}`}`);
    return r.ok;
  };
  // ============================================================ うでの 道（地面 → 手 → 前わん → 上わん → 肩の ぬの）
  if (arms) {
    const S = side === 'L' ? 'L' : 'R';
    // 地面から 手の 先の 前へ
    const hand = H(`hand${S}`);
    // はじめの 立ち位置: 手の 先から 6 ブロック 前
    const tipD = hand.half[2] + 6;
    const ax = hand.axes[2];
    const sx = hand.center[0] + ax[0] * tipD, sz = hand.center[2] + ax[2] * tipD;
    h.player.set({ position: { x: sx, y: h.world.groundHeight(Math.floor(sx), Math.floor(sz)) + 1, z: sz }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    for (let i = 0; i < 30; i++) h.step(1);
    // 道: 指 → てのひら → 前わん → 上わん → 肩の ぬの。1 つ 前の 箱の 上から 次の 箱の 上へ、本物の 入力で 歩く（箱の 上に 立てる 道を さがす）
    let allOk = true;
    for (const [label, name] of [['指', `handFingersA${S}`], ['てのひら', `hand${S}`], ['前わん', `foreArm${S}`], ['上わん', `upperArm${S}`]]) {
      if (!goOnBox(label, H(name))) { allOk = false; break; }
    }
    if (allOk) {
      // 上わんの 上から 肩（うでの 足場の 雲・肩の 雲・えり）へ、そのまま 雲の らせんを のぼって 頭の てっぺんまで（地面から 1 回も ワープしない）
      const scRe = new RegExp(`^(shoulder${S}\\d+|armStep${S})$`);
      const sc = hits.filter((c) => scRe.test(c.name));
      const goalC = (x, y, z) => sc.some((c) => onBox(c, x, y, z));
      const pathC = findPath(goalC, 40);
      if (!pathC) { check(false, `上わん → 肩: 道が みつからない\n${dumpAround()}`); allOk = false; }
      else { const r = followPath(pathC); stopAll(); const p = me().position; check(r.ok, `上わん → 肩（雲）へ 道 ${pathC.length} マス。いま (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)})${r.ok ? '' : `（止まった ${r.at.join(',')}）\n${dumpAround()}`}`); allOk = r.ok; }
      if (allOk) {
        const tops = hits.filter((c) => /^skullTop\d$/.test(c.name));
        const pathH = findPath((x, y, z) => tops.some((c) => onBox(c, x, y, z)), 60);
        if (!pathH) { check(false, `肩 → 雲の らせん → 頭の てっぺん: 道が みつからない`); allOk = false; }
        else { const r = followPath(pathH); stopAll(); const p = me().position; check(r.ok, `肩 → 雲の らせん → 頭の てっぺんの わく（道 ${pathH.length} マス）。いま (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)})${r.ok ? '' : `（止まった ${r.at.join(',')}）\n${dumpAround()}`}`); allOk = r.ok; }
      }
    }
    stopAll();
    if (allOk) check(true, `うでの 道: 地面 → 手 → 前わん → 上わん → 肩 → 雲の らせん → 頭の てっぺんまで 歩けた（からだ ${f1(g.info().yawDeg)} 度）`);
    h.input.releaseAll();
    return { ok, log };
  }

  // ============================================================ 間欠泉 → 肩の 雲
  const S = side;
  const geys = g.geysers().filter((q) => ['rising', 'up', 'shrinking'].includes(q.state));
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

  // ============================================================ 胴体の 上（箱を 目あてに 道を さがして、本物の 入力で 歩く）
  const chestTop = H('chestTop'), neck = H('neck'), collar = H('collarbone'), waist = H('torsoWaist');
  const chestMid = H('chestMid2'), skullTopBox = H('skullTop0');
  if (goOnBox('胴体の 上（えり）', chestTop)) {
    check(!inBody(), '胴体の 中に 入って いない');
    const s0 = stand(20); check(!s0.off && s0.drop <= 1.05, `えりの 上に 落ちずに 立てる（落ちても 1 段まで）落ち ${f1(s0.drop)}`);
    // 首の 上は あたまが かぶさって いて 2 マス あかない ので、首の すぐ よこ（水平 3 ブロック いない・首の 高さ）に 立てる ことを 見る
    if (goOnBox('胸から 首の よこへ', chestTop, (x, y, z) => Math.hypot(x + 0.5 - neck.center[0], z + 0.5 - neck.center[2]) < 3.2 && y >= neck.center[1] - 3)) { const s1 = stand(30); check(!s1.off && s1.drop < 0.2, `首の よこに 落ちずに 立てる 落ち ${f1(s1.drop)}`); check(!inBody(), '首の まわりでも 中に 入って いない'); }
    goOnBox('さこつの 上', collar);
  }
  goOnBox('胸の 上の 面（胸の まんなか）', chestMid, (x, y) => y >= 170);
  check(!inBody(), '胸の 上でも 中に 入って いない');
  goOnBox('おなか（背中がわ）', waist, (x, y, z) => onBox(waist, x, y, z) && z < waist.center[2]);
  check(!inBody(), 'おなかの 中に 入って いない');
  void skullTopBox;
  const sgn = side === 'L' ? 1 : -1;

  // ============================================================ 肩の 雲 → 小さな 雲の らせん（rise）→ 頭の てっぺん → 顔の 前
  // 肩の 雲の 上から はじめて、本物の 入力で らせんの 雲を 1 こずつ とび移って のぼる
  h.player.set({ position: { x: cloud.center[0], y: cloudTop, z: cloud.center[2] }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  for (let i = 0; i < 30; i++) h.step(1);
  const top2 = H('skullTop2');
  let climbed = false;
  {
    const tops = hits.filter((c) => /^skullTop\d$/.test(c.name));
    const path = findPath((x, y, z) => tops.some((c) => onBox(c, x, y, z)), 60);
    if (!path) check(false, '肩の 雲 → 雲の らせん → 頭の てっぺん: 道が みつからない');
    else {
      const r = followPath(path);
      climbed = r.ok;
      if (!r.ok) check(false, `らせんの 途中で とまった マス ${r.at.join(',')}（${r.i}/${r.n}）道 ${lastTrace.join(' ')}\n${dumpAround()}`);
      log.push(`  雲の らせんの 道 ${path.length} マス、のぼった 高さ ${path[0][1]} → ${path[path.length - 1][1]}`);
    }
  }
  stopAll();
  check(climbed, `肩の 雲 → 雲の らせん → 頭の てっぺんの わく。いま (${f1(me().position.x)}, ${f1(me().position.y)}, ${f1(me().position.z)})`);
  if (climbed) {
    // 前の わく（穴の 前）→ 顔の 前の ふち（からだの 前 = 軸 2）
    const a2 = top2.axes[2];
    const edge = { x: top2.center[0] + a2[0] * (top2.half[2] - 0.6), z: top2.center[2] + a2[2] * (top2.half[2] - 0.6) };
    edge.y = topAt(edge.x, edge.z, top2.center[1] + 4);
    let okw = false;
    {
      const pf = findPath((x, y, z) => onBox(top2, x, y, z) && Math.hypot(x + 0.5 - edge.x, z + 0.5 - edge.z) < 1.3, 40);
      if (pf) okw = followPath(pf.length > 3 ? pf.slice(0, -1) : pf).ok; // ふちの 1 マス 手前まで あるいて 止まる（いきおいで ふちを こえない）
    }
    const s = stand(60);
    check(okw && !s.off && s.drop < 0.2, `顔の 前の ふち（頭の てっぺんの 前）に 落ちずに 立てる (${f1(edge.x)}, ${edge.y}, ${f1(edge.z)}) → (${f1(s.p.x)}, ${f1(s.p.y)}, ${f1(s.p.z)}) 60 ステップ 立って 落ち ${f1(s.drop)}`);
    // てっぺんの 穴: 穴の まんなかへ あるいて おりられる（ふさがって いない）
    const sk = H('skull');
    const hole = { x: top2.center[0] - a2[0] * (top2.half[2] + 1.2), z: top2.center[2] - a2[2] * (top2.half[2] + 1.2) };
    const hy = topAt(hole.x, hole.z, sk.center[1] + sk.half[1] + 3);
    const skTop = sk.center[1] + sk.half[1];
    const holeOk = hy !== null && hy <= edge.y && hy > skTop - 1.6; // 穴の 底が わくより 高く ない（ふさがって いない）
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
