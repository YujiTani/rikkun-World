// #293 試作: 大きい がしゃどくろ（?proto=gashaBig）の「全身に のれる」を、本物の プレイヤーの 動き（前進・ジャンプの 入力を コマ送り）で 確かめる。
//   ・うでの 道: 地面 → 手（指）→ 前わん → 上わん → 肩の ぬの（体を 45 度 むけても）   ARMS=1（ふだんは しない。START の 向きを 45 に する）
//   ・間欠泉 → 肩の 雲 → 胴体の 上（えり・さこつ）→ 首の よこ → 背中の おなか（おりる）
//   ・肩の 雲 → 雲の 道 → 飛び降り（4〜6 ブロック）→ 背中の 穴の 床の だん → とぎれた 道の ふち（もどれない・走って ジャンプしても わたれない）→ 弓で コアを ねらう → ふり落とし
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
  let lastReach = null; // 道が みつからない とき: 歩いて 行けた いちばん 高い マス（なぜ とまるか 見る ため）
  const findPath = (goal, R = 34, relaxed = false, o = {}) => {
    const drops = [0, 1, -1, -2, -3]; for (let d = 4; d <= (o.maxDrop ?? 3); d++) drops.push(-d);
    const p0 = me().position, sx = Math.floor(p0.x), sz = Math.floor(p0.z);
    let sy = Math.floor(p0.y + 0.01);
    if (!standable(sx, sy, sz)) { for (let d = -1; d <= 1 && !standable(sx, sy, sz); d++) if (standable(sx, Math.floor(p0.y) + d, sz)) sy = Math.floor(p0.y) + d; }
    const key = (x, y, z) => `${x},${y},${z}`;
    const prev = new Map([[key(sx, sy, sz), null]]);
    const q = [[sx, sy, sz]];
    lastReach = null;
    for (let qi = 0; qi < q.length; qi++) {
      const [x, y, z] = q[qi];
      if (!lastReach || y > lastReach[1]) lastReach = [x, y, z];
      if (goal(x, y, z)) { const out = []; let k = key(x, y, z); while (k) { out.push(k.split(',').map(Number)); k = prev.get(k); } return out.reverse(); }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (Math.abs(nx - sx) > R || Math.abs(nz - sz) > R) continue;
        for (const dy of drops) {
          const ny = y + dy;
          if (o.minY !== undefined && ny < o.minY) continue;
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
    for (const [label, name] of [['指', `handFingersA${S}`], ['てのひら', `hand${S}`], ['前わん', `foreArm${S}`], ['上わん（ひじ）', `upperArmMid${S}`], ['上わん', `upperArm${S}`]]) {
      if (!goOnBox(label, H(name))) { allOk = false; break; }
    }
    if (allOk) {
      // 上わんの 上から 肩（うでの 足場の 雲・肩の 雲・えり）へ、そのまま 雲の らせんを のぼって 頭の てっぺんまで（地面から 1 回も ワープしない）
      const scRe = new RegExp(`^(shoulder${S}\\d+|armStep${S})$`);
      const sc = hits.filter((c) => scRe.test(c.name));
      const goalC = (x, y, z) => sc.some((c) => onBox(c, x, y, z));
      const pathC = findPath(goalC, 40);
      if (!pathC) { check(false, `上わん → 肩: 道が みつからない（歩いて 行けた いちばん 高い マス ${lastReach?.join(',')}）\n${dumpAround()}`); allOk = false; }
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
  void waist;
  void skullTopBox;
  const sgn = side === 'L' ? 1 : -1;

  // ============================================================ 肩の 雲 → 雲の 道 → 飛び降り → 背中の 穴の 床の だん → とぎれた 道の 手前（本物の 入力）→ 弓で コアを ねらう
  {
    const toCloud = () => {
      h.player.set({ position: { x: cloud.center[0], y: Math.ceil(cloudTop - 0.2), z: cloud.center[2] }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      for (let i = 0; i < 30; i++) h.step(1);
    };
    toCloud();
    log.push(`  雲 ${cloud.name} 上 ${f1(cloudTop)} 立った 位置 ${JSON.stringify(me().position)} 地面 ${me().onGround}`);
    const jb = H('backJump'), fl = H('chestCoreFloor'), core = H('core'), far = H('chestFarFloor');
    // 1) 肩の 雲から 雲の 道を 歩いて 最後の 雲（backJump）の 上へ
    const pj = findPath((x, y, z) => onBox(jb, x, y, z), 40);
    if (!pj) { check(false, `肩の 雲 → 雲の 道: 最後の 雲へ 道が みつからない（いちばん 高い マス ${lastReach?.join(',')}）`); }
    else {
      const r = followPath(pj); stopAll();
      const p = me().position;
      check(r.ok, `肩の 雲 → 雲の 道 → 最後の 雲（道 ${pj.length} マス）。いま (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)})${r.ok ? '' : `（止まった ${r.at.join(',')}）\n${dumpAround()}`}`);
      if (r.ok) {
        // 2) 飛び降りる: 忍者の足袋を ぬいで（落下ダメージが 出る ように）、床の だん（外へ のびた 床）へ まっすぐ 歩き出す
        h.armor.set(null, null, null, null);
        h.combat.setHp?.(20);
        const s1 = stand(20);
        const top0 = me().position.y;
        const fa = fl.axes[2]; // 道の 前向き
        const tgt = { x: fl.center[0] + fa[0] * 1.8, z: fl.center[2] + fa[2] * 1.8 }; // 雲の 下の 床の だんの すこし 先（雲の ふちを こえて おりる）
        tgt.y = topAt(tgt.x, tgt.z, fl.center[1] + fl.half[1] + 1.2); // 上の 雲が かぶって いるので 床の だんの すぐ 上から 下をさがす
        const okj = walkTo({ x: tgt.x, z: tgt.z, y: tgt.y }, { maxN: 400, r: 0.9, dy: 1.7, noJump: true });
        stopAll();
        const st = stand(40), pp = me().position;
        const dropH = top0 - pp.y;
        log.push(`  飛び降り: 雲の 上 ${f1(top0)} → 床の だん ${f1(pp.y)}（${f1(dropH)} ブロック）体力 ${hp()}`);
        check((st.onGround || !st.off) && st.drop < 0.1 && Math.hypot(pp.x - fl.center[0], pp.z - fl.center[2]) < 3.5 && Math.abs(pp.y - (fl.center[1] + fl.half[1])) < 2, `雲の ふちから 歩いて 飛び降りて 床の だんに 立てた (${f1(pp.x)}, ${f1(pp.y)}, ${f1(pp.z)})`);
        check(dropH >= 4 && dropH <= 6.6, `飛び降りの 高さ 4〜6 ブロック（${f1(dropH)}）`);
        check(hp() < 20 && hp() >= 15, `足袋が なくても しなない。小さな ダメージ（体力 20 → ${hp()}）`);
        void s1;
        // 3) もどれない: 床の だんから 地面に おりずに（これより 低くは おりない）最後の 雲・肩の 雲へは 道が ない
        const y0 = Math.floor(pp.y) - 1;
        const back = findPath((x, y, z) => onBox(jb, x, y, z) || clouds.some((c) => onBox(c, x, y, z)), 40, false, { maxDrop: 6, minY: y0 });
        check(back === null, `床の だんから 雲の 道・肩の 雲へは もどれない（${back ? '道が ある!' : '道なし'}）`);
        // 4) 道を すすむ: とぎれた 穴の ふち（手前の 床の はし）まで
        const edge = { x: fl.center[0] + fa[0] * 2.2, z: fl.center[2] + fa[2] * 2.2 };
        edge.y = topAt(edge.x, edge.z, fl.center[1] + fl.half[1] + 1.2);
        const okE = walkTo({ x: edge.x, z: edge.z, y: edge.y }, { maxN: 400, r: 0.6, dy: 1.7, noJump: true });
        stopAll();
        const se = stand(30), pe = me().position;
        check(se.drop < 1.05 && Math.hypot(pe.x - fl.center[0], pe.z - fl.center[2]) < 6, `穴の ふち（手前の 床の はし）に 立てる (${f1(pe.x)}, ${f1(pe.y)}, ${f1(pe.z)})。むこうの 床まで 横 ${f1(Math.hypot(far.center[0] - pe.x, far.center[2] - pe.z) - far.half[2])} ブロック`);
        // 5) 走って ジャンプしても むこうの 床には とどかない（おちる）
        {
          const dx = core.center[0] - pe.x, dz = core.center[2] - pe.z, yaw = (Math.atan2(dx, -dz) * 180) / Math.PI;
          // 少し 手前（手前の 床の 上で 2 ブロック 助走）から
          const bx0 = pe.x - fa[0] * 1.8, bz0 = pe.z - fa[2] * 1.8, by0 = topAt(bx0, bz0, pe.y + 3) ?? pe.y;
          h.player.set({ position: { x: bx0, y: by0, z: bz0 }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
          for (let i = 0; i < 10; i++) h.step(1);
          let landed = null, jumped = false, minD = 1e9, maxAlongAbove = -99;
          const farTop = far.center[1] + far.half[1], farEdge = (far.center[0] - pe.x) * fa[0] + (far.center[2] - pe.z) * fa[2] - far.half[2] * 0.7;
          for (let n = 0; n < 220; n++) {
            const q = me(), p = q.position;
            h.player.set({ yaw });
            h.input.press('moveForward'); h.input.press('run');
            const along = (p.x - pe.x) * fa[0] + (p.z - pe.z) * fa[2];
            if (!jumped && along > -0.3 && q.onGround) { h.input.press('jump'); jumped = true; } else h.input.release('jump');
            h.step(1);
            const q2 = me();
            const dFar = Math.hypot(q2.position.x - far.center[0], q2.position.z - far.center[2]);
            minD = Math.min(minD, dFar);
            if (q2.position.y >= farTop - 0.3) maxAlongAbove = Math.max(maxAlongAbove, (q2.position.x - pe.x) * fa[0] + (q2.position.z - pe.z) * fa[2]);
            if (jumped && q2.onGround && n > 12) { landed = { ...q2.position }; break; }
            if (q2.position.y < pe.y - 9) break;
          }
          stopAll();
          const fin = me().position;
          const onFar = landed && Math.hypot(landed.x - far.center[0], landed.z - far.center[2]) < far.half[2] + 1.5 && Math.abs(landed.y - (far.center[1] + far.half[1])) < 2.5;
          check(!onFar, `走って ジャンプしても 穴は わたれない（むこうの 床に ${onFar ? '着いた!' : '着かない'}。いま (${f1(fin.x)}, ${f1(fin.y)}, ${f1(fin.z)})、むこうの 床に いちばん ちかづいた 横の きょり ${f1(minD)}、むこうの 床と おなじ 高さ いじょうで 進めた 横の きょり ${f1(maxAlongAbove)} / むこうの 床の ふち ${f1(farEdge)}）`);
        }
        // 6) 弓で コアを ねらう（穴の 手前の 床から）
        h.armor.set(null, null, null, 'ninja_tabi'); // もどる ところから ダメージを 気に しない
        h.combat.setHp?.(20);
        // 穴の ふちから 1 ブロック 手前に 立って ねらう（ふちを こえて おちない）
        const sx2 = pe.x - fa[0] * 1.0, sz2 = pe.z - fa[2] * 1.0, sy2 = topAt(sx2, sz2, pe.y + 2) ?? pe.y;
        h.player.set({ position: { x: sx2, y: sy2, z: sz2 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        for (let i = 0; i < 20; i++) h.step(1);
        const pp2 = me().position;
        const stand0 = { x: pp2.x, y: pp2.y, z: pp2.z };
        const eye = { x: pp2.x, y: pp2.y + 1.6, z: pp2.z };
        const dxC = core.center[0] - eye.x, dyC = core.center[1] - eye.y, dzC = core.center[2] - eye.z, hdC = Math.hypot(dxC, dzC);
        // 刀の とどく 長さ（2〜3 ブロック）より はなれて いる
        const cd = Math.hypot(dxC, dyC, dzC) - core.half[0];
        check(cd > 3.6, `穴の ふちから コアまで ${f1(cd)} ブロック（刀の とどく 3 より ずっと とおい）`);
        h.settings.set('thirdPersonDistance', 0); // 矢は カメラの まんなかの 向きへ 出る ので 一人称で ねらう
        h.inventory.setSlot(0, { item: 'yumi', count: 1 });
        h.inventory.setSlot(1, { item: 'ya', count: 20 });
        h.inventory.select(0);
        {
          const L = Math.hypot(dxC, dyC, dzC), ry = h.yokai.raycast({ x: eye.x, y: eye.y, z: eye.z }, { x: dxC / L, y: dyC / L, z: dzC / L }, 40);
          const ci = g.colliders().findIndex((c) => c.name === 'core');
          check(ry && ry.id === 900000000 + ci, `手前の 床から コアへ まっすぐ 線が 通る（矢の 線の 当たり: ${ry ? `${ry.id - 900000000 === ci ? 'コア' : '別の 箱 ' + (ry.id - 900000000)}、${f1(ry.distance)} ブロック` : 'なし'}）`);
        }
        const hp0 = g.hp();
        let hitPart = null, warn0 = null;
        for (const dPitch of [0, 1.5, 3, -1.5, 5, -3]) {
          const yaw = (Math.atan2(dxC, -dzC) * 180) / Math.PI, pitch = (Math.atan2(dyC, hdC) * 180) / Math.PI + dPitch;
          h.player.set({ position: stand0, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
          for (let i = 0; i < 6; i++) h.step(1);
          h.input.press('primary');
          for (let i = 0; i < 50; i++) { h.player.set({ yaw, pitch }); h.step(1); }
          const aimP = h.aim.point(); const ev0 = h.bow.events().slice(-2).map((e) => e.type);
          h.input.release('primary');
          const arrTr = [];
          for (let i = 0; i < 90; i++) {
            h.step(1);
            if (dPitch === 0 && i < 40 && i % 4 === 0) { const a = h.bow.arrows()[0]; if (a) arrTr.push(`(${f1(a.position.x)},${f1(a.position.y)},${f1(a.position.z)})`); }
            const cw = g.info().coreWarn;
            if (!warn0 && cw.warnLeft > 0) { warn0 = { pos: { ...me().position }, hp: g.hp(), yaw: me().yaw, steps: 0 }; }
            if (warn0 && cw.warnLeft > 0) warn0.steps++;
          }
          if (dPitch === 0) log.push(`  camera ${JSON.stringify(h.camera.get())} player ${JSON.stringify(me())}`);
          if (dPitch === 0) log.push(`  eye ${f1(eye.x)},${f1(eye.y)},${f1(eye.z)} core ${f1(core.center[0])},${f1(core.center[1])},${f1(core.center[2])} aim ${JSON.stringify(aimP)} ev ${ev0} 矢 ${arrTr.join(' ')}`);
          const li = g.info().lastHit;
          log.push(`  ねらい 上へ ${dPitch} 度: 当たり ${li ? `${li.part}(${li.source})` : 'なし'} 体力 ${g.hp()}`);
          if (li && li.part === 'core') { hitPart = li; break; }
        }
        check(hitPart !== null && hitPart.part === 'core', `弓の 矢が コアに 当たる（体力 ${hp0} → ${g.hp()}、${hitPart ? `当たった 部位 ${hitPart.part}・${hitPart.source}` : '当たらない'}）`);
        check(warn0 !== null, `コアを たたくと まず 予兆（むてきの あいだ）が 始まる${warn0 ? `（${warn0.steps} コマ ぶん 見えた。調整表 ${f1(1.5 * 60)} コマ）` : ''}`);
        // 予兆の あいだは ふり落とされて いない（まだ 道の 中）。コアは むてきで ダメージ 0
        {
          const dcW = warn0 ? Math.hypot(warn0.pos.x - core.center[0], warn0.pos.y - core.center[1], warn0.pos.z - core.center[2]) : 0;
          check(warn0 !== null && dcW < 12 && !inBody(), `予兆の あいだは まだ 道の 中に いる（コアから ${f1(dcW)}）`);
        }
        const hpBefore = g.info().hp;
        const dmg = g.damage('core', 5);
        check(g.info().hp === hpBefore || g.info().coreWarn.warnLeft <= 0, `予兆の あいだ（むてき）は コアに ダメージが 入らない（${hpBefore} → ${g.info().hp}、はじかれた ${g.info().deflects} 回、damage() ${dmg}）`);
        // 予兆 → ふり落とし: カメラの 向きの 変化を ぜんぶ 記録
        h.armor.set(null, null, null, null); h.combat.setHp?.(20); // 着地ダメージが 入るのを 見るため 足袋を ぬぐ
        const hpPre = hp();
        const yaw0 = me().yaw;
        let launched = null, spinSum = 0, prevYaw = me().yaw, maxSpeedXZ = 0, sawSpin = false, steps = 0, hpAtLaunch = 0;
        const startP = { ...me().position };
        for (let i = 0; i < 400; i++) {
          h.step(1); steps++;
          const cw = g.info().coreWarn, q = me();
          let dy = q.yaw - prevYaw; while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
          spinSum += dy; prevYaw = q.yaw;
          if (cw.spinLeft > 0) sawSpin = true;
          if (!launched && cw.throwLeft > 0) { launched = { ...q.position }; hpAtLaunch = hp(); }
          if (i % 10 === 0) log.push(`    [${i}] (${f1(q.position.x)}, ${f1(q.position.y)}, ${f1(q.position.z)}) 地面 ${q.onGround} 予兆 ${f1(cw.warnLeft)} 飛 ${f1(cw.throwLeft)} 回 ${f1(cw.spinLeft)} 体力 ${hp()}`);
          if (launched && q.onGround && cw.throwLeft <= 0 && cw.spinLeft <= 0 && i > 20) break;
        }
        const landedHp = hp();
        const q = me().position, dc = Math.hypot(q.x - core.center[0], q.y - core.center[1], q.z - core.center[2]);
        const farDist = Math.hypot(q.x - core.center[0], q.z - core.center[2]);
        log.push(`  ふり落とし: 予兆から ${steps} コマ。飛ばされた 先 (${f1(q.x)}, ${f1(q.y)}, ${f1(q.z)})、コアから 横 ${f1(farDist)}、体の 向き 合計 ${f1(spinSum)} 度、体力 ${hpPre} → ${hp()}`);
        check(launched !== null && hpAtLaunch === hpPre, `ふり落とし自体では ダメージなし（飛ばす 直前 ${hpAtLaunch}、前 ${hpPre}）`);
        check(dc > 16 && !inBody(), `コアが たたかれて 背中の 外の 遠くへ ふり落とされた（コアから ${f1(dc)}、いま (${f1(q.x)}, ${f1(q.y)}, ${f1(q.z)})）`);
        check(sawSpin && Math.abs(spinSum - 360) < 20, `飛ばされている あいだ カメラが 横に 1 回転（合計 ${f1(spinSum)} 度）`);
        { let d = me().yaw - yaw0; while (d > 180) d -= 360; while (d < -180) d += 360; check(Math.abs(d) < 5, `着地の 前に 元の 向きに もどる（向きの ずれ ${f1(d)} 度）`); }
        for (let i = 0; i < 240; i++) { h.step(1); if (i % 40 === 0) { const t = me(); log.push(`    [後 ${i}] (${f1(t.position.x)}, ${f1(t.position.y)}, ${f1(t.position.z)}) v ${f1(t.velocity.x)},${f1(t.velocity.y)},${f1(t.velocity.z)} 地面 ${t.onGround}`); } }
        const q3 = me();
        log.push(`  ふり落とされた あと: (${f1(q3.position.x)}, ${f1(q3.position.y)}, ${f1(q3.position.z)}) 体力 ${hp()}`);
        void startP; void maxSpeedXZ;
        check(hp() > 0 && landedHp < hpPre, `ふり落とされても しなない。着地ダメージは ふつうに 入る（足袋なし 体力 ${hpPre} → ${landedHp}）`);
      }
    }
    stopAll();
  }
  h.input.releaseAll();
  return { ok, log };
}, [SIDE, START, process.env.ARMS === '1']);
console.log(result.log.join('\n'));
console.log(JSON.stringify({ ok: result.ok }));
await browser.close();
process.exit(result.ok ? 0 : 1);
